"""Nobility expiry and privilege authorization tests."""

from datetime import datetime, timezone, timedelta

import pytest
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityRankConfig,
)
from backend.app.nobility_policy import (
    effective_rank,
    active_rank,
    has_privilege,
    privileges_for_rank,
    utc,
)

from test_nobility_activation_v10 import engine
from test_nobility_postgres_v1 import scoped_db
from test_nobility_upgrade_v10 import prepare


@pytest.mark.parametrize(
    "rank,count",
    [(1,6),(2,8),(3,11),(4,16)],
)
def test_active_privileges(engine,rank,count):
    prepare(engine,rank,100)

    with Session(engine) as db:
        assert active_rank(db,"u1")==rank

        privileges=privileges_for_rank(rank)

        assert len(privileges)==count

        for privilege in privilege_list():
            assert has_privilege(
                db,"u1",privilege
            ) == (privilege in privileges)


def privilege_list():
    return privileges_for_rank(4)


@pytest.mark.parametrize("rank",[1,2,3,4])
def test_exact_expiry_boundary(engine,rank):
    prepare(engine,rank,100)

    with Session(engine) as db:
        member=db.get(NobilityMembership,"u1")
        expires=utc(member.expires_at)

        assert effective_rank(
            member,expires-timedelta(microseconds=1)
        )==rank

        assert effective_rank(member,expires)==0

        assert active_rank(db,"u1",expires)==0

        for privilege in privilege_list():
            assert not has_privilege(
                db,"u1",privilege,expires
            )

        assert member.points==100


def test_future_membership(engine):
    prepare(engine,4,100)

    with Session(engine) as db:
        member=db.get(NobilityMembership,"u1")
        now=datetime.now(timezone.utc)

        member.started_at=now+timedelta(days=1)
        member.expires_at=now+timedelta(days=31)

        db.commit()

        assert active_rank(db,"u1")==0


def test_disabled_system(engine,monkeypatch):
    prepare(engine,4,100)

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED","false"
    )

    with Session(engine) as db:
        assert active_rank(db,"u1")==0

        for privilege in privilege_list():
            assert not has_privilege(
                db,"u1",privilege
            )


def test_disabled_rank(engine):
    prepare(engine,4,100)

    with Session(engine) as db:
        config=db.get(NobilityRankConfig,4)
        config.enabled=False
        db.commit()

        assert active_rank(db,"u1")==0


@pytest.mark.parametrize(
    "field",
    [
        "required_points",
        "renewal_points",
        "duration_days",
    ],
)
def test_invalid_rank_configuration(engine,field):
    prepare(engine,4,100)

    with Session(engine) as db:
        config=db.get(NobilityRankConfig,4)
        setattr(config,field,1)
        db.commit()

        assert active_rank(db,"u1")==0


def test_unknown_privilege(engine):
    prepare(engine,4,100)

    with Session(engine) as db:
        assert not has_privilege(
            db,"u1","unknown_privilege"
        )


def test_account_isolation(engine):
    prepare(engine,4,100)

    with Session(engine) as db:
        assert active_rank(db,"u1")==4
        assert active_rank(db,"u2")==0

        for privilege in privilege_list():
            assert not has_privilege(
                db,"u2",privilege
            )
