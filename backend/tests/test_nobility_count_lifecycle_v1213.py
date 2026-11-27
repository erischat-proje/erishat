import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.app.models import User

from backend.app.system_data import (
    LidyaLedger,
    LidyaGemLedger,
)
from backend.app.admin_models import AdminRole

from backend.app import nobility_models as models
from backend.app import nobility_policy as policy
from backend.app import nobility_collection as collection
from backend.app.nobility_points import apply_points
from backend.app.nobility_actions import (
    execute_action,
    membership_state,
)
from backend.app.nobility_requests import (
    NobilityActionRequest,
)


@pytest.fixture(scope="module")
def engine():
    url = make_url(
        os.environ["COUNT_LIFECYCLE_TEST_DATABASE_URL"]
    )

    assert url.get_backend_name() == "postgresql"
    assert url.host == "127.0.0.1"
    assert url.database == "lidyachat_security_test"
    assert url.port == 55439

    assert os.environ.get(
        "NOBILITY_TEST_CONFIRM"
    ) == "YES"

    engine = create_engine(url)

    metadata = User.__table__.metadata

    tables = [
        User.__table__,
        AdminRole.__table__,
        LidyaLedger.__table__,
        LidyaGemLedger.__table__,
    ] + [
        table for table in metadata.tables.values()
        if table.name.startswith("nobility_")
    ]

    metadata.create_all(engine,tables=tables)

    with Session(engine) as db:
        for rank in (1,2,3,4):
            rule = policy.get_rank_rule(rank)

            db.add(models.NobilityRankConfig(
                rank=rank,
                enabled=True,
                required_points=rule.required_points,
                renewal_points=rule.renewal_points,
                duration_days=rule.duration_days,
            ))

        db.commit()

    yield engine
    engine.dispose()


@pytest.fixture
def env(engine,monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED","true"
    )

    monkeypatch.setattr(
        collection.staff_identity,
        "role_for",
        lambda user: None
    )

    uid = uuid4().hex

    with Session(engine) as db:
        db.add(User(
            id=uid,
            public_id=uid,
            _nickname="Count Test",
            lidya=500,
            lidya_gem=100,
        ))

        db.commit()

        assert apply_points(
            db,uid,3000000,
            "test:"+uid,
            "isolated_test",
        )

        db.commit()

        yield db,uid


def request(db,uid,action,rank):
    state = membership_state(db,uid)
    rule = policy.get_rank_rule(rank)

    cost = (
        rule.renewal_points
        if action == "renew"
        else rule.required_points
    )

    return NobilityActionRequest(
        rank=rank,
        request_id=str(uuid4()),
        confirmed_revision=state["revision"],
        confirmed_cost=str(cost),
    )


def perform(db,uid,action,rank):
    return execute_action(
        db,uid,action,
        request(db,uid,action,rank)
    )


def test_count_activation(env):
    db,uid = env

    result = perform(db,uid,"activate",2)

    assert result["applied"] is True

    state = result["membership"]

    assert state["rank"] == 2
    assert state["points"] == "2200000"

    member = db.get(
        models.NobilityMembership,uid
    )

    assert (
        member.expires_at-member.started_at
    ) == timedelta(days=30)


def test_count_renewal_and_duplicate(env):
    db,uid = env

    perform(db,uid,"activate",2)

    member = db.get(
        models.NobilityMembership,uid
    )

    old_expiry = member.expires_at

    payload = request(db,uid,"renew",2)

    result = execute_action(
        db,uid,"renew",payload
    )

    assert result["applied"] is True
    assert result["membership"]["points"] == "2000000"

    db.refresh(member)

    assert member.expires_at == (
        old_expiry+timedelta(days=30)
    )

    duplicate = execute_action(
        db,uid,"renew",payload
    )

    assert duplicate["duplicate"] is True

    db.refresh(member)

    assert member.points == 2000000

    assert member.expires_at == (
        old_expiry+timedelta(days=30)
    )


def test_knight_to_count_upgrade(env):
    db,uid = env

    perform(db,uid,"activate",1)

    result = perform(db,uid,"upgrade",2)

    assert result["membership"]["rank"] == 2
    assert result["membership"]["points"] == "1800000"


def test_count_to_duke_upgrade(env):
    db,uid = env

    perform(db,uid,"activate",2)

    result = perform(db,uid,"upgrade",3)

    assert result["membership"]["rank"] == 3
    assert result["membership"]["points"] == "600000"

    user = db.get(User,uid)
    rows = collection.inventory(db,user)

    count_items = [
        r for r in rows
        if r["nobility_rank"] == 2
    ]

    assert len(count_items) == 4

    assert all(
        r["locked"] and not r["equipped"]
        for r in count_items
    )


