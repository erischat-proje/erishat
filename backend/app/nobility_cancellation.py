"""Durable cancellation of unresolved nobility actions."""

import logging

from fastapi import HTTPException
from sqlalchemy import select

from .models import User
from .nobility_models import (
    NobilityActionRejection,
    NobilityPointsLedger,
)
from .nobility_requests import NobilityCancellationRequest
from .nobility_confirmation_store import (
    read_confirmation,
    verify_stored_confirmation,
)

logger = logging.getLogger(__name__)

SOURCES = {
    "activate": "rank_activation",
    "upgrade": "rank_upgrade",
    "renew": "rank_renewal",
}


def ensure_not_cancelled(db, user_id, request_id):
    """Caller must hold the PostgreSQL user lock."""

    record = db.get(
        NobilityActionRejection,
        (user_id, request_id),
        populate_existing=True,
    )

    if record is not None:
        raise ValueError("Request cancelled")


def cancellation_response(payload, status, duplicate):
    return {
        "ok": True,
        "user_id": payload.user_id,
        "request_id": payload.request_id,
        "action": payload.action,
        "rank": payload.rank,
        "confirmed_cost": payload.confirmed_cost,
        "confirmed_revision": payload.confirmed_revision,
        "status": status,
        "duplicate": duplicate,
    }


def cancel_action(db, user_id, payload):
    try:
        if type(payload) is not NobilityCancellationRequest:
            raise RuntimeError("Invalid cancellation request")

        if payload.user_id != user_id:
            raise HTTPException(
                403, detail="account_mismatch"
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

        keys = [
            f"nobility:{action}:{user_id}:{payload.request_id}"
            for action in SOURCES
        ]

        rows = db.scalars(
            select(NobilityPointsLedger)
            .where(NobilityPointsLedger.event_key.in_(keys))
            .execution_options(populate_existing=True)
        ).all()

        rejection = db.get(
            NobilityActionRejection,
            (user_id, payload.request_id),
            populate_existing=True,
        )

        stored = read_confirmation(
            db, user_id, payload.request_id
        )

        if stored is not None and (
            not rows or rejection is not None
        ):
            raise HTTPException(
                409, detail="request_conflict"
            )

        if rows:
            if len(rows) != 1 or rejection is not None:
                raise HTTPException(
                    409, detail="request_conflict"
                )

            row = rows[0]

            expected_key = (
                f"nobility:{payload.action}:"
                f"{user_id}:{payload.request_id}"
            )

            if (
                row.event_key != expected_key
                or row.user_id != user_id
                or row.source != SOURCES[payload.action]
                or row.amount != -int(payload.confirmed_cost)
            ):
                raise HTTPException(
                    409, detail="request_conflict"
                )

            verify_stored_confirmation(
                db,
                user_id,
                payload.action,
                payload,
            )

            response = cancellation_response(
                payload, "completed", True
            )

        elif rejection is not None:
            if (
                rejection.action != payload.action
                or rejection.rank != payload.rank
                or rejection.confirmed_cost
                != int(payload.confirmed_cost)
                or rejection.confirmed_revision
                != payload.confirmed_revision
                or rejection.reason != "user_cancelled"
            ):
                raise HTTPException(
                    409, detail="request_conflict"
                )

            response = cancellation_response(
                payload, "cancelled", True
            )

        else:
            db.add(
                NobilityActionRejection(
                    user_id=user_id,
                    request_id=payload.request_id,
                    action=payload.action,
                    rank=payload.rank,
                    confirmed_cost=int(
                        payload.confirmed_cost
                    ),
                    confirmed_revision=(
                        payload.confirmed_revision
                    ),
                    reason="user_cancelled",
                )
            )

            db.flush()

            response = cancellation_response(
                payload, "cancelled", False
            )

        db.commit()
        return response

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        logger.exception(
            "Nobility cancellation failed"
        )

        raise HTTPException(
            500, detail="nobility_cancellation_failed"
        ) from None
