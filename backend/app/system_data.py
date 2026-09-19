from __future__ import annotations

from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func, event
from sqlalchemy.orm import Session
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base
from .models import User
from .system_logs import record


class UserIdRegistry(Base):
    __tablename__ = "system_user_ids"
    user_id: Mapped[str] = mapped_column(primary_key=True)
    public_id: Mapped[str] = mapped_column(String(10), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoomIdRegistry(Base):
    __tablename__ = "system_room_ids"
    room_id: Mapped[str] = mapped_column(primary_key=True)
    public_id: Mapped[str] = mapped_column(String(12), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LidyaGemLedger(Base):
    __tablename__ = "system_lidya_gem_ledger"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    delta: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_after: Mapped[int] = mapped_column(BigInteger, nullable=False)
    operation: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True, index=True)
    details: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LidyaLedger(Base):
    __tablename__ = "system_lidya_ledger"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    delta: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_after: Mapped[int] = mapped_column(BigInteger, nullable=False)
    operation: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    details: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


@event.listens_for(Session, "after_flush")
def _capture_lidya_changes(session: Session, flush_context) -> None:
    for user in list(session.new) + list(session.dirty):
        if not isinstance(user, User):
            continue
        history = None
        if user in session.dirty:
            from sqlalchemy import inspect
            history = inspect(user).attrs.lidya.history
            if not history.has_changes():
                continue
            old = int(history.deleted[0]) if history.deleted else int(user.lidya)
            delta = int(user.lidya) - old
            operation = str(session.info.get("lidya_operation", "balance_change"))
        else:
            delta = int(user.lidya)
            operation = "initial_balance"
        if delta == 0 and operation != "initial_balance":
            continue
        entry = LidyaLedger(
            user_id=user.id,
            delta=delta,
            balance_after=int(user.lidya),
            operation=operation,
            actor_id=session.info.get("lidya_actor_id"),
            reference_id=session.info.get("lidya_reference_id"),
            details=str(session.info.get("lidya_details", "")),
        )
        session.add(entry)
        record("lidya", operation, user_id=user.id, delta=delta, balance_after=int(user.lidya),
               actor_id=session.info.get("lidya_actor_id"),
               reference_id=session.info.get("lidya_reference_id"),
               details=session.info.get("lidya_details", ""))
