"""Transactional full and partial nobility refunds."""

import json
from uuid import uuid4
from datetime import datetime, timezone

from sqlalchemy import select

from .models import User
from .nobility_models import (
    NobilityMembership,
    NobilityPointLot,
    NobilityPointsLedger,
    NobilityRefundEvent,
    NobilityAuditLog,
)
from .nobility_engine import snapshot
from .nobility_event_lock import lock_event_key
from .nobility_policy import effective_rank
from .nobility_funding import valid_membership_points
from .nobility_refund_policy import rank_after_refund
from .nobility_renewal_funding import revoke_invalid_renewals
from .nobility_partial_allocations import distribute_refund


def refund_points(
    db,
    user_id,
    lot_event_key,
    refund_key,
    *,
    points=None,
):
    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("PostgreSQL required")

    for key in (lot_event_key, refund_key):
        if (
            not isinstance(key, str)
            or not key.strip()
            or len(key) > 160
        ):
            raise ValueError("Invalid refund key")

    full_request = points is None

    if not full_request and (
        type(points) is not int
        or points <= 0
        or points > 9223372036854775807
    ):
        raise ValueError("Invalid refund amount")

    with db.begin_nested():

        user = db.scalar(
            select(User.id)
            .where(User.id == user_id)
            .with_for_update()
        )

        if user is None:
            raise ValueError("User not found")

        lock_event_key(db, refund_key)

        lot = db.scalar(
            select(NobilityPointLot)
            .where(
                NobilityPointLot.event_key == lot_event_key,
                NobilityPointLot.user_id == user_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if lot is None:
            raise ValueError("Point source not found")

        previous = db.get(
            NobilityRefundEvent,
            refund_key,
            populate_existing=True,
        )

        if previous is not None:

            if previous.lot_event_key != lot_event_key:
                raise ValueError("Refund key conflict")

            if previous.is_full_request != full_request:
                raise ValueError("Refund request conflict")

            if (
                not full_request
                and previous.refunded_points != points
            ):
                raise ValueError("Refund amount conflict")

            return {
                "applied": False,
                "duplicate": True,
            }

        existing_ledger = db.get(
            NobilityPointsLedger,
            refund_key,
            populate_existing=True,
        )

        if existing_ledger is not None:
            raise ValueError("Refund ledger key conflict")

        available = (
            lot.original_points - lot.refunded_points
        )

        if lot.refunded:

            if available != 0:
                raise RuntimeError("Invalid refund state")

            if full_request:
                return {
                    "applied": False,
                    "duplicate": True,
                }

            raise ValueError("Point source fully refunded")

        if available <= 0:
            raise RuntimeError("Invalid refund state")

        amount = available if full_request else points

        if amount > available:
            raise ValueError("Refund exceeds available points")

        member = db.scalar(
            select(NobilityMembership)
            .where(
                NobilityMembership.user_id == user_id
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if member is None:
            raise RuntimeError("Membership missing")

        before = snapshot(member)
        now = datetime.now(timezone.utc)
        rank_before = effective_rank(member, now)

        distribution = distribute_refund(
            db,
            user_id,
            lot_event_key,
            amount,
        )

        removed = distribution["removed_balance"]

        if removed > member.points:
            raise RuntimeError("Point balance mismatch")

        member.points -= removed

        if removed:
            db.add(NobilityPointsLedger(
                event_key=refund_key,
                user_id=user_id,
                amount=-removed,
                source="purchase_refund",
            ))

        db.flush()

        removed_days = revoke_invalid_renewals(
            db, user_id, now,
        )

        rank_after = effective_rank(member, now)

        if rank_after:
            valid_points = valid_membership_points(
                db, user_id
            )

            rank_after = rank_after_refund(
                rank_after,
                valid_points,
            )

            member.rank = rank_after

            if rank_after == 0:
                member.started_at = None
                member.expires_at = None

        db.add(NobilityRefundEvent(
            lot_event_key=lot_event_key,
            refund_key=refund_key,
            is_full_request=full_request,
            refunded_points=amount,
            removed_balance=removed,
            rank_before=rank_before,
            rank_after=rank_after,
        ))

        after = snapshot(member)

        db.add(NobilityAuditLog(
            id=str(uuid4()),
            user_id=user_id,
            actor_id=None,
            action="purchase_refund",
            before_state=json.dumps(before),
            after_state=json.dumps(after),
            reason=json.dumps({
                "version": 1,
                "event": "purchase_refund",
                "lot_event_key": lot_event_key,
                "refund_key": refund_key,
                "refund_type": (
                    "full" if full_request else "partial"
                ),
                "refunded_points": amount,
                "removed_balance": removed,
                "removed_spent": distribution["removed_spent"],
                "total_refunded": distribution["total_refunded"],
                "fully_refunded": distribution["fully_refunded"],
                "revoked_allocations": distribution["revoked_allocations"],
                "removed_days": removed_days,
                "rank_before": rank_before,
                "rank_after": rank_after,
                "processed_at": now.isoformat(),
            }, sort_keys=True),
        ))

        db.flush()

        return {
            "applied": True,
            "duplicate": False,
            **distribution,
            "removed_days": removed_days,
            "rank_before": rank_before,
            "rank_after": rank_after,
            **after,
        }
