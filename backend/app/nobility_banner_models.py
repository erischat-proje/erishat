"""Persistent nobility banner delivery limits."""

from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, DateTime,
    ForeignKey, CheckConstraint,
)
from .db import Base


class NobilityBannerLimit(Base):
    __tablename__ = "nobility_banner_limits"

    user_id = Column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    kind = Column(
        String(24),
        primary_key=True,
    )

    scope_key = Column(
        String(128),
        primary_key=True,
    )

    last_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('daily_banner', 'room_welcome')",
            name="ck_nobility_banner_limit_kind",
        ),
    )


class NobilityBannerEvent(Base):
    __tablename__ = "nobility_banner_events"

    event_id = Column(
        String(160),
        primary_key=True,
    )

    user_id = Column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
