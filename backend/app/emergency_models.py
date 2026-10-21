"""Emergency UA action ledger. Schema migration required before activation."""
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class EmergencyChatAction(Base):
    __tablename__ = 'management_emergency_chat_actions'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False, index=True)
    target_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False, index=True)
    case_id: Mapped[int] = mapped_column(ForeignKey('management_cases.id'), nullable=False, index=True)
    chat_ban_id: Mapped[int] = mapped_column(ForeignKey('chat_bans.id'), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=False)
