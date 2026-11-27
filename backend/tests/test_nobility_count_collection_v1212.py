import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.app.models import User
from sqlalchemy import Integer

from backend.app.system_data import (
    LidyaLedger,
    LidyaGemLedger,
)
from backend.app.admin_models import AdminRole

from backend.app import nobility_collection as collection
from backend.app import nobility_policy as policy
from backend.app import nobility_banner_policy as banners
from backend.app.nobility_models import (
    NobilityMembership,
    NobilityRankConfig,
    NobilityVisualPreference,
    NobilityAuditLog,
)


ITEMS = (
    "badge",
    "frame",
    "entrance",
    "gift_banner",
)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "true"
    )

    monkeypatch.setattr(
        collection.staff_identity,
        "role_for",
        lambda user: None
    )

    engine = create_engine(
        "sqlite+pysqlite:///:memory:"
    )

    # Keep shared financial ledger hooks active.
    for model in (LidyaLedger, LidyaGemLedger):
        column = model.__table__.c.id

        monkeypatch.setattr(
            column,
            "type",
            column.type.with_variant(
                Integer(), "sqlite"
            ),
        )

    tables = [
        User.__table__,
        AdminRole.__table__,
        LidyaLedger.__table__,
        LidyaGemLedger.__table__,
        NobilityMembership.__table__,
        NobilityRankConfig.__table__,
        NobilityVisualPreference.__table__,
        NobilityAuditLog.__table__,
    ]

    User.__table__.metadata.create_all(
        engine, tables=tables
    )

    now = datetime.now(timezone.utc)

    with Session(engine) as db:
        for uid,pid in [
            ("count-user", "9000000001"),
            ("other-user", "9000000002"),
        ]:
            db.add(User(
                id=uid,
                public_id=pid,
                _nickname=uid,
                lidya=500,
                lidya_gem=100,
            ))

        for rank in (1,2,3,4):
            rule = policy.get_rank_rule(rank)

            db.add(NobilityRankConfig(
                rank=rank,
                enabled=True,
                required_points=rule.required_points,
                renewal_points=rule.renewal_points,
                duration_days=rule.duration_days,
            ))

        for uid in ("count-user", "other-user"):
            db.add(NobilityMembership(
                user_id=uid,
                rank=2,
                points=123456,
                started_at=now-timedelta(days=1),
                expires_at=now+timedelta(days=20),
            ))

        db.commit()

        yield db, SimpleNamespace(id="count-user"), engine

    engine.dispose()


def get_item(db,user,privilege):
    return next(
        row for row in collection.inventory(db,user)
        if row["nobility_rank"] == 2
        and row["nobility_privilege"] == privilege
    )


def test_count_inventory(env):
    db,user,_ = env

    rows = collection.inventory(db,user)

    assert len(rows) == 4

    assert {
        row["nobility_privilege"]
        for row in rows
    } == set(ITEMS)

    for row in rows:
        assert row["asset"].startswith(
            "assets/lidya-nobility/count/"
        )
        assert row["equipped"] is True
        assert row["locked"] is False


@pytest.mark.parametrize("privilege", ITEMS)
def test_count_equip_unequip(env,privilege):
    db,user,_ = env

    collection.set_preference(
        db,user,2,privilege,False
    )

    assert not get_item(
        db,user,privilege
    )["equipped"]

    collection.set_preference(
        db,user,2,privilege,True
    )

    assert get_item(
        db,user,privilege
    )["equipped"]


@pytest.mark.parametrize("privilege", ITEMS)
def test_preferences_persist(env,privilege):
    db,user,engine = env

    collection.set_preference(
        db,user,2,privilege,False
    )

    with Session(engine) as new_db:
        assert not get_item(
            new_db,user,privilege
        )["equipped"]


def test_preferences_isolated(env):
    db,user,_ = env

    collection.set_preference(
        db,user,2,"badge",False
    )

    other = SimpleNamespace(id="other-user")

    assert get_item(
        db,other,"badge"
    )["equipped"]


