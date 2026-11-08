"""Verified Google Play purchases, pending actual entitlement fulfillment.

Never store raw Play purchase tokens. A SHA-256 token fingerprint is globally unique.
This model is imported by play_billing before Base.metadata.create_all at startup.
"""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class PlayPurchaseRecord(Base):
    __tablename__ = 'google_play_purchase_records'
    __table_args__ = (UniqueConstraint('token_sha256', name='uq_google_play_purchase_token'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(String(32), nullable=False)
    google_order_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    purchase_status: Mapped[str] = mapped_column(String(32), nullable=False, default='verified_no_credit')
    test_purchase: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
