"""Personal inbox controls. Manual unread never rewinds a read receipt."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, StrictBool, ConfigDict
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session
from .db import get_db
from .models import User, Message
from .platform_models import ConversationInboxPreference, ConversationReadState, MessageHidden
from .dm_folders import _auth_user, _member, require_unlocked

from .runtime_tasks import database_task

router = APIRouter(prefix='/v1/inbox', tags=['message-inbox'])
_notify = None


def register(notify):
    global _notify
    _notify = notify


def visible_conditions(user_id):
    hidden = select(MessageHidden.id).where(MessageHidden.message_id == Message.id,
        MessageHidden.user_id == user_id).exists()
    return (~hidden, or_(Message.expires_at.is_(None), Message.expires_at > datetime.now(timezone.utc)))


def clear_manual_unread(db, user_id, conversation_id):
    row = db.scalar(select(ConversationInboxPreference).where(
        ConversationInboxPreference.user_id == user_id,
        ConversationInboxPreference.conversation_id == conversation_id).execution_options(populate_existing=True))
    if row and row.manual_unread:
        row.manual_unread = False
        return True
    return False


class InboxUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    conversation_ids: list[str] = Field(min_length=1, max_length=100)
    pinned: StrictBool | None = None
    unread: StrictBool | None = None


@router.post('/preferences')
@database_task
async def update_preferences(payload: InboxUpdate, x_eris_dm_vault: str | None = Header(None),
        db: Session = Depends(get_db), user: User = Depends(_auth_user)):
    if payload.pinned is None and payload.unread is None:
        raise HTTPException(422, 'En az bir sohbet işlemi seçin.')
    ids = list(dict.fromkeys(payload.conversation_ids))
    # Validate the entire batch before writing; one inaccessible row rejects all.
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    for cid in ids:
        _member(db, user.id, cid)
        require_unlocked(db, user.id, cid, x_eris_dm_vault)
    receipts = []
    for cid in ids:
        row = db.scalar(select(ConversationInboxPreference).where(
            ConversationInboxPreference.user_id == user.id,
            ConversationInboxPreference.conversation_id == cid).execution_options(populate_existing=True))
        if row is None:
            row = ConversationInboxPreference(user_id=user.id, conversation_id=cid)
            db.add(row)
        if payload.pinned is not None:
            row.pinned = payload.pinned
        if payload.unread is not None:
            row.manual_unread = payload.unread
            if not payload.unread:
                incoming = db.scalar(select(func.max(Message.id)).where(Message.conversation_id == cid,
                    Message.sender_id != user.id, *visible_conditions(user.id))) or 0
                state = db.scalar(select(ConversationReadState).where(ConversationReadState.user_id == user.id,
                    ConversationReadState.conversation_id == cid).execution_options(populate_existing=True))
                if incoming and (state is None or incoming > state.last_read_message_id):
                    if state is None:
                        db.add(ConversationReadState(user_id=user.id, conversation_id=cid, last_read_message_id=incoming))
                    else:
                        state.last_read_message_id = incoming
                    receipts.append((cid, incoming))
    db.commit()
    if _notify:
        from .models import ConversationMember
        for cid, incoming in receipts:
            for uid in db.scalars(select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == cid, ConversationMember.user_id != user.id)):
                await _notify(db, uid, {'type':'dm_read', 'conversation_id':cid, 'reader_id':user.id, 'read_up_to':incoming})
    return {'updated':ids}
