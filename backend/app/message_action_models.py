"""Optional action tables; no changes to existing message columns."""
from sqlalchemy import ForeignKey, Integer, String, JSON
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class MessageReaction(Base):
    __tablename__ = 'message_reactions'
    message_id: Mapped[int] = mapped_column(ForeignKey('messages.id', ondelete='CASCADE'), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    emoji: Mapped[str] = mapped_column(String(16), nullable=False)


class ForwardedMessage(Base):
    __tablename__ = 'forwarded_messages'
    message_id: Mapped[int] = mapped_column(ForeignKey('messages.id', ondelete='CASCADE'), primary_key=True)


class MessageForwardRequest(Base):
    __tablename__ = 'message_forward_requests'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    request_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    message_ids: Mapped[list] = mapped_column(JSON, nullable=False)
