"""Purchase-backed VIP accounting and immutable period audit rows."""

from datetime import datetime
from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class VipMembership(Base):
    __tablename__ = "vip_purchase_memberships"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    total_purchased: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    earned_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cycle_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cycle_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    cycle_purchased: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    migrated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class VipPurchaseReceipt(Base):
    __tablename__ = "vip_purchase_receipts"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    key: Mapped[str] = mapped_column(String(96), primary_key=True)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    purchased_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class VipCycleAudit(Base):
    __tablename__ = "vip_cycle_audits"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    cycle_key: Mapped[str] = mapped_column(String(48), primary_key=True)
    level_before: Mapped[int] = mapped_column(Integer, nullable=False)
    level_after: Mapped[int] = mapped_column(Integer, nullable=False)
    target: Mapped[int] = mapped_column(BigInteger, nullable=False)
    purchased: Mapped[int] = mapped_column(BigInteger, nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
