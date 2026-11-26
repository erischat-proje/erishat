"""PostgreSQL cancellation concurrency security."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityActionRejection,
    NobilityMembership,
    NobilityPointsLedger,
)
from backend.app.nobility_requests import (
    NobilityActionRequest,
    NobilityCancellationRequest,
)
from backend.app.nobility_actions import (
    execute_action,
    membership_state,
)
from backend.app.nobility_cancellation import (
    cancel_action,
)
from backend.app.nobility_engine import activate_rank
from backend.app.nobility_points import apply_points

from test_nobility_postgres_v1 import scoped_db
from test_nobility_activation_v10 import engine


def prepare(engine, action):
    with Session(engine) as db:
        apply_points(
            db, "u1", 4000000,
            "race-credit", "test",
        )

        if action != "activate":
            activate_rank(
                db, "u1", 1, str(uuid4())
            )

        db.commit()

        state = membership_state(db, "u1")

        rank = 2 if action == "upgrade" else 1

        cost = {
            "activate": "400000",
            "upgrade": "800000",
            "renew": "100000",
        }[action]

        payload = NobilityCancellationRequest(
            user_id="u1",
            request_id=str(uuid4()),
            action=action,
            rank=rank,
            confirmed_cost=cost,
            confirmed_revision=state["revision"],
        )

        return payload, state


def financial_payload(payload):
    return NobilityActionRequest(
        rank=payload.rank,
        request_id=payload.request_id,
        confirmed_cost=payload.confirmed_cost,
        confirmed_revision=payload.confirmed_revision,
    )


def perform(engine, payload):
    with Session(engine) as db:
        try:
            result = execute_action(
                db,
                "u1",
                payload.action,
                financial_payload(payload),
            )

            assert result["applied"] is True

            return "applied"

        except HTTPException as exc:
            assert exc.status_code == 409
            assert exc.detail == "request_cancelled"

            return "blocked"


def cancel(engine, payload):
    with Session(engine) as db:
        return cancel_action(
            db, "u1", payload
        )


def verify(engine, payload, before, applied):
    with Session(engine) as db:
        member = db.get(
            NobilityMembership, "u1"
        )

        rejection = db.get(
            NobilityActionRejection,
            ("u1", payload.request_id),
        )

        key = (
            f"nobility:{payload.action}:"
            f"u1:{payload.request_id}"
        )

        ledger = db.get(
            NobilityPointsLedger, key
        )

        state = membership_state(db, "u1")

        if applied:
            assert rejection is None
            assert ledger is not None

            assert ledger.amount == -int(
                payload.confirmed_cost
            )

            assert member.points == (
                int(before["points"])
                - int(payload.confirmed_cost)
            )

            assert state["rank"] == payload.rank

            if payload.action == "renew":
                from datetime import datetime, timedelta

                old_expiry = datetime.fromisoformat(
                    before["expires_at"]
                )

                new_expiry = datetime.fromisoformat(
                    state["expires_at"]
                )

                assert new_expiry == (
                    old_expiry + timedelta(days=30)
                )

        else:
            assert rejection is not None
            assert ledger is None

            assert state["points"] == before["points"]
            assert state["rank"] == before["rank"]
            assert state["started_at"] == before["started_at"]
            assert state["expires_at"] == before["expires_at"]


@pytest.mark.parametrize(
    "action",
    ["activate", "upgrade", "renew"],
)
def test_cancellation_first(engine, action):
    payload, before = prepare(
        engine, action
    )

    result = cancel(engine, payload)

    assert result["status"] == "cancelled"

    assert perform(
        engine, payload
    ) == "blocked"

    verify(
        engine, payload, before, False
    )


@pytest.mark.parametrize(
    "action",
    ["activate", "upgrade", "renew"],
)
def test_financial_action_first(engine, action):
    payload, before = prepare(
        engine, action
    )

    assert perform(
        engine, payload
    ) == "applied"

    result = cancel(engine, payload)

    assert result["status"] == "completed"

    verify(
        engine, payload, before, True
    )


@pytest.mark.parametrize(
    "action",
    ["activate", "upgrade", "renew"],
)
@pytest.mark.parametrize("attempt", range(3))
def test_concurrent_action_and_cancel(
    engine, action, attempt
):
    payload, before = prepare(
        engine, action
    )

    barrier = Barrier(2)

    def action_worker():
        barrier.wait(timeout=10)
        return perform(engine, payload)

    def cancel_worker():
        barrier.wait(timeout=10)
        return cancel(engine, payload)

    with ThreadPoolExecutor(max_workers=2) as pool:
        action_future = pool.submit(action_worker)
        cancel_future = pool.submit(cancel_worker)

        action_result = action_future.result(
            timeout=30
        )

        cancel_result = cancel_future.result(
            timeout=30
        )

    if action_result == "applied":
        assert cancel_result["status"] == "completed"

        verify(
            engine, payload, before, True
        )

    else:
        assert action_result == "blocked"
        assert cancel_result["status"] == "cancelled"

        verify(
            engine, payload, before, False
        )


def test_eight_concurrent_cancellations(engine):
    payload, before = prepare(
        engine, "activate"
    )

    barrier = Barrier(8)

    def worker():
        barrier.wait(timeout=10)
        return cancel(engine, payload)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [
            pool.submit(worker)
            for _ in range(8)
        ]

        results = [
            future.result(timeout=30)
            for future in futures
        ]

    assert all(
        result["status"] == "cancelled"
        for result in results
    )

    assert sum(
        result["duplicate"] is False
        for result in results
    ) == 1

    assert sum(
        result["duplicate"] is True
        for result in results
    ) == 7

    with Session(engine) as db:
        records = db.scalars(
            select(NobilityActionRejection)
        ).all()

        assert len(records) == 1

    verify(
        engine, payload, before, False
    )
