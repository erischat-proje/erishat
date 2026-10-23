"""Private message bookmarks. Stored text/media are never duplicated."""
from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy import ForeignKey, Integer, DateTime, UniqueConstraint, select, func, and_, or_
from sqlalchemy.orm import Mapped, mapped_column, Session, aliased
from .db import Base, get_db
from .models import User, Message, Conversation, ConversationMember
from .platform_models import MessageMedia, MessageHidden, ConversationFolder, Family, PrivateMessageRequest
from .group_models import MessageGroup
from .message_attachment_models import MessageAttachment
from .dm_folders import _session
from . import message_tools
from .runtime_tasks import database_task


class MessageStar(Base):
    __tablename__ = 'message_stars'
    __table_args__ = (UniqueConstraint('user_id', 'message_id', name='uq_message_star_user'), {'sqlite_autoincrement':True})
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True, nullable=False)
    message_id: Mapped[int] = mapped_column(ForeignKey('messages.id', ondelete='CASCADE'), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


router = APIRouter(prefix='/v1/message-stars', tags=['message-stars'])


def starred_ids(db, messages, user_id):
    if not messages:
        return set()
    return set(db.scalars(select(MessageStar.message_id).where(
        MessageStar.user_id == user_id, MessageStar.message_id.in_([m.id for m in messages]))))


class StarUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    starred: StrictBool


@router.put('/{conversation_id}/{message_id}')
@database_task
async def set_star(conversation_id: str, message_id: int, payload: StarUpdate,
        x_eris_dm_vault: str | None = Header(None), db: Session = Depends(get_db),
        user: User = Depends(message_tools.authenticated)):
    conversation = message_tools.access(db, conversation_id, user.id, x_eris_dm_vault)
    # Serializes this user's star/unstar operations without affecting other members.
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    row = db.scalar(select(MessageStar).where(MessageStar.user_id == user.id,
        MessageStar.message_id == message_id).execution_options(populate_existing=True))
    if not payload.starred:
        # Removing one's own bookmark needs no readable copy of a hidden/deleted message.
        if row and db.scalar(select(Message.id).where(Message.id == message_id, Message.conversation_id == conversation_id)):
            db.delete(row)
        db.commit()
        return {'is_starred':False}
    message = message_tools.visible_message(db, conversation_id, user.id, message_id)
    locked = db.scalar(select(Message).where(Message.id == message_id).with_for_update().execution_options(populate_existing=True))
    if not locked:
        raise HTTPException(404, 'Mesaj silindi.')
    message_tools.visible_message(db, conversation_id, user.id, message_id)
    media = db.get(MessageMedia, message_id)
    if conversation.type == 'welcome' or conversation.is_ephemeral or message.expires_at or (media and media.temporary):
        raise HTTPException(403, 'Sistem ve süreli mesajlar yıldızlanamaz.')
    if row is None:
        db.add(MessageStar(user_id=user.id, message_id=message_id))
    db.commit()
    return {'is_starred':True}


@router.get('')
@database_task
async def list_stars(q: str = Query('', max_length=100),
        kind: str = Query('all', pattern='^(all|text|image|voice|video|document)$'),
        scope: str = Query('all', pattern='^(all|locked)$'),
        conversation_id: str | None = Query(None, min_length=1, max_length=64),
        before: int | None = Query(None, ge=1), limit: int = Query(30, ge=1, le=50),
        x_eris_dm_vault: str | None = Header(None), db: Session = Depends(get_db),
        user: User = Depends(message_tools.authenticated)):
    if conversation_id:
        message_tools.access(db, conversation_id, user.id, x_eris_dm_vault)
    elif scope == 'locked' and not _session(db, user.id, x_eris_dm_vault):
        raise HTTPException(403, 'Kilitli sohbet şifrenizi girin.')
    hidden = select(MessageHidden.id).where(MessageHidden.message_id == Message.id,
        MessageHidden.user_id == user.id).exists()
    pending = select(PrivateMessageRequest.id).where(PrivateMessageRequest.conversation_id == Conversation.id,
        PrivateMessageRequest.recipient_id == user.id, PrivateMessageRequest.status == 'pending').exists()
    query = select(MessageStar.id.label('star_id'), MessageStar.created_at.label('starred_at'),
        Message.id, Message.conversation_id, Message.sender_id, Message.text, Message.created_at,
        User.nickname.label('sender_name'), MessageMedia.media_type, MessageAttachment.filename,
        Conversation.type, MessageGroup.name.label('group_name'), Family.name.label('family_name')).join(
        Message, Message.id == MessageStar.message_id).join(Conversation, Conversation.id == Message.conversation_id).join(
        ConversationMember, and_(ConversationMember.conversation_id == Conversation.id, ConversationMember.user_id == user.id)).join(
        User, User.id == Message.sender_id).outerjoin(MessageMedia, MessageMedia.message_id == Message.id).outerjoin(
        MessageAttachment, MessageAttachment.message_id == Message.id).outerjoin(MessageGroup, MessageGroup.conversation_id == Conversation.id).outerjoin(
        Family, Family.chat_conversation_id == Conversation.id).outerjoin(ConversationFolder, and_(
        ConversationFolder.conversation_id == Conversation.id, ConversationFolder.user_id == user.id)).where(
        MessageStar.user_id == user.id, ~hidden, ~pending, Message.expires_at.is_(None),
        Conversation.is_ephemeral.is_(False), Conversation.type != 'welcome',
        func.coalesce(MessageMedia.temporary, False).is_(False))
    if conversation_id:
        query = query.where(Conversation.id == conversation_id)
    else:
        query = query.where(func.coalesce(ConversationFolder.locked, False).is_(scope == 'locked'))
    if before is not None:
        query = query.where(MessageStar.id < before)
    if kind != 'all':
        query = query.where(MessageMedia.message_id.is_(None) if kind == 'text' else MessageMedia.media_type == kind)
    if q.strip():
        term = '%' + q.strip().replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%'
        peer_user, peer_member = aliased(User), aliased(ConversationMember)
        peer = select(peer_member.id).join(peer_user, peer_user.id == peer_member.user_id).where(
            peer_member.conversation_id == Conversation.id, peer_member.user_id != user.id,
            or_(peer_user.nickname.ilike(term, escape='!'), peer_user.public_id.ilike(term, escape='!'))).exists()
        query = query.where(or_(Message.text.ilike(term, escape='!'), MessageAttachment.filename.ilike(term, escape='!'),
            User.nickname.ilike(term, escape='!'), MessageGroup.name.ilike(term, escape='!'), Family.name.ilike(term, escape='!'),
            and_(Conversation.type == 'dm', peer)))
    rows = list(db.execute(query.order_by(MessageStar.id.desc()).limit(limit + 1)).mappings())
    more = len(rows) > limit
    rows = rows[:limit]
    dm_ids = {r['conversation_id'] for r in rows if r['type'] == 'dm' and not r['family_name']}
    peers = {}
    if dm_ids:
        for cid, uid, name in db.execute(select(ConversationMember.conversation_id, User.id, User.nickname).join(
            User, User.id == ConversationMember.user_id).where(ConversationMember.conversation_id.in_(dm_ids),
            ConversationMember.user_id != user.id).order_by(User.id)):
            peers.setdefault(cid, {'user_id':uid, 'nickname':name})
    items = []
    for r in rows:
        cid = r['conversation_id']
        kind_name = 'family' if r['family_name'] else r['type']
        name = (r['family_name'] + ' aile sohbeti') if r['family_name'] else r['group_name'] or peers.get(cid, {}).get('nickname') or 'Sohbet'
        items.append({'star_id':r['star_id'], 'starred_at':r['starred_at'],
            'conversation':{'id':cid, 'type':kind_name, 'name':name, 'members':[peers[cid]] if cid in peers else []},
            'message':{'id':r['id'], 'conversation_id':cid, 'sender_id':r['sender_id'], 'sender_nickname':r['sender_name'],
                'text':r['text'], 'created_at':r['created_at'], 'media_type':r['media_type'], 'media_name':r['filename'], 'is_starred':True}})
    return {'items':items, 'has_more':more, 'next_before':rows[-1]['star_id'] if rows and more else None}
