"""Shared pinned messages: bounded list, conversation serialization and safe events."""
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from .models import Conversation, ConversationMember, Message, User
from .platform_models import PinnedMessage, MessageMedia, MessageHidden, Family, FamilyMember, PrivateMessageRequest
from .message_attachment_models import MessageAttachment
from .group_models import MessageGroup
from . import message_tools, group_policy
from .runtime_tasks import database_task

router = APIRouter(prefix='/v1/conversations', tags=['message-pins'])
_write_access = _notify = None
LIMIT = 5


def register(access, notify):
    global _write_access, _notify
    _write_access, _notify = access, notify


def access(db, cid, uid, token):
    conversation = message_tools.access(db, cid, uid, token)
    if db.scalar(select(PrivateMessageRequest.id).where(PrivateMessageRequest.conversation_id == cid,
            PrivateMessageRequest.recipient_id == uid, PrivateMessageRequest.status == 'pending')):
        raise HTTPException(403, 'Önce mesaj isteğini kabul edin.')
    return conversation


def can_manage(db, conversation, uid):
    cid = conversation.id
    if conversation.type == 'welcome' or conversation.is_ephemeral:
        return False
    if db.get(MessageGroup, cid):
        return not group_policy.settings(db, cid).closed and group_policy.role(db, cid, uid) in ('owner', 'moderator')
    family = db.scalar(select(Family).where(Family.chat_conversation_id == cid))
    if family:
        if family.closed:
            return False
        member = db.scalar(select(FamilyMember).where(FamilyMember.family_id == family.id, FamilyMember.user_id == uid))
        return family.owner_id == uid or bool(member and member.role in ('owner', 'admin'))
    return conversation.type == 'dm'


@router.get('/{conversation_id}/pins')
@database_task
async def list_pins(conversation_id: str, x_eris_dm_vault: str | None = Header(None),
        db: Session = Depends(get_db), user: User = Depends(message_tools.authenticated)):
    conversation = access(db, conversation_id, user.id, x_eris_dm_vault)
    hidden = select(MessageHidden.message_id).where(MessageHidden.user_id == user.id)
    # Select metadata only; do not load file bytes or duplicate message contents in storage.
    rows = db.execute(select(PinnedMessage.id, PinnedMessage.created_at.label('pinned_at'),
        Message.id.label('message_id'), Message.sender_id, Message.text, Message.created_at,
        User.nickname.label('sender_nickname'), MessageMedia.media_type, MessageAttachment.filename)
        .join(Message, Message.id == PinnedMessage.message_id).join(User, User.id == Message.sender_id)
        .outerjoin(MessageMedia, MessageMedia.message_id == Message.id)
        .outerjoin(MessageAttachment, MessageAttachment.message_id == Message.id)
        .where(PinnedMessage.conversation_id == conversation_id, Message.conversation_id == conversation_id,
            Message.id.not_in(hidden), Message.expires_at.is_(None), func.coalesce(MessageMedia.temporary, False).is_(False))
        .order_by(PinnedMessage.id.desc()).limit(LIMIT)).mappings()
    items = [{'pin_id':r['id'], 'pinned_at':r['pinned_at'], 'message':{
        'id':r['message_id'], 'conversation_id':conversation_id, 'sender_id':r['sender_id'],
        'sender_nickname':r['sender_nickname'], 'text':r['text'], 'created_at':r['created_at'],
        'media_type':r['media_type'], 'media_name':r['filename'], 'is_pinned':True}} for r in rows]
    if conversation.type == 'welcome' or conversation.is_ephemeral:
        items = []
    return {'items':items, 'can_manage':can_manage(db, conversation, user.id), 'limit':LIMIT}


async def change(db, conversation_id, message_id, user, token, pinned):
    conversation = access(db, conversation_id, user.id, token)
    # All pin changes in a conversation share one lock, including DM and family chats.
    # Groups use the same lock ordering as membership/role operations.
    group_policy.require_pin(db, conversation_id, user.id)
    # Family balance operations also lock user before family. Keep that order.
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    db.scalar(select(Family.id).where(Family.chat_conversation_id == conversation_id).with_for_update())
    db.scalar(select(Conversation.id).where(Conversation.id == conversation_id).with_for_update())
    conversation = access(db, conversation_id, user.id, token)
    if not can_manage(db, conversation, user.id):
        raise HTTPException(403, 'Bu sohbette sabitlemeleri yalnızca yöneticiler değiştirebilir.')
    _write_access(db, conversation_id, user, token)
    row = db.scalar(select(PinnedMessage).where(PinnedMessage.conversation_id == conversation_id,
        PinnedMessage.message_id == message_id).execution_options(populate_existing=True))
    changed = False
    if pinned:
        message_tools.visible_message(db, conversation_id, user.id, message_id)
        message = db.scalar(select(Message).where(Message.id == message_id).with_for_update().execution_options(populate_existing=True))
        if message is None:
            raise HTTPException(404, 'Mesaj silindi.')
        message_tools.visible_message(db, conversation_id, user.id, message_id)
        media = db.get(MessageMedia, message_id)
        if message.expires_at or media and media.temporary:
            raise HTTPException(403, 'Süreli mesajlar sabitlenemez.')
        if row is None:
            count = db.scalar(select(func.count(PinnedMessage.id)).where(PinnedMessage.conversation_id == conversation_id)) or 0
            if count >= LIMIT:
                raise HTTPException(409, 'Bir konuşmada en fazla 5 mesaj sabitlenebilir.')
            db.add(PinnedMessage(conversation_id=conversation_id, message_id=message_id, pinned_by=user.id))
            changed = True
    elif row:
        db.delete(row); changed = True
    if changed and db.get(MessageGroup, conversation_id):
        group_policy.audit(db, conversation_id, user.id, 'pin_message' if pinned else 'unpin_message')
    db.commit()
    if changed:
        for uid in db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation_id)):
            # No message preview or actor identity is broadcast into locked chats.
            await _notify(db, uid, {'type':'dm_pins_updated', 'conversation_id':conversation_id})
    return {'pinned':pinned}
