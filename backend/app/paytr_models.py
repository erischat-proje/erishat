"""PayTR payment orders. Monetary value is snapshotted server-side."""
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class PayTROrder(Base):
    __tablename__ = "paytr_orders"
    oid: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    package_id: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_kurus: Mapped[int] = mapped_column(BigInteger, nullable=False)
    lidya_total: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    test_mode: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failure_code: Mapped[str | None] = mapped_column(String(60), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PayTRDispute(Base):
    """Operator-reviewed refund/chargeback case; never independently moves money."""
    __tablename__ = "paytr_disputes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    oid: Mapped[str] = mapped_column(ForeignKey("paytr_orders.oid"), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    state: Mapped[str] = mapped_column(String(24), nullable=False, default="review")
    amount_kurus: Mapped[int] = mapped_column(BigInteger, nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    operator_id: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class PayTRAudit(Base):
    __tablename__ = "paytr_audit"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    oid: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    event: Mapped[str] = mapped_column(String(42), nullable=False)
    note: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
