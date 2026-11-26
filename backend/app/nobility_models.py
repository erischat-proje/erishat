"""Independent LidyaChat nobility models."""

from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


def utc_now():
    return datetime.now(timezone.utc)


class NobilityMembership(Base):
    __tablename__ = "nobility_memberships"

    __table_args__ = (
        CheckConstraint("rank >= 0 AND rank <= 4"),
        CheckConstraint("points >= 0"),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    rank: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    points: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True, index=True
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class NobilityPointsLedger(Base):
    __tablename__ = "nobility_points_ledger"

    __table_args__ = (
        CheckConstraint("amount != 0"),
    )

    event_key: Mapped[str] = mapped_column(
        String(160), primary_key=True
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True, nullable=False
    )

    amount: Mapped[int] = mapped_column(
        BigInteger, nullable=False
    )

    source: Mapped[str] = mapped_column(
        String(48), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now, nullable=False
    )


class NobilityRankConfig(Base):
    __tablename__ = "nobility_rank_config"

    __table_args__ = (
        CheckConstraint("rank >= 1 AND rank <= 4"),
        CheckConstraint("required_points > 0"),
        CheckConstraint("renewal_points > 0"),
        CheckConstraint("duration_days > 0"),
    )

    rank: Mapped[int] = mapped_column(
        Integer, primary_key=True
    )

    required_points: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )

    renewal_points: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )

    duration_days: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )


class NobilityAuditLog(Base):
    __tablename__ = "nobility_audit_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True
    )

    user_id: Mapped[str] = mapped_column(
        String(64), index=True, nullable=False
    )

    actor_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )

    action: Mapped[str] = mapped_column(
        String(48), nullable=False
    )

    before_state: Mapped[str] = mapped_column(
        Text, nullable=False
    )

    after_state: Mapped[str] = mapped_column(
        Text, nullable=False
    )

    reason: Mapped[str] = mapped_column(
        Text, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now, nullable=False
    )


class NobilityPointLot(Base):
    __tablename__ = "nobility_point_lots"

    __table_args__ = (
        CheckConstraint("original_points > 0"),
        CheckConstraint("remaining_points >= 0"),
        CheckConstraint("remaining_points <= original_points"),
        CheckConstraint("refunded_points >= 0"),
        CheckConstraint("refunded_points <= original_points"),
        CheckConstraint(
            "remaining_points <= original_points - refunded_points"
        ),
    )

    event_key: Mapped[str] = mapped_column(
        ForeignKey(
            "nobility_points_ledger.event_key",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    original_points: Mapped[int] = mapped_column(
        BigInteger, nullable=False,
    )

    remaining_points: Mapped[int] = mapped_column(
        BigInteger, nullable=False,
    )

    refunded_points: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False,
    )

    refunded: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now, nullable=False,
    )


class NobilityPointAllocation(Base):
    __tablename__ = "nobility_point_allocations"

    __table_args__ = (
        CheckConstraint("amount > 0"),
        CheckConstraint("revoked_points >= 0"),
        CheckConstraint("revoked_points <= amount"),
    )

    lot_event_key: Mapped[str] = mapped_column(
        ForeignKey(
            "nobility_point_lots.event_key",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )

    spend_event_key: Mapped[str] = mapped_column(
        ForeignKey(
            "nobility_points_ledger.event_key",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )

    amount: Mapped[int] = mapped_column(
        BigInteger, nullable=False,
    )

    revoked_points: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now, nullable=False,
    )


class NobilityRefundEvent(Base):
    __tablename__ = "nobility_refund_events"

    __table_args__ = (
        CheckConstraint("refunded_points > 0"),
        CheckConstraint("removed_balance >= 0"),
        CheckConstraint("removed_balance <= refunded_points"),
        CheckConstraint("rank_before >= 0 AND rank_before <= 4"),
        CheckConstraint("rank_after >= 0 AND rank_after <= rank_before"),
    )

    lot_event_key: Mapped[str] = mapped_column(
        ForeignKey(
            "nobility_point_lots.event_key",
            ondelete="CASCADE",
        ),
        nullable=False, index=True,
    )

    refund_key: Mapped[str] = mapped_column(
        String(160), primary_key=True,
    )

    is_full_request: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
    )

    refunded_points: Mapped[int] = mapped_column(
        BigInteger, nullable=False,
    )

    removed_balance: Mapped[int] = mapped_column(
        BigInteger, nullable=False,
    )

    rank_before: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )

    rank_after: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now, nullable=False,
    )


class NobilityMembershipFunding(Base):
    __tablename__ = "nobility_membership_funding"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    spend_event_key: Mapped[str] = mapped_column(
        ForeignKey(
            "nobility_points_ledger.event_key",
            ondelete="CASCADE",
        ),
        nullable=False, unique=True,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class NobilityRenewalFunding(Base):
    __tablename__ = "nobility_renewal_funding"

    __table_args__ = (
        CheckConstraint("rank >= 1 AND rank <= 4"),
        CheckConstraint("duration_days > 0"),
        CheckConstraint("required_points > 0"),
    )

    spend_event_key: Mapped[str] = mapped_column(
        ForeignKey(
            "nobility_points_ledger.event_key",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )

    membership_event_key: Mapped[str] = mapped_column(
        ForeignKey(
            "nobility_points_ledger.event_key",
            ondelete="CASCADE",
        ),
        nullable=False, index=True,
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    rank: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )

    required_points: Mapped[int] = mapped_column(
        BigInteger, nullable=False,
    )

    duration_days: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )

    revoked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
    )

    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now, nullable=False,
    )


class NobilityActionRejection(Base):
    """Durable cancellation of a financial action UUID."""

    __tablename__ = "nobility_action_rejections"

    __table_args__ = (
        CheckConstraint(
            "action IN ('activate', 'upgrade', 'renew')",
            name="ck_nobility_rejection_action",
        ),
        CheckConstraint(
            "rank >= 1 AND rank <= 4",
            name="ck_nobility_rejection_rank",
        ),
        CheckConstraint(
            "confirmed_cost > 0",
            name="ck_nobility_rejection_cost",
        ),
        CheckConstraint(
            "length(request_id) = 36",
            name="ck_nobility_rejection_uuid",
        ),
        CheckConstraint(
            "length(confirmed_revision) = 64",
            name="ck_nobility_rejection_revision",
        ),
        CheckConstraint(
            "reason = 'user_cancelled'",
            name="ck_nobility_rejection_reason",
        ),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    request_id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
    )

    action: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
    )

    rank: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    confirmed_cost: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    confirmed_revision: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    reason: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="user_cancelled",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class NobilityActionConfirmation(Base):
    """Original confirmation of a completed financial action."""

    __tablename__ = "nobility_action_confirmations"

    __table_args__ = (
        CheckConstraint(
            "action IN ('activate', 'upgrade', 'renew')",
            name="ck_nobility_confirmation_action",
        ),
        CheckConstraint(
            "rank >= 1 AND rank <= 4",
            name="ck_nobility_confirmation_rank",
        ),
        CheckConstraint(
            "confirmed_cost > 0",
            name="ck_nobility_confirmation_cost",
        ),
        CheckConstraint(
            "length(request_id) = 36",
            name="ck_nobility_confirmation_uuid",
        ),
        CheckConstraint(
            "length(confirmed_revision) = 64",
            name="ck_nobility_confirmation_revision",
        ),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    request_id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
    )

    action: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
    )

    rank: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    confirmed_cost: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    confirmed_revision: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    event_key: Mapped[str] = mapped_column(
        ForeignKey(
            "nobility_points_ledger.event_key",
            ondelete="CASCADE",
        ),
        unique=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
