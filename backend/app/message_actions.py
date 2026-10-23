"""Protected forwarding and one reaction per member per message."""
from datetime import datetime, timedelta, timezone
import hashlib
import json
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, ConfigDict, PositiveInt
from sqlalchemy import select, func, case
from sqlalchemy.orm import Session
from .db import get_db
from .models import ConversationMember, Message, User
from .platform_models import (MessageMedia, DirectMessageGift, DirectMessageRestriction,
    DirectMessageUnlock, Family, Notification)
from .message_attachment_models import MessageAttachment
from .message_action_models import MessageReaction, ForwardedMessage, MessageForwardRequest
from .group_models import MessageGroup
from . import message_tools, group_policy
from .runtime_tasks import database_task

router = APIRouter(prefix='/v1/message-actions', tags=['message-actions'])
EMOJIS = ('👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏')
MAX_FORWARD_BYTES = 50 * 1024 * 1024
_access = _notify = _serialize = _notifications = None


def register(access, notify, serialize, notifications):
    global _access, _notify, _serialize, _notifications
    _access, _notify, _serialize, _notifications = access, notify, serialize, notifications


def annotations(db, messages, viewer_id):
    ids = [m.id for m in messages]
    if not ids:
        return {}
    forwarded = set(db.scalars(select(ForwardedMessage.message_id).where(ForwardedMessage.message_id.in_(ids))))
    result = {mid:{'forwarded':mid in forwarded, 'reactions':[]} for mid in ids}
    rows = db.execute(select(MessageReaction.message_id, MessageReaction.emoji, func.count(),
        func.max(case((MessageReaction.user_id == viewer_id, 1), else_=0))).where(
        MessageReaction.message_id.in_(ids)).group_by(MessageReaction.message_id, MessageReaction.emoji))
    for mid, emoji, count, mine in rows:
        result[mid]['reactions'].append({'emoji':emoji, 'count':count, 'mine':bool(mine)})
    for item in result.values():
        item['reactions'].sort(key=lambda r:EMOJIS.index(r['emoji']) if r['emoji'] in EMOJIS else 99)
    return result


def write_access(db, cid, user, token):
    conversation = _access(db, cid, user, token)
    if not db.get(MessageGroup, cid) and not db.scalar(select(Family.id).where(Family.chat_conversation_id == cid)):
        for uid in db.scalars(select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == cid, ConversationMember.user_id != user.id)):
            restriction = db.get(DirectMessageRestriction, uid)
            if restriction and restriction.enabled and not db.scalar(select(DirectMessageUnlock.id).where(
                    DirectMessageUnlock.owner_id == uid, DirectMessageUnlock.sender_id == user.id)):
                raise HTTPException(402, 'Bu kullanıcı mesajları hediye ile kısıtlamış.')
    return conversation


class ReactionUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    emoji: str | None = Field(default=None, max_length=16)


@router.get('/{conversation_id}/{message_id}/metadata')
@database_task
async def metadata(conversation_id: str, message_id: int,
        x_eris_dm_vault: str | None = Header(None), db: Session = Depends(get_db),
        user: User = Depends(message_tools.authenticated)):
    message_tools.access(db, conversation_id, user.id, x_eris_dm_vault)
    row = message_tools.visible_message(db, conversation_id, user.id, message_id)
    return annotations(db, [row], user.id)[message_id]


@router.put('/{conversation_id}/{message_id}/reaction')
@database_task
async def react(conversation_id: str, message_id: int, payload: ReactionUpdate,
        x_eris_dm_vault: str | None = Header(None), db: Session = Depends(get_db),
        user: User = Depends(message_tools.authenticated)):
    if payload.emoji is not None and payload.emoji not in EMOJIS:
        raise HTTPException(422, 'Desteklenmeyen emoji.')
    group_policy.require_write(db, conversation_id, user.id, consume=False, check_slow=False)
    write_access(db, conversation_id, user, x_eris_dm_vault)
    message_tools.visible_message(db, conversation_id, user.id, message_id)
    locked = db.scalar(select(Message).where(Message.id == message_id).with_for_update().execution_options(populate_existing=True))
    if not locked:
        raise HTTPException(404, 'Mesaj silindi.')
    message_tools.visible_message(db, conversation_id, user.id, message_id)
    media = db.get(MessageMedia, message_id)
    if locked.expires_at or (media and media.temporary):
        raise HTTPException(403, 'Süreli mesajlara tepki verilemez.')
    row = db.get(MessageReaction, (message_id, user.id), populate_existing=True)
    changed = False
    if payload.emoji is None:
        if row:
            db.delete(row); changed = True
    elif row is None:
        db.add(MessageReaction(message_id=message_id, user_id=user.id, emoji=payload.emoji)); changed = True
    elif row.emoji != payload.emoji:
        row.emoji = payload.emoji; changed = True
    db.commit()
    if changed:
        for uid in db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation_id)):
            await _notify(db, uid, {'type':'dm_reactions_updated', 'conversation_id':conversation_id, 'message_id':message_id})
    return annotations(db, [locked], user.id)[message_id]


