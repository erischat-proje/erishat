"""Consistent nobility membership snapshot tests."""

from datetime import datetime, timezone, timedelta

import pytest
from sqlalchemy.orm import Session

from backend.app.nobility_actions import (
    membership_state,
)
from backend.app.nobility_models import (
    NobilityMembership,
    NobilityRankConfig,
)
from backend.app.nobility_policy import (
    active_rank,
    authorized_rank_for_member,
    privileges_for_rank,
)
from backend.app.nobility_revision import (
    membership_revision,
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
from test_nobility_upgrade_api_v10 import activate


def test_membership_read_once(engine, monkeypatch):
    fund(engine, 800_000)

    with Session(engine) as db:
        original = db.get
        reads = []

        def tracked(model, *args, **kwargs):
            if model is NobilityMembership:
                reads.append(model)

            return original(
                model, *args, **kwargs
            )

        monkeypatch.setattr(db, "get", tracked)

        state = membership_state(db, "u1")

        assert len(reads) == 1
        assert state["points"] == "800000"


def test_active_membership_read_once(
    client, engine, monkeypatch
):
    fund(engine, 800_000)
    activate(client)

    with Session(engine) as db:
        original = db.get
        reads = []

        def tracked(model, *args, **kwargs):
            if model is NobilityMembership:
                reads.append(model)

            return original(
                model, *args, **kwargs
            )

        monkeypatch.setattr(db, "get", tracked)

        state = membership_state(db, "u1")

        assert len(reads) == 1
        assert state["rank"] == 1
        assert state["points"] == "400000"


@pytest.mark.parametrize("rank", [1, 2, 3, 4])
def test_authorized_rank_consistency(
    client, engine, rank
):
    fund(engine, 4_000_000)
    activate(client, rank)

    with Session(engine) as db:
        member = db.get(
            NobilityMembership, "u1"
        )

        now = datetime.now(timezone.utc)

        assert authorized_rank_for_member(
            db,
            member,
            system_enabled=True,
            at=now,
        ) == rank

        assert active_rank(
            db, "u1", at=now
        ) == rank

        state = membership_state(db, "u1")

        assert state["configuration_valid"]
        assert state["rank"] == rank
        assert state["privileges"] == (
            privileges_for_rank(rank)
        )


def test_authenticated_account_identity(client):
    first = client.get(
        BASE + "/me", headers=H1
    )

    second = client.get(
        BASE + "/me", headers=H2
    )

    assert first.status_code == 200
    assert second.status_code == 200

    assert first.json()["user_id"] == "u1"
    assert second.json()["user_id"] == "u2"

    assert (
        first.json()["revision"]
        != second.json()["revision"]
    )


def test_query_cannot_override_identity(client):
    response = client.get(
        BASE + "/me?user_id=u2",
        headers=H1,
    )

    assert response.status_code == 200
    assert response.json()["user_id"] == "u1"


def test_disabled_configuration(client, engine):
    fund(engine, 800_000)
    activate(client)

    with Session(engine) as db:
        config = db.get(NobilityRankConfig, 1)
        config.enabled = False
        db.commit()

        state = membership_state(db, "u1")

        assert state["rank"] == 0
        assert state["active"] is False
        assert state["configuration_valid"] is False
        assert state["privileges"] == ()
        assert state["points"] == "400000"


def test_wrong_configuration_price(client, engine):
    fund(engine, 800_000)
    activate(client)

    with Session(engine) as db:
        config = db.get(NobilityRankConfig, 1)
        config.required_points += 1
        db.commit()

        state = membership_state(db, "u1")

        assert state["rank"] == 0
        assert state["configuration_valid"] is False
        assert state["privileges"] == ()


def test_disabled_system(
    client, engine, monkeypatch
):
    fund(engine, 800_000)
    activate(client)

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED",
        "false",
    )

    with Session(engine) as db:
        state = membership_state(db, "u1")

        assert state["enabled"] is False
        assert state["rank"] == 0
        assert state["configuration_valid"] is False
        assert state["privileges"] == ()
        assert state["points"] == "400000"


def test_expiry_boundary(client, engine):
    fund(engine, 800_000)
    activate(client)

    with Session(engine) as db:
        member = db.get(
            NobilityMembership, "u1"
        )

        expiry = member.expires_at

        before = expiry - timedelta(
            microseconds=1
        )

        assert authorized_rank_for_member(
            db,
            member,
            system_enabled=True,
            at=before,
        ) == 1

        assert authorized_rank_for_member(
            db,
            member,
            system_enabled=True,
            at=expiry,
        ) == 0

        first = membership_revision(
            "u1",
            member,
            authorized_rank=1,
            system_enabled=True,
            at=before,
        )

        second = membership_revision(
            "u1",
            member,
            authorized_rank=0,
            system_enabled=True,
            at=expiry,
        )

        assert first != second
