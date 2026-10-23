"""Optional metadata; existing messages need no column migration."""
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class MessageDetail(Base):
    __tablename__ = 'message_details'
    message_id: Mapped[int] = mapped_column(Integer, ForeignKey('messages.id', ondelete='CASCADE'), primary_key=True)
    reply_to_id: Mapped[int | None] = mapped_column(Integer, ForeignKey('messages.id', ondelete='SET NULL'), nullable=True, index=True)
    has_reply: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
