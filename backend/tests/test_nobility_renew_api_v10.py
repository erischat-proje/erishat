"""PostgreSQL nobility renewal HTTP tests."""

from datetime import datetime, timezone, timedelta
from uuid import uuid4

import pytest
from nobility_confirmation_helpers import confirmed_payload
from sqlalchemy.orm import Session

from backend.app.models import User
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
from test_nobility_upgrade_api_v10 import (
    activate,
    COSTS,
)


RENEW = BASE + "/renew"
UPGRADE = BASE + "/upgrade"

RENEWAL_COSTS = {
    1: 100_000,
    2: 200_000,
    3: 400_000,
    4: 800_000,
}


@pytest.mark.parametrize("rank", [1, 2, 3, 4])
def test_renewal_prices(client, engine, rank):
    cost = RENEWAL_COSTS[rank]

    fund(engine, COSTS[rank] + cost + 100)
    activate(client, rank)

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        old_start = utc(member.started_at)
        old_expiry = utc(member.expires_at)

    r = client.post(
        RENEW,
        headers=H1,
        json=confirmed_payload(client, rank, action="renew"),
    )

    assert r.status_code == 200, r.text

    data = r.json()

    assert data["action"] == "renew"
    assert data["applied"] is True
    assert data["duplicate"] is False
    assert data["membership"]["rank"] == rank
    assert data["membership"]["points"] == "100"

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")

        assert utc(member.started_at) == old_start

        assert utc(member.expires_at) == (
            old_expiry + timedelta(days=30)
        )

    verify(engine, rank, 100, 2)