class ForwardMessages(BaseModel):
    model_config = ConfigDict(extra='forbid')
    message_ids: list[PositiveInt] = Field(min_length=1, max_length=10)
    target_conversation_id: str = Field(min_length=1, max_length=64)
    request_key: str = Field(min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')


@router.post('/{conversation_id}/forward')
@database_task
async def forward(conversation_id: str, payload: ForwardMessages,
        x_eris_dm_vault: str | None = Header(None), db: Session = Depends(get_db),
        user: User = Depends(message_tools.authenticated)):
    target = payload.target_conversation_id
    if target == conversation_id:
        raise HTTPException(422, 'İletmek için farklı bir sohbet seçin.')
    source = message_tools.access(db, conversation_id, user.id, x_eris_dm_vault)
    if source.type == 'welcome' or source.is_ephemeral:
        raise HTTPException(403, 'Sistem ve süreli sohbet mesajları iletilemez.')
    # Lock both groups in stable order so removal cannot race source authorization.
    for cid in sorted({conversation_id, target}):
        if db.get(MessageGroup, cid):
            group_policy.locked_group(db, cid, active=False)
    message_tools.access(db, conversation_id, user.id, x_eris_dm_vault)
    # Match send ordering: groups, then user, then message rows.
    group_policy.require_write(db, target, user.id, consume=False, check_slow=False)
    destination = write_access(db, target, user, x_eris_dm_vault)
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    mids = sorted(set(payload.message_ids))
    fingerprint = hashlib.sha256(json.dumps([conversation_id, target, mids]).encode()).hexdigest()
    previous = db.get(MessageForwardRequest, (user.id, payload.request_key), populate_existing=True)
    if previous:
        if previous.fingerprint != fingerprint:
            raise HTTPException(409, 'Bu işlem anahtarı farklı bir iletme için kullanılmış.')
        rows = list(db.scalars(message_tools.visible_query(user.id, target).where(Message.id.in_(previous.message_ids)).order_by(Message.id)))
        return {'messages':[_serialize(db, m, user.id) for m in rows], 'replayed':True}
    rows = list(db.scalars(select(Message).where(Message.id.in_(mids), Message.conversation_id == conversation_id)
        .order_by(Message.id).with_for_update().execution_options(populate_existing=True)))
    if len(rows) != len(mids):
        raise HTTPException(404, 'İletilecek mesajlardan biri silindi.')
    for m in rows:
        message_tools.visible_message(db, conversation_id, user.id, m.id)
        if m.expires_at:
            raise HTTPException(403, 'Süreli mesajlar iletilemez.')
    media = {m.message_id:m for m in db.scalars(select(MessageMedia).where(MessageMedia.message_id.in_(mids)))}
    gifts = db.scalar(select(DirectMessageGift.message_id).where(DirectMessageGift.message_id.in_(mids)))
    if gifts is not None or any(m.temporary or m.media_type not in {'image','voice','video','document'} for m in media.values()):
        raise HTTPException(403, 'Süreli fotoğraflar ve hediyeler iletilemez.')
    size = db.scalar(select(func.sum(func.length(MessageMedia.data))).where(MessageMedia.message_id.in_(mids))) or 0
    if size > MAX_FORWARD_BYTES:
        raise HTTPException(413, 'Bir iletmede toplam dosya boyutu en fazla 50 MB olabilir.')
    if any(m.data is None for m in media.values()):
        raise HTTPException(410, 'İletilecek dosyalardan biri artık mevcut değil.')
    attachments = {a.message_id:a for a in db.scalars(select(MessageAttachment).where(MessageAttachment.message_id.in_(mids)))}
    group_policy.require_write(db, target, user.id)
    created = []
    outgoing = {}
    for original in rows:
        m = Message(conversation_id=target, sender_id=user.id, text=original.text)
        if destination.type == 'dm' and destination.is_ephemeral:
            m.expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        db.add(m); db.flush(); created.append(m)
        db.add(ForwardedMessage(message_id=m.id))
        old_media = media.get(original.id)
        old_attachment = attachments.get(original.id)
        outgoing[m.id] = {'type':'dm_message', 'conversation_id':target, 'message_id':m.id,
            'sender_id':user.id, 'sender_nickname':user.nickname, 'text':m.text, 'forwarded':True,
            'protected_message':bool(m.expires_at), 'created_at':m.created_at.isoformat() if m.created_at else None,
            'media_type':old_media.media_type if old_media else None,
            'media_url':f'/messages/{target}/{m.id}/media' if old_media else None,
            'media_name':old_attachment.filename if old_attachment else None,
            'media_size':old_attachment.size_bytes if old_attachment else None, 'temporary':False}
        if original.id in media:
            old = media[original.id]
            db.add(MessageMedia(message_id=m.id, media_type=old.media_type, mime_type=old.mime_type, data=old.data, temporary=False))
            a = attachments.get(original.id)
            if a:
                db.add(MessageAttachment(message_id=m.id, filename=a.filename, size_bytes=len(old.data)))
    db.add(MessageForwardRequest(user_id=user.id, request_key=payload.request_key,
        conversation_id=target, fingerprint=fingerprint, message_ids=[m.id for m in created]))
    members = list(db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id == target)))
    for uid in members:
        if uid != user.id and _notifications(db, uid, target):
            db.add(Notification(user_id=uid, kind='dm_message', title=user.nickname,
                body=f'Sana {len(created)} mesaj iletti.'))
    db.commit()
    for m in created:
        for uid in members:
            # The registered delivery function masks events for recipients' locked folders.
            await _notify(db, uid, outgoing[m.id])
    return {'messages':[_serialize(db, m, user.id) for m in created], 'replayed':False}
