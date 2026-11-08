"""Dedicated PayTR order state; never use browser-return success to credit currency."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class PayTROrder(Base):
    __tablename__ = 'paytr_orders'
    oid: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    package_id: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_kurus: Mapped[int] = mapped_column(Integer, nullable=False)
    lidya_total: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default='pending')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
