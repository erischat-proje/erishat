"""Persistent daily nobility super-kick quota."""

from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Integer,
    Date,
    DateTime,
    ForeignKey,
    CheckConstraint,
)

from .db import Base


class NobilitySuperKickQuota(Base):
    __tablename__ = "nobility_super_kick_quotas"

    user_id = Column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    day = Column(Date, primary_key=True)

    used = Column(
        Integer,
        nullable=False,
        default=0,
    )

    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        CheckConstraint(
            "used >= 0 AND used <= 5",
            name="ck_nobility_super_kick_daily_limit",
        ),
    )


class NobilitySuperKickEvent(Base):
    __tablename__ = "nobility_super_kick_events"

    user_id = Column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    request_id = Column(String(36), primary_key=True)

    room_id = Column(String(64), nullable=False)
    target_id = Column(String(64), nullable=False)

    day = Column(Date, nullable=False)

    remaining = Column(Integer, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        CheckConstraint(
            "remaining >= 0 AND remaining <= 4",
            name="ck_nobility_super_kick_remaining",
        ),
    )
