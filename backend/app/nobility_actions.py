"""Authenticated nobility transaction boundary."""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select

from .models import User
from .nobility_models import (
    NobilityMembership,
    NobilityPointsLedger,
)
from .nobility_engine import (
    activate_rank,
    upgrade_rank,
    renew_rank,
)
from .nobility_policy import (
    enabled,
    authorized_rank_for_member,
    privileges_for_rank,
    RANK_NAMES,
    utc,
)
from .nobility_requests import NobilityActionRequest
from .nobility_revision import membership_revision
from .nobility_cancellation import ensure_not_cancelled
from .nobility_confirmation import verify_confirmation
from .nobility_confirmation_store import (
    read_confirmation,
    record_confirmation,
    verify_stored_confirmation,
)
from .nobility_policy import effective_rank



logger = logging.getLogger(__name__)

ACTIONS = {
    "activate": activate_rank,
    "upgrade": upgrade_rank,
    "renew": renew_rank,
}

BUSINESS_ERRORS = {
    "Insufficient points": "insufficient_points",
    "Active membership exists": "active_membership_exists",
    "Active membership required": "active_membership_required",
    "Higher rank required": "higher_rank_required",
    "Rank mismatch": "rank_mismatch",
    "Request conflict": "request_conflict",
    "Request cancelled": "request_cancelled",
    "Event key conflict": "request_conflict",
}


def membership_state(db, user_id):
    now = datetime.now(timezone.utc)
    system_enabled = enabled()

    member = db.get(
        NobilityMembership,
        user_id,
        populate_existing=True,
    )

    rank = authorized_rank_for_member(
        db,
        member,
        system_enabled=system_enabled,
        at=now,
    )

    return {
        "user_id": str(user_id),
        "configuration_valid": (
            effective_rank(member, now) == rank
            if system_enabled else False
        ),
        "revision": membership_revision(
            user_id,
            member,
            authorized_rank=rank,
            system_enabled=system_enabled,
            at=now,
        ),
        "enabled": system_enabled,
        "rank": rank,
        "rank_name": RANK_NAMES[rank],
        "points": str(member.points if member else 0),
        "active": rank > 0,
        "started_at": (
            utc(member.started_at).isoformat()
            if rank and member.started_at else None
        ),
        "expires_at": (
            utc(member.expires_at).isoformat()
            if rank and member.expires_at else None
        ),
        "privileges": privileges_for_rank(rank),
    }


def execute_action(db, user_id, action, payload):
    try:
        if action not in ACTIONS:
            raise RuntimeError("Unknown action")

        if not isinstance(payload, NobilityActionRequest):
            raise RuntimeError("Invalid request object")

        if not enabled():
            raise HTTPException(
                503, detail="nobility_disabled"
            )

        if db.get_bind().dialect.name != "postgresql":
            raise HTTPException(
                503, detail="nobility_unavailable"
            )

        user = db.execute(
            select(User.id, User.is_active)
            .where(User.id == user_id)
            .with_for_update()
        ).one_or_none()

        if user is None or not user.is_active:
            raise HTTPException(
                403, detail="inactive_account"
            )

        ensure_not_cancelled(
            db, user_id, payload.request_id
        )

        # Serialize all membership actions by user.
        # Reject reuse across different action types.
        other_keys = [
            f"nobility:{name}:{user_id}:{payload.request_id}"
            for name in ACTIONS
            if name != action
        ]

        conflict = db.scalar(
            select(NobilityPointsLedger.event_key)
            .where(
                NobilityPointsLedger.event_key.in_(other_keys)
            )
            .limit(1)
        )

        if conflict is not None:
            raise HTTPException(
                409, detail="request_conflict"
            )

        event_key = (
            f"nobility:{action}:{user_id}:{payload.request_id}"
        )

        previous = db.get(
            NobilityPointsLedger,
            event_key,
            populate_existing=True,
        )

        stored = read_confirmation(
            db, user_id, payload.request_id
        )

        if stored is not None:
            verify_stored_confirmation(
                db, user_id, action, payload
            )

        # Legacy ledger entries are never backfilled
        # with unverified confirmation data.
        if previous is None:
            state = membership_state(db, user_id)

            if (
                not state["enabled"]
                or not state["configuration_valid"]
            ):
                raise HTTPException(
                    503,
                    detail="nobility_unavailable",
                )

            verify_confirmation(
                action=action,
                rank=payload.rank,
                confirmed_revision=payload.confirmed_revision,
                confirmed_cost=payload.confirmed_cost,
                current_revision=state["revision"],
            )

        result = ACTIONS[action](
            db,
            user_id,
            payload.rank,
            payload.request_id,
        )

        if previous is None:
            if (
                result["applied"] is not True
                or result["duplicate"] is not False
            ):
                raise RuntimeError(
                    "Unexpected financial action result"
                )

            if not record_confirmation(
                db, user_id, action, payload
            ):
                raise RuntimeError(
                    "Unexpected confirmation duplicate"
                )

        response = {
            "ok": True,
            "action": action,
            "applied": result["applied"],
            "duplicate": result["duplicate"],
            "membership": membership_state(db, user_id),
        }

        db.commit()
        return response

    except HTTPException:
        db.rollback()
        raise

    except ValueError as exc:
        db.rollback()

        message = str(exc)

        if message in BUSINESS_ERRORS:
            raise HTTPException(
                409,
                detail=BUSINESS_ERRORS[message],
            ) from None

        if message in (
            "Nobility disabled",
            "Rank configuration unavailable",
        ):
            raise HTTPException(
                503, detail="nobility_unavailable"
            ) from None

        logger.exception("Nobility validation failure")

        raise HTTPException(
            500, detail="nobility_action_failed"
        ) from None

    except Exception:
        db.rollback()

        logger.exception("Nobility transaction failed")

        raise HTTPException(
            500, detail="nobility_action_failed"
        ) from None
