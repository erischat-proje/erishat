"""Nobility API transaction boundary tests."""

from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import User
from backend.app import admin_models
from backend.app.nobility_actions import (
    execute_action,
    membership_state,
)
from backend.app.nobility_requests import NobilityActionRequest
from backend.app.nobility_models import (
    NobilityMembership,
    NobilityAuditLog,
)
from test_nobility_activation_v10 import (
    engine,
    fund,
    verify,
)
from test_nobility_postgres_v1 import scoped_db


def payload(rank=1, key=None):
    return NobilityActionRequest(
        rank=rank,
        request_id=key or str(uuid4()),
    )


def confirmed_request(
    db,
    rank=1,
    key=None,
    *,
    action="activate",
    user_id="u1",
):
    costs = {
        1: 400_000,
        2: 800_000,
        3: 1_600_000,
        4: 3_200_000,
    }

    cost = costs[rank]

    if action == "renew":
        cost //= 4

    state = membership_state(db, user_id)

    return NobilityActionRequest(
        rank=rank,
        request_id=key or str(uuid4()),
        confirmed_revision=state["revision"],
        confirmed_cost=str(cost),
    )


@pytest.mark.parametrize("rank,cost", [
    (1, 400_000),
    (2, 800_000),
    (3, 1_600_000),
    (4, 3_200_000),
])
def test_activation(engine, rank, cost):
    fund(engine, cost + 100)

    with Session(engine) as db:
        result = execute_action(
            db, "u1", "activate", confirmed_request(db, rank)
        )

    assert result["ok"] is True
    assert result["applied"] is True
    assert result["duplicate"] is False
    assert result["membership"]["rank"] == rank
    assert result["membership"]["points"] == "100"

    verify(engine, rank, 100, 1)


def test_duplicate(engine):
    fund(engine, 800_000)
    with Session(engine) as db:
        request = confirmed_request(db)
        first = execute_action(
            db, "u1", "activate", request
        )
        second = execute_action(
            db, "u1", "activate", request
        )

    assert first["applied"] is True
    assert second["applied"] is False
    assert second["duplicate"] is True
    assert second["membership"] == first["membership"]

    verify(engine, 1, 400_000, 1)


def test_insufficient_points(engine):
    fund(engine, 399_999)

    with Session(engine) as db:
        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "activate", confirmed_request(db)
            )

        assert exc.value.status_code == 409
        assert exc.value.detail == "insufficient_points"

    verify(engine, 0, 399_999, 0)


def test_inactive_user(engine):
    fund(engine, 800_000)

    with Session(engine) as db:
        user = db.get(User, "u1")
        user.is_active = False
        db.commit()

        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "activate", payload()
            )

        assert exc.value.status_code == 403

    verify(engine, 0, 800_000, 0)


def test_unknown_user(engine):
    with Session(engine) as db:
        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "missing", "activate", payload()
            )

        assert exc.value.status_code == 403


def test_disabled(engine, monkeypatch):
    fund(engine, 800_000)

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    with Session(engine) as db:
        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "activate", payload()
            )

        assert exc.value.status_code == 503

    verify(engine, 0, 800_000, 0)


def test_same_key_different_rank(engine):
    fund(engine, 2_000_000)
    key = str(uuid4())

    with Session(engine) as db:
        execute_action(
            db, "u1", "activate", confirmed_request(db, 1, key)
        )

        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "activate", payload(2, key)
            )

        assert exc.value.status_code == 409
        assert exc.value.detail == "request_conflict"

    verify(engine, 1, 1_600_000, 1)


@pytest.mark.parametrize("action,rank", [
    ("upgrade", 2),
    ("renew", 1),
])
def test_cross_action_conflict(engine, action, rank):
    fund(engine, 2_000_000)
    key = str(uuid4())

    with Session(engine) as db:
        execute_action(
            db, "u1", "activate", confirmed_request(db, 1, key)
        )

        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", action, payload(rank, key)
            )

        assert exc.value.status_code == 409
        assert exc.value.detail == "request_conflict"

    verify(engine, 1, 1_600_000, 1)


def test_rollback_after_engine_success(engine, monkeypatch):
    fund(engine, 800_000)

    observed = []

    original_state = membership_state

    with Session(engine) as db:
        request = confirmed_request(db)

        def fail_after_success(session, user_id):
            state = original_state(session, user_id)

            if state["rank"] == 1:
                observed.append(state)

                raise RuntimeError(
                    "Internal test failure after engine success"
                )

            return state

        monkeypatch.setattr(
            "backend.app.nobility_actions.membership_state",
            fail_after_success,
        )

        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u1", "activate", request
            )

        assert exc.value.status_code == 500
        assert exc.value.detail == "nobility_action_failed"

    assert len(observed) == 1
    assert observed[0]["rank"] == 1
    assert observed[0]["points"] == "400000"

    verify(engine, 0, 800_000, 0)

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")

        assert member.rank == 0
        assert member.points == 800_000

        assert db.scalars(
            select(NobilityAuditLog)
        ).all() == []


def test_account_isolation(engine):
    fund(engine, 800_000)

    with Session(engine) as db:
        with pytest.raises(HTTPException) as exc:
            execute_action(
                db, "u2", "activate",
                confirmed_request(db, user_id="u2")
            )

        assert exc.value.status_code == 409

    assert exc.value.detail == "insufficient_points"

    verify(engine, 0, 800_000, 0)

    with Session(engine) as db:
        assert db.get(NobilityMembership, "u2") is None
        assert db.scalars(
            select(NobilityAuditLog)
        ).all() == []