def test_nonvisual_privileges_unchanged(env):
    db,user,_ = env

    for privilege in ITEMS:
        collection.set_preference(
            db,user,2,privilege,False
        )

    for privilege in (
        "online_priority",
        "kick_protection",
        "gift_bonus",
    ):
        assert policy.has_privilege(
            db,user.id,privilege
        )


@pytest.mark.parametrize("privilege", [
    "online_priority",
    "kick_protection",
    "gift_bonus",
    "activation_banner",
    "unknown",
])
def test_non_collection_item_rejected(env,privilege):
    db,user,_ = env

    with pytest.raises(HTTPException) as err:
        collection.set_preference(
            db,user,2,privilege,False
        )

    assert err.value.status_code == 400


@pytest.mark.parametrize("rank", [1,3,4])
def test_other_rank_rejected(env,rank):
    db,user,_ = env

    with pytest.raises(HTTPException) as err:
        collection.set_preference(
            db,user,rank,"badge",True
        )

    assert err.value.status_code == 403


def test_expired_items_locked(env):
    db,user,_ = env

    member = db.get(
        NobilityMembership,user.id
    )

    member.expires_at = datetime.now(
        timezone.utc
    )-timedelta(seconds=1)

    db.commit()

    rows = collection.inventory(db,user)

    assert len(rows) == 4

    assert all(
        row["locked"]
        and row["expired"]
        and not row["equipped"]
        for row in rows
    )

    with pytest.raises(HTTPException) as err:
        collection.set_preference(
            db,user,2,"badge",True
        )

    assert err.value.status_code == 403


def test_upgrade_preserves_collection(env):
    db,user,_ = env

    member = db.get(
        NobilityMembership,user.id
    )

    db.add(NobilityAuditLog(
        id=str(uuid4()),
        user_id=user.id,
        action="rank_activation",
        before_state="{}",
        after_state=json.dumps({
            "rank":2,
            "expires_at":
                member.expires_at.isoformat()
        }),
        reason="isolated test",
    ))

    member.rank = 3
    db.commit()

    rows = collection.inventory(db,user)

    old = [
        r for r in rows
        if r["nobility_rank"] == 2
    ]

    current = [
        r for r in rows
        if r["nobility_rank"] == 3
    ]

    assert len(old) == 4
    assert len(current) == 5

    assert all(
        r["locked"] and not r["equipped"]
        for r in old
    )

    assert all(
        not r["locked"] for r in current
    )


def test_staff_frame_protection(env,monkeypatch):
    db,user,_ = env

    monkeypatch.setattr(
        collection.staff_identity,
        "role_for",
        lambda user: "DA"
    )

    assert not any(
        r["nobility_privilege"] == "frame"
        for r in collection.inventory(db,user)
    )

    with pytest.raises(HTTPException) as err:
        collection.set_preference(
            db,user,2,"frame",True
        )

    assert err.value.status_code == 403


def test_gift_banner_toggle(env):
    db,user,_ = env

    assert banners.authorized_banner(
        db,user.id,"gift_banner",ghost=False
    )["rank"] == 2

    collection.set_preference(
        db,user,2,"gift_banner",False
    )

    assert banners.authorized_banner(
        db,user.id,"gift_banner",ghost=False
    ) is None

    collection.set_preference(
        db,user,2,"gift_banner",True
    )

    assert banners.authorized_banner(
        db,user.id,"gift_banner",ghost=False
    )["rank"] == 2


def test_balances_and_points_unchanged(env):
    db,user,_ = env

    for privilege in ITEMS:
        for enabled in (False,True):
            collection.set_preference(
                db,user,2,privilege,enabled
            )

    member = db.get(
        NobilityMembership,user.id
    )

    account = db.get(User,user.id)

    assert member.points == 123456
    assert account.lidya == 500
    assert account.lidya_gem == 100
    assert member.rank == 2
