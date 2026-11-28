"""Welcome package purchase intent and immutable offer snapshot."""
from datetime import datetime

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey,
    Integer, String, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class WelcomePurchase(Base):
    __tablename__ = "welcome_package_purchases"

    __table_args__ = (
        UniqueConstraint(
            "user_id", "tier",
            name="uq_welcome_user_tier",
        ),
        CheckConstraint(
            "tier IN ('bronze','silver','gold')",
            name="ck_welcome_tier",
        ),
        CheckConstraint(
            "gender IN ('male','female')",
            name="ck_welcome_gender",
        ),
        CheckConstraint(
            "lidya > 0 AND price_kurus > 0",
            name="ck_welcome_value",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    tier: Mapped[str] = mapped_column(
        String(16), nullable=False
    )

    gender: Mapped[str] = mapped_column(
        String(16), nullable=False
    )

    product_id: Mapped[str] = mapped_column(
        String(32), nullable=False
    )

    price_kurus: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    lidya: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    duration_days: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    status: Mapped[str] = mapped_column(
        String(32), default="prepared", nullable=False
    )

    offer_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(), nullable=False,
    )


class WelcomePlayReceipt(Base):
    __tablename__ = "welcome_package_play_receipts"

    __table_args__ = (
        UniqueConstraint(
            "google_order_id",
            name="uq_welcome_google_order",
        ),
        CheckConstraint(
            "disposition IN ('verified','review')",
            name="ck_welcome_receipt_disposition",
        ),
    )

    receipt_id: Mapped[int] = mapped_column(
        ForeignKey("google_play_purchase_records.id"),
        primary_key=True,
    )

    intent_id: Mapped[str] = mapped_column(
        ForeignKey("welcome_package_purchases.id"),
        nullable=False,
        index=True,
    )

    google_order_id: Mapped[str] = mapped_column(
        String(128), nullable=False
    )

    disposition: Mapped[str] = mapped_column(
        String(16), nullable=False
    )

    review_reason: Mapped[str] = mapped_column(
        String(64), default="", nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
