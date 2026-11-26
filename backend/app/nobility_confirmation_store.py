"""Durable nobility financial confirmation storage."""

from fastapi import HTTPException

from .nobility_models import (
    NobilityActionConfirmation,
    NobilityActionRejection,
    NobilityPointsLedger,
)

from .nobility_confirmation import (
    valid_revision,
    valid_cost,
    expected_cost,
)

from .nobility_requests import NobilityActionRequest


SOURCES = {
    "activate": "rank_activation",
    "upgrade": "rank_upgrade",
    "renew": "rank_renewal",
}


def conflict():
    raise HTTPException(
        409,
        detail="request_conflict",
    )


def read_confirmation(db, user_id, request_id):
    return db.get(
        NobilityActionConfirmation,
        (user_id, request_id),
        populate_existing=True,
    )


def validate_identity(user_id, action, payload):
    if not isinstance(payload, NobilityActionRequest):
        raise RuntimeError("Invalid confirmation request")

    if action not in SOURCES:
        raise RuntimeError("Invalid confirmation action")

    if (
        type(user_id) is not str
        or not user_id
        or len(user_id) > 64
        or user_id.strip() != user_id
    ):
        raise RuntimeError("Invalid confirmation owner")

    if not valid_revision(payload.confirmed_revision):
        conflict()

    if not valid_cost(payload.confirmed_cost):
        conflict()

    return (
        f"nobility:{action}:"
        f"{user_id}:{payload.request_id}"
    )


def validate_ledger(
    db,
    user_id,
    action,
    payload,
    event_key,
):
    row = db.get(
        NobilityPointsLedger,
        event_key,
        populate_existing=True,
    )

    if (
        row is None
        or row.event_key != event_key
        or row.user_id != user_id
        or row.source != SOURCES[action]
        or row.amount != -int(payload.confirmed_cost)
    ):
        conflict()

    return row


def ensure_no_rejection(db, user_id, request_id):
    rejection = db.get(
        NobilityActionRejection,
        (user_id, request_id),
        populate_existing=True,
    )

    if rejection is not None:
        conflict()


def verify_stored_confirmation(
    db,
    user_id,
    action,
    payload,
):
    """Caller must hold the PostgreSQL user lock."""

    event_key = validate_identity(
        user_id, action, payload
    )

    record = read_confirmation(
        db, user_id, payload.request_id
    )

    if record is None:
        raise HTTPException(
            409,
            detail="confirmation_unavailable",
        )

    if (
        record.user_id != user_id
        or record.request_id != payload.request_id
        or record.action != action
        or record.rank != payload.rank
        or record.confirmed_cost
        != int(payload.confirmed_cost)
        or record.confirmed_revision
        != payload.confirmed_revision
        or record.event_key != event_key
    ):
        conflict()

    ensure_no_rejection(
        db, user_id, payload.request_id
    )

    validate_ledger(
        db, user_id, action, payload, event_key
    )

    return record


def record_confirmation(
    db,
    user_id,
    action,
    payload,
):
    """Persist an already validated financial action.

    Caller must hold the PostgreSQL user lock,
    validate the original confirmation before applying
    the action, and own the surrounding transaction.
    This function never commits.
    """

    if db.get_bind().dialect.name != "postgresql":
        raise HTTPException(
            503,
            detail="nobility_unavailable",
        )

    event_key = validate_identity(
        user_id, action, payload
    )

    ensure_no_rejection(
        db, user_id, payload.request_id
    )

    if read_confirmation(
        db, user_id, payload.request_id
    ) is not None:
        verify_stored_confirmation(
            db, user_id, action, payload
        )
        return False

    if payload.confirmed_cost != expected_cost(
        action, payload.rank
    ):
        conflict()

    validate_ledger(
        db, user_id, action, payload, event_key
    )

    db.add(
        NobilityActionConfirmation(
            user_id=user_id,
            request_id=payload.request_id,
            action=action,
            rank=payload.rank,
            confirmed_cost=int(
                payload.confirmed_cost
            ),
            confirmed_revision=(
                payload.confirmed_revision
            ),
            event_key=event_key,
        )
    )

    db.flush()

    return True
