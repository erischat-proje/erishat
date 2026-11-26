"""PostgreSQL nobility upgrade HTTP tests."""

from datetime import datetime, timezone, timedelta
from uuid import uuid4

import pytest
from nobility_confirmation_helpers import confirmed_payload
from sqlalchemy.orm import Session

from backend.app.nobility_models import NobilityMembership
from backend.app.nobility_policy import utc

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
    H2,
    payload,
)


ACTIVATE = BASE + "/activate"
UPGRADE = BASE + "/upgrade"

COSTS = {
    1: 400_000,
    2: 800_000,
    3: 1_600_000,
    4: 3_200_000,
}


def activate(client, rank=1, key=None):
    response = client.post(
        ACTIVATE,
        headers=H1,
        json=confirmed_payload(client, rank, key, action="activate"),
    )

    assert response.status_code == 200, response.text

    return response.json()


@pytest.mark.parametrize("old,new", [
    (1, 2),
    (1, 3),
    (1, 4),
    (2, 3),
    (2, 4),
    (3, 4),
])
def test_all_upgrade_paths(client, engine, old, new):
    fund(engine, COSTS[old] + COSTS[new] + 100)

    activate(client, old)

    r = client.post(
        UPGRADE,
        headers=H1,
        json=confirmed_payload(client, new, action="upgrade"),
    )

    assert r.status_code == 200, r.text

    data = r.json()

    assert data["action"] == "upgrade"
    assert data["applied"] is True
    assert data["duplicate"] is False
    assert data["membership"]["rank"] == new
    assert data["membership"]["points"] == "100"

    verify(engine, new, 100, 2)


def test_full_price_required(client, engine):
    fund(engine, 800_000)
    activate(client, 1)

    r = client.post(
        UPGRADE,
        headers=H1,
        json=confirmed_payload(client, 2, action="upgrade"),
    )

    assert r.status_code == 409
    assert r.json()["detail"] == "insufficient_points"

    verify(engine, 1, 400_000, 1)


def test_duplicate_upgrade(client, engine):
    fund(engine, 2_000_000)
    activate(client)

    body = confirmed_payload(client, 2, action="upgrade")

    first = client.post(
        UPGRADE, headers=H1, json=body
    )

    second = client.post(
        UPGRADE, headers=H1, json=body
    )

    assert first.status_code == 200
    assert second.status_code == 200

    assert first.json()["applied"] is True
    assert second.json()["applied"] is False
    assert second.json()["duplicate"] is True

    assert (
        first.json()["membership"]
        == second.json()["membership"]
    )

    verify(engine, 2, 800_000, 2)


@pytest.mark.parametrize("target", [1, 2, 3])
def test_same_or_lower_rank(client, engine, target):
    fund(engine, 8_000_000)
    activate(client, 3)

    r = client.post(
        UPGRADE,
        headers=H1,
        json=confirmed_payload(client, target, action="upgrade"),
    )

    assert r.status_code == 409
    assert r.json()["detail"] == "higher_rank_required"

    verify(engine, 3, 6_400_000, 1)


def test_without_membership(client, engine):
    fund(engine, 4_000_000)

    r = client.post(
        UPGRADE,
        headers=H1,
        json=confirmed_payload(client, 4, action="upgrade"),
    )

    assert r.status_code == 409
    assert (
        r.json()["detail"]
        == "active_membership_required"
    )

    verify(engine, 0, 4_000_000, 0)


def test_expired_membership(client, engine):
    fund(engine, 4_000_000)
    activate(client)

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        now = datetime.now(timezone.utc)

        member.started_at = now - timedelta(days=31)
        member.expires_at = now - timedelta(days=1)

        db.commit()

    r = client.post(
        UPGRADE,
        headers=H1,
        json=confirmed_payload(client, 2, action="upgrade"),
    )

    assert r.status_code == 409
    assert (
        r.json()["detail"]
        == "active_membership_required"
    )

    verify(engine, 1, 3_600_000, 1)


def test_upgrade_resets_duration(client, engine):
    fund(engine, 2_000_000)
    activate(client)

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        now = datetime.now(timezone.utc)

        member.started_at = now - timedelta(days=5)
        member.expires_at = now + timedelta(days=25)

        previous_start = utc(member.started_at)

        db.commit()

    r = client.post(
        UPGRADE,
        headers=H1,
        json=confirmed_payload(client, 2, action="upgrade"),
    )

    assert r.status_code == 200

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")

        assert utc(member.started_at) > previous_start

        assert (
            utc(member.expires_at)
            - utc(member.started_at)
        ) == timedelta(days=30)

    verify(engine, 2, 800_000, 2)


def test_activation_key_cannot_upgrade(client, engine):
    fund(engine, 2_000_000)

    key = str(uuid4())
    activate(client, 1, key)

    r = client.post(
        UPGRADE,
        headers=H1,
        json=confirmed_payload(client, 2, key, action="upgrade"),
    )

    assert r.status_code == 409
    assert r.json()["detail"] == "request_conflict"

    verify(engine, 1, 1_600_000, 1)


def test_upgrade_key_different_rank(client, engine):
    fund(engine, 4_000_000)
    activate(client)

    key = str(uuid4())

    first = client.post(
        UPGRADE,
        headers=H1,
        json=confirmed_payload(client, 2, key, action="upgrade"),
    )

    second = client.post(
        UPGRADE,
        headers=H1,
        json=confirmed_payload(client, 3, key, action="upgrade"),
    )

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["detail"] == "request_conflict"

    verify(engine, 2, 2_800_000, 2)


def test_unauthorized(client, engine):
    fund(engine, 2_000_000)
    activate(client)

    r = client.post(
        UPGRADE,
        json=payload(2),
    )

    assert r.status_code == 401

    verify(engine, 1, 1_600_000, 1)


def test_account_isolation(client, engine):
    fund(engine, 2_000_000)
    activate(client)

    r = client.post(
        UPGRADE + "?user_id=u1",
        headers=H2,
        json=confirmed_payload(client, 2, action="upgrade", headers=H2),
    )

    assert r.status_code == 409

    verify(engine, 1, 1_600_000, 1)


@pytest.mark.parametrize("field", [
    "user_id",
    "price",
    "points",
    "duration_days",
    "expires_at",
    "privileges",
])
def test_forged_fields(client, engine, field):
    fund(engine, 2_000_000)
    activate(client)

    body = confirmed_payload(client, 2, action="upgrade")
    body[field] = "forged"

    r = client.post(
        UPGRADE,
        headers=H1,
        json=body,
    )

    assert r.status_code == 422

    verify(engine, 1, 1_600_000, 1)


def test_disabled(client, engine, monkeypatch):
    fund(engine, 2_000_000)
    activate(client)

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    r = client.post(
        UPGRADE,
        headers=H1,
        json=payload(2),
    )

    assert r.status_code == 503

    verify(engine, 1, 1_600_000, 1)
