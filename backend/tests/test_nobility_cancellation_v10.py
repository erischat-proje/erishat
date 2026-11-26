from uuid import uuid4

import pytest

from fastapi import HTTPException
from sqlalchemy import select, update, delete
from sqlalchemy.orm import Session

from backend.app.models import User
from backend.app.nobility_models import (
    NobilityActionRejection,
    NobilityMembership,
    NobilityPointsLedger,
)
from backend.app.nobility_requests import (
    NobilityCancellationRequest,
    NobilityActionRequest,
)
from backend.app.nobility_cancellation import (
    cancel_action,
)
from backend.app.nobility_actions import execute_action
from backend.app.nobility_engine import (
    activate_rank,
    upgrade_rank,
    renew_rank,
)
from backend.app.nobility_points import apply_points

from backend.tests.test_nobility_postgres_v1 import (
    scoped_db,
)


def request(**changes):
    data = {
        "user_id": "u1",
        "request_id": str(uuid4()),
        "action": "activate",
        "rank": 1,
        "confirmed_cost": "400000",
        "confirmed_revision": "a" * 64,
    }

    data.update(changes)

    return NobilityCancellationRequest(**data)


def test_cancel_without_financial_write(scoped_db):
    payload = request()

    with Session(scoped_db) as db:
        result = cancel_action(db, "u1", payload)

        assert result["status"] == "cancelled"
        assert result["duplicate"] is False

    with Session(scoped_db) as db:
        assert db.get(
            NobilityActionRejection,
            ("u1", payload.request_id),
        ) is not None

        assert db.get(NobilityMembership, "u1") is None

        assert db.scalars(
            select(NobilityPointsLedger)
        ).all() == []


def test_duplicate_cancellation(scoped_db):
    payload = request()

    with Session(scoped_db) as db:
        cancel_action(db, "u1", payload)

    with Session(scoped_db) as db:
        result = cancel_action(db, "u1", payload)

        assert result["status"] == "cancelled"
        assert result["duplicate"] is True


def test_wrong_account(scoped_db):
    payload = request(user_id="u2")

    with Session(scoped_db) as db:
        with pytest.raises(HTTPException) as exc:
            cancel_action(db, "u1", payload)

        assert exc.value.status_code == 403

        assert db.scalars(
            select(NobilityActionRejection)
        ).all() == []


@pytest.mark.parametrize(
    "changes",
    [
        {"action": "upgrade"},
        {"rank": 2},
        {"confirmed_cost": "800000"},
        {"confirmed_revision": "b" * 64},
    ],
)
def test_changed_cancellation_conflict(
    scoped_db, changes
):
    payload = request()

    with Session(scoped_db) as db:
        cancel_action(db, "u1", payload)

    changed = request(
        **{
            **payload.model_dump(),
            **changes,
        }
    )

    with Session(scoped_db) as db:
        with pytest.raises(HTTPException) as exc:
            cancel_action(db, "u1", changed)

        assert exc.value.status_code == 409
        assert exc.value.detail == "request_conflict"


@pytest.mark.parametrize(
    "engine",
    [activate_rank, upgrade_rank, renew_rank],
)
def test_cancelled_direct_engine_blocked(
    scoped_db, engine
):
    payload = request()

    with Session(scoped_db) as db:
        apply_points(
            db, "u1", 800000,
            "test-credit", "test",
        )
        db.commit()

        cancel_action(db, "u1", payload)

    with Session(scoped_db) as db:
        with pytest.raises(
            ValueError, match="Request cancelled"
        ):
            engine(
                db, "u1", 1,
                payload.request_id,
            )

        db.rollback()

    with Session(scoped_db) as db:
        assert db.get(
            NobilityMembership, "u1"
        ).points == 800000

        assert len(db.scalars(
            select(NobilityPointsLedger)
        ).all()) == 1


@pytest.mark.parametrize(
    "action",
    ["activate", "upgrade", "renew"],
)
def test_cancelled_api_action_blocked(
    scoped_db, action
):
    payload = request()

    with Session(scoped_db) as db:
        cancel_action(db, "u1", payload)

    action_payload = NobilityActionRequest(
        rank=payload.rank,
        request_id=payload.request_id,
        confirmed_revision=payload.confirmed_revision,
        confirmed_cost=payload.confirmed_cost,
    )

    with Session(scoped_db) as db:
        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", action, action_payload
            )

        assert exc.value.status_code == 409
        assert exc.value.detail == "request_cancelled"


def test_same_uuid_different_accounts(scoped_db):
    payload = request()

    with Session(scoped_db) as db:
        cancel_action(db, "u1", payload)

        result = cancel_action(
            db,
            "u2",
            request(
                user_id="u2",
                request_id=payload.request_id,
            ),
        )

        assert result["status"] == "cancelled"
        assert result["duplicate"] is False


def test_inactive_account(scoped_db):
    with Session(scoped_db) as db:
        result = db.execute(
            update(User)
            .where(User.id == "u1")
            .values(is_active=False)
        )

        assert result.rowcount == 1
        db.commit()

        with pytest.raises(HTTPException) as exc:
            cancel_action(db, "u1", request())

        assert exc.value.status_code == 403


def test_account_deletion_cascade(scoped_db):
    payload = request()

    with Session(scoped_db) as db:
        cancel_action(db, "u1", payload)

        result = db.execute(
            delete(User)
            .where(User.id == "u1")
        )

        assert result.rowcount == 1
        db.commit()

    with Session(scoped_db) as db:
        assert db.get(
            NobilityActionRejection,
            ("u1", payload.request_id),
        ) is None


def test_cancellation_commit_failure(scoped_db, monkeypatch):
    payload = request()

    with Session(scoped_db) as db:
        def fail():
            raise RuntimeError("Commit failed")

        monkeypatch.setattr(db, "commit", fail)

        with pytest.raises(HTTPException) as exc:
            cancel_action(db, "u1", payload)

        assert exc.value.status_code == 500

    with Session(scoped_db) as db:
        assert db.get(
            NobilityActionRejection,
            ("u1", payload.request_id),
        ) is None
