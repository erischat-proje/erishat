"""Global text/filename search with membership, expiry and vault isolation."""
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import Session
from .db import get_db
from .models import Conversation, ConversationMember, Message, User
from .platform_models import MessageHidden, MessageMedia, ConversationFolder, PrivateMessageRequest, Family
from .message_attachment_models import MessageAttachment
from .group_models import MessageGroup
from .dm_folders import _session
from . import message_tools
from .runtime_tasks import database_task

router = APIRouter(prefix='/v1/message-search', tags=['message-search'])


@router.get('')
@database_task
async def search(q: str = Query(..., min_length=2, max_length=100),
        kind: str = Query('all', pattern='^(all|text|image|voice|video|document)$'),
        scope: str = Query('all', pattern='^(all|locked)$'),
        before: int | None = Query(None, ge=1), limit: int = Query(30, ge=1, le=50),
        x_eris_dm_vault: str | None = Header(None), db: Session = Depends(get_db),
        user: User = Depends(message_tools.authenticated)):
    if len(q.strip()) < 2:
        raise HTTPException(422, 'Aramak için en az 2 karakter yazın.')
    if scope == 'locked' and not _session(db, user.id, x_eris_dm_vault):
        raise HTTPException(403, 'Kilitli sohbet şifrenizi girin.')
    hidden = select(MessageHidden.id).where(MessageHidden.message_id == Message.id, MessageHidden.user_id == user.id).exists()
    pending = select(PrivateMessageRequest.id).where(PrivateMessageRequest.conversation_id == Conversation.id,
        PrivateMessageRequest.recipient_id == user.id, PrivateMessageRequest.status == 'pending').exists()
    term = '%' + q.strip().replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%'
    query = select(Message.id, Message.conversation_id, Message.sender_id, Message.text, Message.created_at,
        User.nickname.label('sender_name'), MessageMedia.media_type, MessageAttachment.filename,
        Conversation.type, MessageGroup.name.label('group_name'), Family.name.label('family_name')).select_from(Message)
    query = query.join(Conversation, Conversation.id == Message.conversation_id).join(ConversationMember,
        and_(ConversationMember.conversation_id == Conversation.id, ConversationMember.user_id == user.id))
    query = query.join(User, User.id == Message.sender_id).outerjoin(MessageMedia, MessageMedia.message_id == Message.id)
    query = query.outerjoin(MessageAttachment, MessageAttachment.message_id == Message.id).outerjoin(MessageGroup,
        MessageGroup.conversation_id == Conversation.id).outerjoin(Family, Family.chat_conversation_id == Conversation.id)
    query = query.outerjoin(ConversationFolder, and_(ConversationFolder.conversation_id == Conversation.id,
        ConversationFolder.user_id == user.id)).where(~hidden, ~pending, Message.expires_at.is_(None),
        Conversation.is_ephemeral.is_(False), Conversation.type != 'welcome',
        func.coalesce(MessageMedia.temporary, False).is_(False),
        func.coalesce(ConversationFolder.locked, False).is_(scope == 'locked'),
        or_(Message.text.ilike(term, escape='!'), MessageAttachment.filename.ilike(term, escape='!')))
    if kind != 'all':
        query = query.where(MessageMedia.message_id.is_(None) if kind == 'text' else MessageMedia.media_type == kind)
    if before is not None:
        query = query.where(Message.id < before)
    rows = list(db.execute(query.order_by(Message.id.desc()).limit(limit + 1)).mappings())
    more = len(rows) > limit; rows = rows[:limit]
    dm_ids = {r['conversation_id'] for r in rows if r['type'] == 'dm' and not r['family_name'] and not r['group_name']}
    peers = {}
    if dm_ids:
        for cid, uid, name in db.execute(select(ConversationMember.conversation_id, User.id, User.nickname).join(User,
                User.id == ConversationMember.user_id).where(ConversationMember.conversation_id.in_(dm_ids),
                ConversationMember.user_id != user.id).order_by(User.id)):
            peers.setdefault(cid, {'user_id':uid, 'nickname':name})
    items = []
    for r in rows:
        cid = r['conversation_id']; kind_name = 'family' if r['family_name'] else 'group' if r['group_name'] else r['type']
        name = r['family_name'] + ' aile sohbeti' if r['family_name'] else r['group_name'] or peers.get(cid, {}).get('nickname') or 'Sohbet'
        match = r['text'].casefold().find(q.strip().casefold()); start = max(0, match - 70)
        preview = ('…' if start else '') + r['text'][start:start + 240] + ('…' if len(r['text']) > start + 240 else '')
        items.append({'conversation':{'id':cid, 'type':kind_name, 'name':name, 'members':[peers[cid]] if cid in peers else []},
            'message':{'id':r['id'], 'conversation_id':cid, 'sender_id':r['sender_id'], 'sender_nickname':r['sender_name'],
                'text':preview, 'created_at':r['created_at'], 'media_type':r['media_type'], 'media_name':r['filename']}})
    return {'items':items, 'has_more':more, 'next_before':rows[-1]['id'] if rows and more else None}