def test_duplicate_renewal(client, engine):
    fund(engine, 800_000)
    activate(client)

    body = confirmed_payload(client, 1, action="renew")

    first = client.post(
        RENEW, headers=H1, json=body
    )

    second = client.post(
        RENEW, headers=H1, json=body
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

    verify(engine, 1, 300_000, 2)


def test_insufficient_points(client, engine):
    fund(engine, 499_999)
    activate(client)

    r = client.post(
        RENEW,
        headers=H1,
        json=confirmed_payload(client, 1, action="renew"),
    )

    assert r.status_code == 409
    assert r.json()["detail"] == "insufficient_points"

    verify(engine, 1, 99_999, 1)


def test_exact_balance(client, engine):
    fund(engine, 500_000)
    activate(client)

    r = client.post(
        RENEW,
        headers=H1,
        json=confirmed_payload(client, 1, action="renew"),
    )

    assert r.status_code == 200

    verify(engine, 1, 0, 2)


def test_without_membership(client, engine):
    fund(engine, 800_000)

    r = client.post(
        RENEW,
        headers=H1,
        json=confirmed_payload(client, 1, action="renew"),
    )

    assert r.status_code == 409

    assert (
        r.json()["detail"]
        == "active_membership_required"
    )

    verify(engine, 0, 800_000, 0)


def test_expired_membership(client, engine):
    fund(engine, 800_000)
    activate(client)

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        now = datetime.now(timezone.utc)

        member.started_at = now - timedelta(days=31)
        member.expires_at = now - timedelta(days=1)

        db.commit()

    r = client.post(
        RENEW,
        headers=H1,
        json=confirmed_payload(client, 1, action="renew"),
    )

    assert r.status_code == 409

    assert (
        r.json()["detail"]
        == "active_membership_required"
    )

    verify(engine, 1, 400_000, 1)


@pytest.mark.parametrize("target", [1, 3, 4])
def test_wrong_rank(client, engine, target):
    fund(engine, 4_000_000)
    activate(client, 2)

    r = client.post(
        RENEW,
        headers=H1,
        json=confirmed_payload(client, target, action="renew"),
    )

    assert r.status_code == 409
    assert r.json()["detail"] == "rank_mismatch"

    verify(engine, 2, 3_200_000, 1)


def test_multiple_renewals(client, engine):
    fund(engine, 800_000)
    activate(client)

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        original_expiry = utc(member.expires_at)

    for _ in range(3):
        r = client.post(
            RENEW,
            headers=H1,
            json=confirmed_payload(client, 1, action="renew"),
        )

        assert r.status_code == 200

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")

        assert utc(member.expires_at) == (
            original_expiry + timedelta(days=90)
        )

    verify(engine, 1, 100_000, 4)


def test_activation_key_conflict(client, engine):
    fund(engine, 800_000)

    key = str(uuid4())
    activate(client, 1, key)

    r = client.post(
        RENEW,
        headers=H1,
        json=confirmed_payload(client, 1, key, action="renew"),
    )

    assert r.status_code == 409
    assert r.json()["detail"] == "request_conflict"

    verify(engine, 1, 400_000, 1)


def test_upgrade_key_conflict(client, engine):
    fund(engine, 2_000_000)
    activate(client)

    key = str(uuid4())

    upgrade = client.post(
        UPGRADE,
        headers=H1,
        json=confirmed_payload(client, 2, key, action="upgrade"),
    )

    assert upgrade.status_code == 200

    r = client.post(
        RENEW,
        headers=H1,
        json=confirmed_payload(client, 2, key, action="renew"),
    )

    assert r.status_code == 409
    assert r.json()["detail"] == "request_conflict"

    verify(engine, 2, 800_000, 2)


def test_renew_key_different_rank(client, engine):
    fund(engine, 800_000)
    activate(client)

    key = str(uuid4())

    first = client.post(
        RENEW,
        headers=H1,
        json=confirmed_payload(client, 1, key, action="renew"),
    )

    second = client.post(
        RENEW,
        headers=H1,
        json=confirmed_payload(client, 2, key, action="renew"),
    )

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["detail"] == "request_conflict"

    verify(engine, 1, 300_000, 2)


def test_unauthorized(client, engine):
    fund(engine, 800_000)
    activate(client)

    r = client.post(
        RENEW,
        json=payload(1),
    )

    assert r.status_code == 401

    verify(engine, 1, 400_000, 1)


def test_account_isolation(client, engine):
    fund(engine, 800_000)
    activate(client)

    r = client.post(
        RENEW + "?user_id=u1",
        headers=H2,
        json=confirmed_payload(client, 1, action="renew", headers=H2),
    )

    assert r.status_code == 409

    verify(engine, 1, 400_000, 1)


def test_inactive_account(client, engine):
    fund(engine, 800_000)
    activate(client)

    with Session(engine) as db:
        user = db.get(User, "u1")
        user.is_active = False
        db.commit()

    r = client.post(
        RENEW,
        headers=H1,
        json=payload(1),
    )

    assert r.status_code == 403

    verify(engine, 1, 400_000, 1)


@pytest.mark.parametrize("field", [
    "user_id",
    "price",
    "points",
    "renewal_points",
    "duration_days",
    "expires_at",
    "privileges",
])
def test_forged_fields(client, engine, field):
    fund(engine, 800_000)
    activate(client)

    body = confirmed_payload(client, 1, action="renew")
    body[field] = "forged"

    r = client.post(
        RENEW,
        headers=H1,
        json=body,
    )

    assert r.status_code == 422

    verify(engine, 1, 400_000, 1)


def test_disabled(client, engine, monkeypatch):
    fund(engine, 800_000)
    activate(client)

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    r = client.post(
        RENEW,
        headers=H1,
        json=payload(1),
    )

    assert r.status_code == 503

    verify(engine, 1, 400_000, 1)


def test_rollback(client, engine, monkeypatch):
    fund(engine, 800_000)
    activate(client)

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        old_expiry = utc(member.expires_at)

    def fail(*args, **kwargs):
        raise RuntimeError("Test rollback")

    monkeypatch.setattr(
        "backend.app.nobility_actions.membership_state",
        fail,
    )

    r = client.post(
        RENEW,
        headers=H1,
        json=confirmed_payload(client, 1, action="renew"),
    )

    assert r.status_code == 500
    assert r.json()["detail"] == "nobility_action_failed"

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")

        assert utc(member.expires_at) == old_expiry

    verify(engine, 1, 400_000, 1)
