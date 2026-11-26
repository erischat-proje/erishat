"""Durable financial confirmation service tests."""

from uuid import uuid4

import pytest

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import User

from backend.app.nobility_models import (
    NobilityActionConfirmation,
    NobilityActionRejection,
    NobilityPointsLedger,
)

from backend.app.nobility_requests import (
    NobilityActionRequest,
)

from backend.app.nobility_confirmation_store import (
    record_confirmation,
    verify_stored_confirmation,
)

from test_nobility_postgres_v1 import scoped_db


CASES = [
    ("activate", 1, 400000, "rank_activation"),
    ("activate", 2, 800000, "rank_activation"),
    ("activate", 3, 1600000, "rank_activation"),
    ("activate", 4, 3200000, "rank_activation"),
    ("upgrade", 2, 800000, "rank_upgrade"),
    ("upgrade", 3, 1600000, "rank_upgrade"),
    ("upgrade", 4, 3200000, "rank_upgrade"),
    ("renew", 1, 100000, "rank_renewal"),
    ("renew", 2, 200000, "rank_renewal"),
    ("renew", 3, 400000, "rank_renewal"),
    ("renew", 4, 800000, "rank_renewal"),
]


def lock_user(db, user_id="u1"):
    assert db.scalar(
        select(User.id)
        .where(User.id == user_id)
        .with_for_update()
    ) == user_id


def prepare(
    db,
    action="activate",
    rank=1,
    cost=400000,
    source="rank_activation",
):
    lock_user(db)

    payload = NobilityActionRequest(
        rank=rank,
        request_id=str(uuid4()),
        confirmed_revision="a" * 64,
        confirmed_cost=str(cost),
    )

    event_key = (
        f"nobility:{action}:u1:"
        f"{payload.request_id}"
    )

    row = NobilityPointsLedger(
        event_key=event_key,
        user_id="u1",
        amount=-cost,
        source=source,
    )

    db.add(row)
    db.flush()

    return payload, row


@pytest.mark.parametrize(
    "action,rank,cost,source",
    CASES,
)
def test_valid_confirmation(
    scoped_db, action, rank, cost, source
):
    with Session(scoped_db) as db:
        payload, row = prepare(
            db, action, rank, cost, source
        )

        assert record_confirmation(
            db, "u1", action, payload
        ) is True

        db.commit()

    with Session(scoped_db) as db:
        lock_user(db)

        record = verify_stored_confirmation(
            db, "u1", action, payload
        )

        assert record.rank == rank
        assert record.confirmed_cost == cost
        assert record.action == action
        assert record.confirmed_revision == "a" * 64


def test_idempotent_confirmation(scoped_db):
    with Session(scoped_db) as db:
        payload, row = prepare(db)

        assert record_confirmation(
            db, "u1", "activate", payload
        ) is True

        assert record_confirmation(
            db, "u1", "activate", payload
        ) is False

        assert len(db.scalars(
            select(NobilityActionConfirmation)
        ).all()) == 1


@pytest.mark.parametrize(
    "changes",
    [
        {"confirmed_revision": "b" * 64},
        {"confirmed_revision": None},
        {"confirmed_revision": "invalid"},
        {"confirmed_cost": "400001"},
        {"confirmed_cost": None},
        {"confirmed_cost": "0400000"},
        {"rank": 2},
    ],
)
def test_changed_confirmation(scoped_db, changes):
    with Session(scoped_db) as db:
        payload, row = prepare(db)

        record_confirmation(
            db, "u1", "activate", payload
        )

        data = payload.model_dump()
        data.update(changes)

        changed = NobilityActionRequest(**data)

        with pytest.raises(HTTPException) as exc:
            verify_stored_confirmation(
                db, "u1", "activate", changed
            )

        assert exc.value.status_code == 409


@pytest.mark.parametrize(
    "field,value",
    [
        ("user_id", "u2"),
        ("amount", -399999),
        ("amount", 400000),
        ("source", "rank_upgrade"),
        ("source", "rank_renewal"),
    ],
)
def test_invalid_ledger(scoped_db, field, value):
    with Session(scoped_db) as db:
        payload, row = prepare(db)

        setattr(row, field, value)
        db.flush()

        with pytest.raises(HTTPException) as exc:
            record_confirmation(
                db, "u1", "activate", payload
            )

        assert exc.value.status_code == 409

        assert db.scalars(
            select(NobilityActionConfirmation)
        ).all() == []


def test_missing_ledger(scoped_db):
    with Session(scoped_db) as db:
        payload, row = prepare(db)

        db.delete(row)
        db.flush()

        with pytest.raises(HTTPException) as exc:
            record_confirmation(
                db, "u1", "activate", payload
            )

        assert exc.value.status_code == 409


def test_legacy_confirmation_unavailable(scoped_db):
    with Session(scoped_db) as db:
        payload, row = prepare(db)

        with pytest.raises(HTTPException) as exc:
            verify_stored_confirmation(
                db, "u1", "activate", payload
            )

        assert exc.value.status_code == 409
        assert exc.value.detail == (
            "confirmation_unavailable"
        )


def test_cancelled_request(scoped_db):
    with Session(scoped_db) as db:
        payload, row = prepare(db)

        db.add(
            NobilityActionRejection(
                user_id="u1",
                request_id=payload.request_id,
                action="activate",
                rank=1,
                confirmed_cost=400000,
                confirmed_revision="a" * 64,
                reason="user_cancelled",
            )
        )

        db.flush()

        with pytest.raises(HTTPException) as exc:
            record_confirmation(
                db, "u1", "activate", payload
            )

        assert exc.value.status_code == 409


def test_changed_action(scoped_db):
    with Session(scoped_db) as db:
        payload, row = prepare(db)

        record_confirmation(
            db, "u1", "activate", payload
        )

        with pytest.raises(HTTPException) as exc:
            verify_stored_confirmation(
                db, "u1", "upgrade", payload
            )

        assert exc.value.status_code == 409


def test_wrong_price(scoped_db):
    with Session(scoped_db) as db:
        payload, row = prepare(
            db, cost=400001
        )

        with pytest.raises(HTTPException) as exc:
            record_confirmation(
                db, "u1", "activate", payload
            )

        assert exc.value.status_code == 409


def test_no_independent_commit(scoped_db):
    with Session(scoped_db) as db:
        payload, row = prepare(db)
        event_key = row.event_key

        record_confirmation(
            db, "u1", "activate", payload
        )

        db.rollback()

    with Session(scoped_db) as db:
        assert db.get(
            NobilityActionConfirmation,
            ("u1", payload.request_id),
        ) is None

        assert db.get(
            NobilityPointsLedger,
            event_key,
        ) is None
