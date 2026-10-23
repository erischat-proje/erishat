"""Sender-only message information and current-membership read summaries."""
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select, and_, func, case
from sqlalchemy.orm import Session
from .db import get_db
from .models import Conversation, ConversationMember, Message, User
from .platform_models import ConversationReadState, MessageMedia, PrivateMessageRequest
from .message_detail_models import MessageDetail
from .message_attachment_models import MessageAttachment
from . import message_tools
from .runtime_tasks import database_task

router = APIRouter(prefix='/v1/message-info', tags=['message-info'])


def summaries(db, messages, viewer_id):
    own = [m for m in messages if m.sender_id == viewer_id]
    if not own:
        return {}
    cid = own[0].conversation_id
    conversation = db.get(Conversation, cid)
    if not conversation or conversation.type == 'welcome':
        return {}
    # One membership/state query per message page, independent of message count.
    members = list(db.execute(select(ConversationMember.joined_at, ConversationReadState.last_read_message_id)
        .outerjoin(ConversationReadState, and_(ConversationReadState.conversation_id == cid,
            ConversationReadState.user_id == ConversationMember.user_id))
        .where(ConversationMember.conversation_id == cid, ConversationMember.user_id != viewer_id)))
    result = {}
    for m in own:
        eligible = [read or 0 for joined, read in members if message_tools.utc(joined) <= message_tools.utc(m.created_at)]
        count = sum(read >= m.id for read in eligible)
        result[m.id] = {'read_count':count, 'recipient_count':len(eligible), 'is_read':bool(eligible) and count == len(eligible)}
    return result


@router.get('/{conversation_id}/{message_id}')
@database_task
async def information(conversation_id: str, message_id: int,
        view: str = Query('all', pattern='^(all|read|unread)$'),
        after: int | None = Query(None, ge=1), limit: int = Query(30, ge=1, le=50),
        x_eris_dm_vault: str | None = Header(None), db: Session = Depends(get_db),
        user: User = Depends(message_tools.authenticated)):
    conversation = message_tools.access(db, conversation_id, user.id, x_eris_dm_vault)
    if conversation.type == 'welcome':
        raise HTTPException(403, 'Sistem mesajlarında bu işlem kullanılamaz.')
    if db.scalar(select(PrivateMessageRequest.id).where(PrivateMessageRequest.conversation_id == conversation_id,
            PrivateMessageRequest.recipient_id == user.id, PrivateMessageRequest.status == 'pending')):
        raise HTTPException(403, 'Önce mesaj isteğini kabul edin.')
    message = message_tools.visible_message(db, conversation_id, user.id, message_id)
    if message.sender_id != user.id:
        raise HTTPException(403, 'Yalnızca kendi mesajının okunma bilgisini görebilirsin.')
    media = db.execute(select(MessageMedia.media_type, MessageMedia.temporary).where(MessageMedia.message_id == message.id)).first()
    if media and media.temporary:
        raise HTTPException(403, 'Süreli fotoğraflarda mesaj bilgisi kullanılamaz.')
    attachment = db.get(MessageAttachment, message.id)
    detail = db.get(MessageDetail, message.id)
    read = func.coalesce(ConversationReadState.last_read_message_id, 0) >= message.id
    query = select(ConversationMember.id.label('member_id'), User.id.label('user_id'),
        User.nickname.label('nickname'), read.label('is_read')).join(User, User.id == ConversationMember.user_id)
    query = query.outerjoin(ConversationReadState, and_(ConversationReadState.conversation_id == conversation_id,
        ConversationReadState.user_id == ConversationMember.user_id)).where(
        ConversationMember.conversation_id == conversation_id, ConversationMember.user_id != user.id,
        ConversationMember.joined_at <= message.created_at)
    # Counts and roster use exactly the same eligible membership set.
    cohort = query.subquery()
    total, seen = db.execute(select(func.count(), func.coalesce(func.sum(case((cohort.c.is_read, 1), else_=0)), 0)).select_from(cohort)).one()
    if view != 'all':
        query = query.where(read if view == 'read' else ~read)
    if after is not None:
        query = query.where(ConversationMember.id > after)
    rows = list(db.execute(query.order_by(ConversationMember.id).limit(limit + 1)).mappings())
    more = len(rows) > limit; rows = rows[:limit]
    return {'message':{'id':message.id, 'conversation_id':conversation_id, 'text':message.text,
            'created_at':message.created_at, 'edited_at':detail.edited_at if detail else None,
            'media_type':media.media_type if media else None,
            'media_name':attachment.filename if attachment else None, 'media_size':attachment.size_bytes if attachment else None},
        'read_count':int(seen), 'recipient_count':int(total), 'is_read':bool(total) and seen == total,
        'recipients':[{'user_id':r['user_id'], 'nickname':r['nickname'], 'is_read':bool(r['is_read'])} for r in rows],
        'has_more':more, 'next_after':rows[-1]['member_id'] if rows and more else None}
