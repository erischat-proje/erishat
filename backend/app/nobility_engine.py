"""Transactional LidyaChat nobility membership engine."""

import json
from uuid import uuid4
from datetime import datetime, timezone, timedelta

from sqlalchemy import select

from .models import User
from .nobility_models import (
    NobilityMembership,
    NobilityRankConfig,
    NobilityPointsLedger,
    NobilityAuditLog,
)
from .nobility_config import get_rank_rule
from .nobility_policy import enabled, effective_rank, utc
from .nobility_points import apply_points
from .nobility_funding import set_membership_funding
from .nobility_renewal_funding import register_renewal


def snapshot(member):
    return {
        "rank": member.rank,
        "points": str(member.points),
        "started_at": (
            utc(member.started_at).isoformat()
            if member.started_at else None
        ),
        "expires_at": (
            utc(member.expires_at).isoformat()
            if member.expires_at else None
        ),
    }


from .nobility_cancellation import ensure_not_cancelled


def activate_rank(db, user_id, rank, request_id):
    if not enabled():
        raise ValueError("Nobility disabled")

    rule = get_rank_rule(rank)

    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("PostgreSQL required")

    if not isinstance(request_id, str):
        raise ValueError("Invalid request ID")

    if not request_id.strip() or len(request_id) > 64:
        raise ValueError("Invalid request ID")

    event_key = f"nobility:activate:{user_id}:{request_id}"

    if len(event_key) > 160:
        raise ValueError("Invalid event key")

    with db.begin_nested():

        user = db.scalar(
            select(User.id)
            .where(User.id == user_id)
            .with_for_update()
        )

        if user is None:
            raise ValueError("User not found")

        ensure_not_cancelled(
            db, user_id, request_id
        )

        previous = db.get(
            NobilityPointsLedger,
            event_key,
            populate_existing=True,
        )

        if previous is not None:
            if (
                previous.user_id != user_id
                or previous.amount != -rule.required_points
                or previous.source != "rank_activation"
            ):
                raise ValueError("Request conflict")

            return {"applied": False, "duplicate": True}

        config = db.get(
            NobilityRankConfig,
            rank,
            populate_existing=True,
        )

        if (
            config is None
            or not config.enabled
            or config.required_points != rule.required_points
            or config.renewal_points != rule.renewal_points
            or config.duration_days != rule.duration_days
        ):
            raise ValueError("Rank configuration unavailable")

        member = db.scalar(
            select(NobilityMembership)
            .where(NobilityMembership.user_id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if member is None:
            raise ValueError("Insufficient points")

        now = datetime.now(timezone.utc)
        current_rank = effective_rank(member, now)

        if current_rank:
            raise ValueError("Active membership exists")

        if member.points < rule.required_points:
            raise ValueError("Insufficient points")

        before = snapshot(member)

        applied = apply_points(
            db,
            user_id,
            -rule.required_points,
            event_key,
            "rank_activation",
        )

        if not applied:
            raise RuntimeError("Unexpected duplicate")

        set_membership_funding(
            db, user_id, event_key,
        )

        member.rank = rank
        member.started_at = now
        member.expires_at = now + timedelta(
            days=rule.duration_days
        )

        after = snapshot(member)

        db.add(NobilityAuditLog(
            id=str(uuid4()),
            user_id=user_id,
            actor_id=user_id,
            action="rank_activation",
            before_state=json.dumps(before),
            after_state=json.dumps(after),
            reason="User rank activation",
        ))

        db.flush()

        return {
            "applied": True,
            "duplicate": False,
            **after,
        }


def upgrade_rank(db, user_id, rank, request_id):
    if not enabled():
        raise ValueError("Nobility disabled")

    rule = get_rank_rule(rank)

    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("PostgreSQL required")

    if not isinstance(request_id, str):
        raise ValueError("Invalid request ID")

    if not request_id.strip() or len(request_id) > 64:
        raise ValueError("Invalid request ID")

    event_key = f"nobility:upgrade:{user_id}:{request_id}"

    if len(event_key) > 160:
        raise ValueError("Invalid event key")

    with db.begin_nested():

        user = db.scalar(
            select(User.id)
            .where(User.id == user_id)
            .with_for_update()
        )

        if user is None:
            raise ValueError("User not found")

        ensure_not_cancelled(
            db, user_id, request_id
        )

        previous = db.get(
            NobilityPointsLedger,
            event_key,
            populate_existing=True,
        )

        if previous is not None:
            if (
                previous.user_id != user_id
                or previous.amount != -rule.required_points
                or previous.source != "rank_upgrade"
            ):
                raise ValueError("Request conflict")

            return {
                "applied": False,
                "duplicate": True,
            }

        config = db.get(
            NobilityRankConfig,
            rank,
            populate_existing=True,
        )

        if (
            config is None
            or not config.enabled
            or config.required_points != rule.required_points
            or config.renewal_points != rule.renewal_points
            or config.duration_days != rule.duration_days
        ):
            raise ValueError("Rank configuration unavailable")

        member = db.scalar(
            select(NobilityMembership)
            .where(NobilityMembership.user_id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if member is None:
            raise ValueError("Active membership required")

        now = datetime.now(timezone.utc)
        current_rank = effective_rank(member, now)

        if not current_rank:
            raise ValueError("Active membership required")

        if rank <= current_rank:
            raise ValueError("Higher rank required")

        if member.points < rule.required_points:
            raise ValueError("Insufficient points")

        before = snapshot(member)

        applied = apply_points(
            db,
            user_id,
            -rule.required_points,
            event_key,
            "rank_upgrade",
        )

        if not applied:
            raise RuntimeError("Unexpected duplicate")

        set_membership_funding(
            db, user_id, event_key,
        )

        member.rank = rank
        member.started_at = now
        member.expires_at = now + timedelta(
            days=rule.duration_days
        )

        after = snapshot(member)

        db.add(NobilityAuditLog(
            id=str(uuid4()),
            user_id=user_id,
            actor_id=user_id,
            action="rank_upgrade",
            before_state=json.dumps(before),
            after_state=json.dumps(after),
            reason="User rank upgrade",
        ))

        db.flush()

        return {
            "applied": True,
            "duplicate": False,
            **after,
        }


def renew_rank(db, user_id, rank, request_id):
    if not enabled():
        raise ValueError("Nobility disabled")

    rule = get_rank_rule(rank)

    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("PostgreSQL required")

    if not isinstance(request_id, str):
        raise ValueError("Invalid request ID")

    if not request_id.strip() or len(request_id) > 64:
        raise ValueError("Invalid request ID")

    event_key = f"nobility:renew:{user_id}:{request_id}"

    if len(event_key) > 160:
        raise ValueError("Invalid event key")

    with db.begin_nested():

        user = db.scalar(
            select(User.id)
            .where(User.id == user_id)
            .with_for_update()
        )

        if user is None:
            raise ValueError("User not found")

        ensure_not_cancelled(
            db, user_id, request_id
        )

        previous = db.get(
            NobilityPointsLedger,
            event_key,
            populate_existing=True,
        )

        if previous is not None:
            if (
                previous.user_id != user_id
                or previous.amount != -rule.renewal_points
                or previous.source != "rank_renewal"
            ):
                raise ValueError("Request conflict")

            return {
                "applied": False,
                "duplicate": True,
            }

        config = db.get(
            NobilityRankConfig,
            rank,
            populate_existing=True,
        )

        if (
            config is None
            or not config.enabled
            or config.required_points != rule.required_points
            or config.renewal_points != rule.renewal_points
            or config.duration_days != rule.duration_days
        ):
            raise ValueError("Rank configuration unavailable")

        member = db.scalar(
            select(NobilityMembership)
            .where(NobilityMembership.user_id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if member is None:
            raise ValueError("Active membership required")

        now = datetime.now(timezone.utc)
        current_rank = effective_rank(member, now)

        if not current_rank:
            raise ValueError("Active membership required")

        if current_rank != rank:
            raise ValueError("Rank mismatch")

        if member.points < rule.renewal_points:
            raise ValueError("Insufficient points")

        before = snapshot(member)

        new_expiry = utc(
            member.expires_at
        ) + timedelta(days=rule.duration_days)

        applied = apply_points(
            db,
            user_id,
            -rule.renewal_points,
            event_key,
            "rank_renewal",
        )

        if not applied:
            raise RuntimeError("Unexpected duplicate")

        registered = register_renewal(
            db, user_id, rank, event_key,
        )

        if not registered:
            raise RuntimeError("Unexpected renewal duplicate")

        member.expires_at = new_expiry

        after = snapshot(member)

        db.add(NobilityAuditLog(
            id=str(uuid4()),
            user_id=user_id,
            actor_id=user_id,
            action="rank_renewal",
            before_state=json.dumps(before),
            after_state=json.dumps(after),
            reason="User rank renewal",
        ))

        db.flush()

        return {
            "applied": True,
            "duplicate": False,
            **after,
        }
