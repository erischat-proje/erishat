"""Atomic financial confirmation integration tests."""

from uuid import uuid4

import pytest

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app import nobility_actions

from backend.app.nobility_models import (
    NobilityActionConfirmation,
    NobilityPointsLedger,
    NobilityMembership,
)

from nobility_confirmation_helpers import (
    confirmed_payload,
)

from test_nobility_postgres_v1 import scoped_db

from test_nobility_activation_v10 import (
    engine,
    fund,
    verify,
)

from test_nobility_activation_api_v10 import (
    client,
    BASE,
    H1,
)


CASES = [
    ("activate", 1, 400000),
    ("activate", 2, 800000),
    ("activate", 3, 1600000),
    ("activate", 4, 3200000),
    ("upgrade", 2, 800000),
    ("upgrade", 3, 1600000),
    ("upgrade", 4, 3200000),
    ("renew", 1, 100000),
    ("renew", 2, 200000),
    ("renew", 3, 400000),
    ("renew", 4, 800000),
]


def prepare(client, engine, action, rank):
    fund(engine, 8000000)

    if action != "activate":
        initial_rank = (
            rank if action == "renew" else 1
        )

        response = client.post(
            BASE + "/activate",
            headers=H1,
            json=confirmed_payload(
                client,
                initial_rank,
                action="activate",
            ),
        )

        assert response.status_code == 200

    return confirmed_payload(
        client, rank, action=action
    )


@pytest.mark.parametrize(
    "action,rank,cost",
    CASES,
)
def test_atomic_confirmation(
    client, engine, action, rank, cost
):
    body = prepare(
        client, engine, action, rank
    )

    response = client.post(
        BASE + "/" + action,
        headers=H1,
        json=body,
    )

    assert response.status_code == 200, response.text
    assert response.json()["applied"] is True

    with Session(engine) as db:
        record = db.get(
            NobilityActionConfirmation,
            ("u1", body["request_id"]),
        )

        assert record is not None
        assert record.action == action
        assert record.rank == rank
        assert record.confirmed_cost == cost

        assert record.confirmed_revision == (
            body["confirmed_revision"]
        )

        ledger = db.get(
            NobilityPointsLedger,
            record.event_key,
        )

        assert ledger.user_id == "u1"
        assert ledger.amount == -cost

    duplicate = client.post(
        BASE + "/" + action,
        headers=H1,
        json=body,
    )

    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate"] is True

    assert duplicate.json()["membership"] == (
        response.json()["membership"]
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"confirmed_revision": "b" * 64},
        {"confirmed_revision": None},
        {"confirmed_cost": "400001"},
        {"confirmed_cost": None},
        {"rank": 2},
    ],
)
def test_changed_replay(
    client, engine, changes
):
    body = prepare(
        client, engine, "activate", 1
    )

    first = client.post(
        BASE + "/activate",
        headers=H1,
        json=body,
    )

    assert first.status_code == 200

    changed = dict(body)
    changed.update(changes)

    response = client.post(
        BASE + "/activate",
        headers=H1,
        json=changed,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "request_conflict"
    )

    verify(engine, 1, 7600000, 1)


@pytest.mark.parametrize(
    "action,rank",
    [
        ("activate", 1),
        ("upgrade", 2),
        ("renew", 1),
    ],
)
def test_confirmation_failure_rollback(
    client, engine, monkeypatch, action, rank
):
    body = prepare(
        client, engine, action, rank
    )

    before = client.get(
        BASE + "/me",
        headers=H1,
    ).json()

    original = nobility_actions.record_confirmation

    def fail_after_flush(*args, **kwargs):
        assert original(*args, **kwargs) is True
        raise RuntimeError(
            "Injected confirmation failure"
        )

    monkeypatch.setattr(
        nobility_actions,
        "record_confirmation",
        fail_after_flush,
    )

    response = client.post(
        BASE + "/" + action,
        headers=H1,
        json=body,
    )

    assert response.status_code == 500

    after = client.get(
        BASE + "/me",
        headers=H1,
    ).json()

    assert before == after

    with Session(engine) as db:
        assert db.get(
            NobilityActionConfirmation,
            ("u1", body["request_id"]),
        ) is None

        key = (
            f"nobility:{action}:u1:"
            f"{body['request_id']}"
        )

        assert db.get(
            NobilityPointsLedger,
            key,
        ) is None
