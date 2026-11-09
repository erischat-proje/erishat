"""Immutable Google Play refund case identity; DA review never moves Lidya."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class PlayRefundCase(Base):
    __tablename__ = 'google_play_refund_cases'
    __table_args__ = (UniqueConstraint('receipt_id',name='uq_google_play_refund_receipt'),)
    id: Mapped[int] = mapped_column(Integer,primary_key=True,autoincrement=True)
    receipt_id: Mapped[int] = mapped_column(ForeignKey('google_play_purchase_records.id'),nullable=False,unique=True,index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'),nullable=False,index=True)
    product_id: Mapped[str] = mapped_column(String(32),nullable=False)
    voided_at_ms: Mapped[str] = mapped_column(String(32),nullable=False,default='')
    voided_reason: Mapped[str] = mapped_column(String(24),nullable=False,default='')
    voided_source: Mapped[str] = mapped_column(String(24),nullable=False,default='')
    status: Mapped[str] = mapped_column(String(20),nullable=False,default='pending')
    review_note: Mapped[str] = mapped_column(Text,nullable=False,default='')
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'),nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),server_default=func.now(),nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),server_default=func.now(),onupdate=func.now(),nullable=False)
