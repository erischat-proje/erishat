"""One effective mute policy for stored and browser-facing DM notifications."""
from datetime import datetime, timedelta, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, StrictBool, model_validator
from sqlalchemy import DateTime, ForeignKey, select, and_
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base
from .models import User
from .platform_models import ConversationMute


class ConversationMuteExpiry(Base):
    __tablename__ = 'conversation_mute_expiries'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey('conversations.id', ondelete='CASCADE'), primary_key=True)
    muted_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class MuteUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    is_muted: StrictBool
    duration_seconds: Literal[3600, 28800, 86400, 604800] | None = None

    @model_validator(mode='after')
    def valid_duration(self):
        if not self.is_muted and self.duration_seconds is not None:
            raise ValueError('Bildirimleri açarken süre seçilmez.')
        return self


def now():
    return datetime.now(timezone.utc)


def effective(muted, until, at):
    until = until.replace(tzinfo=timezone.utc) if until and until.tzinfo is None else until
    active = bool(muted and (until is None or until > at))
    return {'is_muted':active, 'muted_until':until if active else None}


def mute_states(db, user_id, conversation_ids):
    if not conversation_ids:
        return {}
    rows = db.execute(select(ConversationMute.conversation_id, ConversationMute.is_muted,
        ConversationMuteExpiry.muted_until).outerjoin(ConversationMuteExpiry, and_(
        ConversationMuteExpiry.user_id == ConversationMute.user_id,
        ConversationMuteExpiry.conversation_id == ConversationMute.conversation_id)).where(
        ConversationMute.user_id == user_id, ConversationMute.conversation_id.in_(conversation_ids)))
    at = now()
    return {cid:effective(muted, until, at) for cid, muted, until in rows}


# Keep expired timer rows: they distinguish an ended timed mute from legacy indefinite True.
def state(db, user_id, conversation_id):
    return mute_states(db, user_id, [conversation_id]).get(conversation_id, {'is_muted':False, 'muted_until':None})


def allowed(db, user_id, conversation_id):
    user = db.get(User, user_id)
    return bool(user and user.is_active and user.notifications_enabled and not state(db, user_id, conversation_id)['is_muted'])


def update(db, user_id, conversation_id, payload):
    # Serialize first inserts and timer changes for this user across devices.
    db.scalar(select(User.id).where(User.id == user_id).with_for_update())
    row = db.scalar(select(ConversationMute).where(ConversationMute.user_id == user_id,
        ConversationMute.conversation_id == conversation_id).execution_options(populate_existing=True))
    timer = db.get(ConversationMuteExpiry, (user_id, conversation_id), populate_existing=True)
    if row is None:
        row = ConversationMute(user_id=user_id, conversation_id=conversation_id)
        db.add(row)
    row.is_muted = payload.is_muted
    until = now() + timedelta(seconds=payload.duration_seconds) if payload.is_muted and payload.duration_seconds else None
    if until:
        if timer is None:
            db.add(ConversationMuteExpiry(user_id=user_id, conversation_id=conversation_id, muted_until=until))
        else:
            timer.muted_until = until
    elif timer:
        db.delete(timer)
    db.commit()
    return effective(payload.is_muted, until, now())
