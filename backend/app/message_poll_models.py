from datetime import datetime
from sqlalchemy import ForeignKey, String, Boolean, Integer, JSON, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class MessagePoll(Base):
    __tablename__ = 'message_polls'
    __table_args__ = (UniqueConstraint('creator_id', 'request_key', name='uq_message_poll_request'),)
    message_id: Mapped[int] = mapped_column(ForeignKey('messages.id', ondelete='CASCADE'), primary_key=True)
    creator_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    request_key: Mapped[str] = mapped_column(String(64), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, default=0, server_default='0', nullable=False)
    question: Mapped[str] = mapped_column(String(180), nullable=False)
    options: Mapped[list] = mapped_column(JSON, nullable=False)
    multiple: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MessagePollVote(Base):
    __tablename__ = 'message_poll_votes'
    message_id: Mapped[int] = mapped_column(ForeignKey('message_polls.message_id', ondelete='CASCADE'), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    choices: Mapped[list] = mapped_column(JSON, nullable=False)
