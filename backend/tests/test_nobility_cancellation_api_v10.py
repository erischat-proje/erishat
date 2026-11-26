"""Authenticated nobility cancellation HTTP tests."""

from uuid import uuid4

import pytest

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityActionConfirmation,
    NobilityActionRejection,
    NobilityPointsLedger,
)

from nobility_confirmation_helpers import (
    confirmed_payload,
)

from test_nobility_postgres_v1 import scoped_db

from test_nobility_activation_v10 import (
    engine,
    fund,
)

from test_nobility_activation_api_v10 import (
    client,
    BASE,
    H1,
    H2,
)


URL = BASE + "/cancel"


def prepare(client, engine):
    fund(engine, 800000)

    body = confirmed_payload(
        client, 1, action="activate"
    )

    return {
        **body,
        "action": "activate",
        "user_id": "u1",
    }


def financial_body(body):
    return {
        key: value
        for key, value in body.items()
        if key not in ("action", "user_id")
    }


def state(client):
    response = client.get(
        BASE + "/me",
        headers=H1,
    )

    assert response.status_code == 200

    return response.json()


def test_cancel_before_action(client, engine):
    body = prepare(client, engine)
    before = state(client)

    response = client.post(
        URL, headers=H1, json=body
    )

    assert response.status_code == 200
    result = response.json()

    assert result["ok"] is True
    assert result["status"] == "cancelled"
    assert result["duplicate"] is False

    for key, value in body.items():
        assert result[key] == value

    assert state(client) == before

    delayed = client.post(
        BASE + "/activate",
        headers=H1,
        json=financial_body(body),
    )

    assert delayed.status_code == 409
    assert delayed.json()["detail"] == (
        "request_cancelled"
    )

    assert state(client) == before

    with Session(engine) as db:
        assert db.get(
            NobilityActionRejection,
            ("u1", body["request_id"]),
        ) is not None

        assert db.get(
            NobilityActionConfirmation,
            ("u1", body["request_id"]),
        ) is None


def test_duplicate_cancel(client, engine):
    body = prepare(client, engine)

    first = client.post(
        URL, headers=H1, json=body
    )

    second = client.post(
        URL, headers=H1, json=body
    )

    assert first.status_code == 200
    assert second.status_code == 200

    assert first.json()["duplicate"] is False
    assert second.json()["duplicate"] is True
    assert second.json()["status"] == "cancelled"

    with Session(engine) as db:
        assert len(db.scalars(
            select(NobilityActionRejection)
        ).all()) == 1


def test_completed_action(client, engine):
    body = prepare(client, engine)

    first = client.post(
        BASE + "/activate",
        headers=H1,
        json=financial_body(body),
    )

    assert first.status_code == 200

    before = state(client)

    response = client.post(
        URL, headers=H1, json=body
    )

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert response.json()["duplicate"] is True

    assert state(client) == before

    with Session(engine) as db:
        assert db.get(
            NobilityActionRejection,
            ("u1", body["request_id"]),
        ) is None

        assert db.get(
            NobilityActionConfirmation,
            ("u1", body["request_id"]),
        ) is not None


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer invalid"},
    ],
)
def test_unauthorized(client, engine, headers):
    body = prepare(client, engine)

    response = client.post(
        URL, headers=headers, json=body
    )

    assert response.status_code == 401

    with Session(engine) as db:
        assert db.scalars(
            select(NobilityActionRejection)
        ).all() == []


def test_wrong_account(client, engine):
    body = prepare(client, engine)

    response = client.post(
        URL, headers=H2, json=body
    )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "account_mismatch"
    )

    with Session(engine) as db:
        assert db.scalars(
            select(NobilityActionRejection)
        ).all() == []


@pytest.mark.parametrize(
    "changes",
    [
        {"request_id": "invalid"},
        {"rank": 0},
        {"rank": 5},
        {"rank": True},
        {"action": "invalid"},
        {"confirmed_cost": "0"},
        {"confirmed_cost": "-1"},
        {"confirmed_cost": "0400000"},
        {"confirmed_cost": 400000},
        {"confirmed_revision": "invalid"},
        {"user_id": ""},
        {"user_id": " u1"},
        {"unexpected_field": True},
    ],
)
def test_invalid_request(client, engine, changes):
    body = prepare(client, engine)
    body.update(changes)

    response = client.post(
        URL, headers=H1, json=body
    )

    assert response.status_code == 422

    with Session(engine) as db:
        assert db.scalars(
            select(NobilityActionRejection)
        ).all() == []


@pytest.mark.parametrize(
    "field",
    [
        "request_id",
        "action",
        "rank",
        "user_id",
        "confirmed_cost",
        "confirmed_revision",
    ],
)
def test_missing_field(client, engine, field):
    body = prepare(client, engine)
    del body[field]

    response = client.post(
        URL, headers=H1, json=body
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "changes",
    [
        {"confirmed_revision": "b" * 64},
        {"confirmed_cost": "400001"},
        {"rank": 2},
        {"action": "upgrade"},
    ],
)
def test_conflicting_cancel(
    client, engine, changes
):
    body = prepare(client, engine)

    first = client.post(
        URL, headers=H1, json=body
    )

    assert first.status_code == 200

    changed = dict(body)
    changed.update(changes)

    response = client.post(
        URL, headers=H1, json=changed
    )

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "request_conflict"
    )


def test_get_not_allowed(client, engine):
    response = client.get(
        URL, headers=H1
    )

    assert response.status_code == 405


def test_cancel_when_disabled(
    client, engine, monkeypatch
):
    body = prepare(client, engine)

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED",
        "false",
    )

    from backend.app.nobility_policy import enabled

    assert enabled() is False

    disabled = client.get(
        BASE + "/me",
        headers=H1,
    )

    assert disabled.status_code == 200
    assert disabled.json()["enabled"] is False

    blocked = client.post(
        BASE + "/activate",
        headers=H1,
        json=financial_body(body),
    )

    assert blocked.status_code == 503
    assert blocked.json()["detail"] == "nobility_disabled"

    response = client.post(
        URL, headers=H1, json=body
    )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
