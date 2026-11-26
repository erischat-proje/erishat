"""Durable financial confirmation PostgreSQL tests."""

from uuid import uuid4

import pytest

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.models import User
from backend.app.nobility_models import (
    NobilityActionConfirmation,
    NobilityPointsLedger,
)

from test_nobility_postgres_v1 import scoped_db


def prepare(db):
    request_id = str(uuid4())

    event_key = (
        f"nobility:activate:u1:{request_id}"
    )

    db.add(
        NobilityPointsLedger(
            event_key=event_key,
            user_id="u1",
            amount=-400000,
            source="rank_activation",
        )
    )

    db.flush()

    return {
        "user_id": "u1",
        "request_id": request_id,
        "action": "activate",
        "rank": 1,
        "confirmed_cost": 400000,
        "confirmed_revision": "a" * 64,
        "event_key": event_key,
    }


def test_confirmation_persistence(scoped_db):
    with Session(scoped_db) as db:
        data = prepare(db)

        db.add(
            NobilityActionConfirmation(**data)
        )

        db.commit()

    with Session(scoped_db) as db:
        row = db.get(
            NobilityActionConfirmation,
            ("u1", data["request_id"]),
        )

        assert row is not None

        for key, value in data.items():
            assert getattr(row, key) == value

        assert row.created_at is not None


@pytest.mark.parametrize(
    "changes",
    [
        {"action": "invalid"},
        {"rank": 0},
        {"rank": 5},
        {"confirmed_cost": 0},
        {"confirmed_cost": -1},
        {"request_id": "short"},
        {"confirmed_revision": "short"},
        {"confirmed_revision": None},
        {"event_key": "missing-ledger"},
        {"user_id": "missing-user"},
    ],
)
def test_invalid_confirmation(scoped_db, changes):
    with Session(scoped_db) as db:
        data = prepare(db)
        data.update(changes)

        db.add(
            NobilityActionConfirmation(**data)
        )

        with pytest.raises(IntegrityError):
            db.flush()

        db.rollback()

    with Session(scoped_db) as db:
        assert db.scalars(
            select(NobilityActionConfirmation)
        ).all() == []


def test_duplicate_request(scoped_db):
    with Session(scoped_db) as db:
        data = prepare(db)

        db.add(
            NobilityActionConfirmation(**data)
        )

        db.commit()

        db.add(
            NobilityActionConfirmation(**data)
        )

        with pytest.raises(IntegrityError):
            db.flush()

        db.rollback()


def test_duplicate_ledger_link(scoped_db):
    with Session(scoped_db) as db:
        data = prepare(db)

        db.add(
            NobilityActionConfirmation(**data)
        )

        db.commit()

        data["request_id"] = str(uuid4())

        db.add(
            NobilityActionConfirmation(**data)
        )

        with pytest.raises(IntegrityError):
            db.flush()

        db.rollback()


def test_transaction_rollback(scoped_db):
    with Session(scoped_db) as db:
        data = prepare(db)

        db.add(
            NobilityActionConfirmation(**data)
        )

        db.flush()
        db.rollback()

    with Session(scoped_db) as db:
        assert db.get(
            NobilityActionConfirmation,
            ("u1", data["request_id"]),
        ) is None

        assert db.get(
            NobilityPointsLedger,
            data["event_key"],
        ) is None


def test_ledger_cascade(scoped_db):
    with Session(scoped_db) as db:
        data = prepare(db)

        db.add(
            NobilityActionConfirmation(**data)
        )

        db.commit()

        db.execute(
            delete(NobilityPointsLedger)
            .where(
                NobilityPointsLedger.event_key
                == data["event_key"]
            )
        )

        db.commit()

    with Session(scoped_db) as db:
        assert db.get(
            NobilityActionConfirmation,
            ("u1", data["request_id"]),
        ) is None


def test_account_cascade(scoped_db):
    with Session(scoped_db) as db:
        data = prepare(db)

        db.add(
            NobilityActionConfirmation(**data)
        )

        db.commit()

        db.execute(
            delete(User)
            .where(User.id == "u1")
        )

        db.commit()

    with Session(scoped_db) as db:
        assert db.get(
            NobilityActionConfirmation,
            ("u1", data["request_id"]),
        ) is None

        assert db.get(
            NobilityPointsLedger,
            data["event_key"],
        ) is None
