"""Mandatory nobility financial confirmation tests."""

from uuid import uuid4

import pytest

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.nobility_actions import (
    execute_action,
    membership_state,
)
from backend.app.nobility_requests import NobilityActionRequest
from backend.app.nobility_confirmation import expected_cost

from test_nobility_activation_v10 import (
    engine,
    fund,
    verify,
)
from test_nobility_postgres_v1 import scoped_db


def request(db, action="activate", rank=1, **changes):
    state = membership_state(db, "u1")

    values = {
        "rank": rank,
        "request_id": str(uuid4()),
        "confirmed_revision": state["revision"],
        "confirmed_cost": expected_cost(action, rank),
    }

    values.update(changes)

    return NobilityActionRequest(**values)


def test_confirmation_required(engine):
    fund(engine, 800000)

    with Session(engine) as db:
        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "activate",
                NobilityActionRequest(
                    rank=1,
                    request_id=str(uuid4()),
                ),
            )

        assert exc.value.status_code == 409
        assert exc.value.detail == "confirmation_required"

    verify(engine, 0, 800000, 0)


@pytest.mark.parametrize("field", [
    "confirmed_revision",
    "confirmed_cost",
])
def test_missing_confirmation_field(engine, field):
    fund(engine, 800000)

    with Session(engine) as db:
        payload = request(db, **{field: None})

        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "activate", payload
            )

        assert exc.value.detail == "confirmation_required"

    verify(engine, 0, 800000, 0)


def test_wrong_cost(engine):
    fund(engine, 800000)

    with Session(engine) as db:
        payload = request(
            db, confirmed_cost="1"
        )

        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "activate", payload
            )

        assert exc.value.detail == "price_changed"

    verify(engine, 0, 800000, 0)


def test_stale_revision(engine):
    fund(engine, 800000)

    with Session(engine) as db:
        payload = request(
            db, confirmed_revision="0" * 64
        )

        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "activate", payload
            )

        assert exc.value.detail == "stale_confirmation"

    verify(engine, 0, 800000, 0)


def test_confirmed_activation(engine):
    fund(engine, 800000)

    with Session(engine) as db:
        result = execute_action(
            db, "u1", "activate", request(db)
        )

        assert result["applied"] is True
        assert result["membership"]["points"] == "400000"

    verify(engine, 1, 400000, 1)


def test_duplicate_with_old_revision(engine):
    fund(engine, 800000)

    with Session(engine) as db:
        payload = request(db)

        first = execute_action(
            db, "u1", "activate", payload
        )

        second = execute_action(
            db, "u1", "activate", payload
        )

        assert first["applied"] is True
        assert second["duplicate"] is True
        assert second["applied"] is False

    verify(engine, 1, 400000, 1)


def test_second_activation_with_old_confirmation(engine):
    fund(engine, 1200000)

    with Session(engine) as db:
        first = request(db)
        second = request(db)

        execute_action(
            db, "u1", "activate", first
        )

        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "activate", second
            )

        assert exc.value.detail == "stale_confirmation"

    verify(engine, 1, 800000, 1)


def test_second_renewal_requires_new_confirmation(engine):
    fund(engine, 1200000)

    with Session(engine) as db:
        execute_action(
            db, "u1", "activate", request(db)
        )

        first = request(db, "renew")
        second = request(db, "renew")

        renewed = execute_action(
            db, "u1", "renew", first
        )

        assert renewed["membership"]["points"] == "700000"

        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "renew", second
            )

        assert exc.value.detail == "stale_confirmation"

        current = membership_state(db, "u1")

        assert current == renewed["membership"]


def test_fresh_renewal_confirmation(engine):
    fund(engine, 1200000)

    with Session(engine) as db:
        execute_action(
            db, "u1", "activate", request(db)
        )

        for _ in range(2):
            result = execute_action(
                db, "u1", "renew",
                request(db, "renew"),
            )

            assert result["applied"] is True

        assert result["membership"]["points"] == "600000"


def test_confirmed_upgrade(engine):
    fund(engine, 2000000)

    with Session(engine) as db:
        execute_action(
            db, "u1", "activate", request(db)
        )

        result = execute_action(
            db, "u1", "upgrade",
            request(db, "upgrade", 2),
        )

        assert result["membership"]["rank"] == 2
        assert result["membership"]["points"] == "800000"


def test_cross_account_revision(engine):
    fund(engine, 800000)

    with Session(engine) as db:
        other = membership_state(db, "u2")

        payload = request(
            db,
            confirmed_revision=other["revision"],
        )

        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "activate", payload
            )

        assert exc.value.detail == "stale_confirmation"

    verify(engine, 0, 800000, 0)