def test_count_expiration(env):
    db,uid = env

    perform(db,uid,"activate",2)

    member = db.get(
        models.NobilityMembership,uid
    )

    now = datetime.now(timezone.utc)

    member.started_at = now-timedelta(days=31)
    member.expires_at = now-timedelta(days=1)

    db.commit()

    state = membership_state(db,uid)

    assert state["rank"] == 0
    assert not state["active"]

    assert not policy.has_privilege(
        db,uid,"kick_protection"
    )

    assert not policy.has_privilege(
        db,uid,"gift_bonus"
    )

    with pytest.raises(HTTPException):
        perform(db,uid,"renew",2)

    result = perform(db,uid,"activate",2)

    assert result["membership"]["rank"] == 2
    assert result["membership"]["points"] == "1400000"


def test_wrong_confirmed_cost_rejected(env):
    db,uid = env

    payload = request(db,uid,"activate",2)

    payload = payload.model_copy(
        update={"confirmed_cost":"1"}
    )

    with pytest.raises(HTTPException):
        execute_action(
            db,uid,"activate",payload
        )

    state = membership_state(db,uid)

    assert state["rank"] == 0
    assert state["points"] == "3000000"


def test_balances_unchanged(env):
    db,uid = env

    perform(db,uid,"activate",2)
    perform(db,uid,"renew",2)
    perform(db,uid,"upgrade",3)

    account = db.get(User,uid)

    assert account.lidya == 500
    assert account.lidya_gem == 100

    assert membership_state(
        db,uid
    )["points"] == "400000"


def test_duke_final_activation(env):
    db,uid = env

    result = perform(db,uid,"activate",3)
    state = result["membership"]

    assert result["applied"] is True
    assert state["rank"] == 3
    assert state["points"] == "1400000"

    member = db.get(models.NobilityMembership,uid)

    assert member.expires_at-member.started_at == timedelta(days=30)

    assert len(policy.privileges_for_rank(3)) == 11

    for privilege in policy.privileges_for_rank(3):
        assert policy.has_privilege(db,uid,privilege)

    assert not policy.has_privilege(db,uid,"super_kick")


def test_duke_final_renewal(env):
    db,uid = env

    perform(db,uid,"activate",3)

    member = db.get(models.NobilityMembership,uid)
    old_expiry = member.expires_at

    payload = request(db,uid,"renew",3)

    result = execute_action(db,uid,"renew",payload)

    assert result["applied"] is True
    assert result["membership"]["points"] == "1000000"

    db.refresh(member)

    assert member.expires_at == old_expiry+timedelta(days=30)

    duplicate = execute_action(db,uid,"renew",payload)

    assert duplicate["duplicate"] is True

    db.refresh(member)

    assert member.points == 1000000
    assert member.expires_at == old_expiry+timedelta(days=30)

    account = db.get(User,uid)

    assert account.lidya == 500
    assert account.lidya_gem == 100


def test_duke_final_background(env):
    from backend.app.nobility_appearance import public_appearance

    db,uid = env

    perform(db,uid,"activate",3)

    user = db.get(User,uid)

    items = collection.inventory(db,user)

    current = [
        x for x in items
        if x["nobility_rank"] == 3
    ]

    assert len(current) == 5

    assert "region_background" in public_appearance(
        db,uid
    )["privileges"]

    collection.set_preference(
        db,user,3,"region_background",False
    )

    assert "region_background" not in public_appearance(
        db,uid
    )["privileges"]

    collection.set_preference(
        db,user,3,"region_background",True
    )

    assert "region_background" in public_appearance(
        db,uid
    )["privileges"]


def test_duke_final_bonus(env,monkeypatch):
    from backend.app import gift_payout

    db,uid = env

    perform(db,uid,"activate",3)

    monkeypatch.setattr(
        gift_payout.secrets,"randbelow",lambda n:0
    )

    assert gift_payout.recipient_gift_payout(
        db,uid,1000
    ) == 670

    assert gift_payout.recipient_gift_payout(
        db,uid,9
    ) == 0

    member = db.get(models.NobilityMembership,uid)

    now = datetime.now(timezone.utc)

    member.started_at = now-timedelta(days=32)
    member.expires_at = now-timedelta(days=2)

    db.commit()

    assert gift_payout.recipient_gift_payout(
        db,uid,1000
    ) == 0

    assert not policy.has_privilege(
        db,uid,"kick_protection"
    )
