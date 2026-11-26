"""Real nobility membership entitlement tests."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.nobility_config import RANK_RULES
from backend.app.nobility_engine import activate_rank
from backend.app.nobility_models import NobilityMembership
from backend.app.nobility_super_kick import reserve_super_kick
from backend.app.nobility_super_kick_models import (
    NobilitySuperKickQuota,
    NobilitySuperKickEvent,
)

from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine, fund


@pytest.fixture
def real_engine(engine):
    Base.metadata.create_all(
        engine,
        tables=[
            NobilitySuperKickQuota.__table__,
            NobilitySuperKickEvent.__table__,
        ],
    )
    return engine


def activate(engine, rank):
    fund(engine, RANK_RULES[rank].required_points)

    with Session(engine) as db:
        result = activate_rank(
            db, "u1", rank, "activation-kick-test"
        )
        assert result["applied"] is True
        db.commit()


def reserve(engine):
    with Session(engine) as db:
        result = reserve_super_kick(db, "u1")
        db.commit()
        return result


def quota_count(engine):
    with Session(engine) as db:
        return len(db.scalars(
            select(NobilitySuperKickQuota)
        ).all())


@pytest.mark.parametrize("rank", [1, 2, 3, 4])
def test_real_rank_entitlement(real_engine, rank):
    activate(real_engine, rank)

    result = reserve(real_engine)

    if rank == 4:
        assert result == 4
        assert quota_count(real_engine) == 1
    else:
        assert result is None
        assert quota_count(real_engine) == 0


def test_no_membership(real_engine):
    assert reserve(real_engine) is None
    assert quota_count(real_engine) == 0


def test_expired_king(real_engine):
    activate(real_engine, 4)

    with Session(real_engine) as db:
        member = db.get(NobilityMembership, "u1")
        now = datetime.now(timezone.utc)
        member.started_at = now - timedelta(days=31)
        member.expires_at = now - timedelta(days=1)
        db.commit()

    assert reserve(real_engine) is None
    assert quota_count(real_engine) == 0


def test_disabled_nobility(real_engine, monkeypatch):
    activate(real_engine, 4)

    from backend.app import nobility_policy

    monkeypatch.setattr(
        nobility_policy, "enabled", lambda: False
    )

    assert reserve(real_engine) is None
    assert quota_count(real_engine) == 0


def test_real_king_daily_limit(real_engine):
    activate(real_engine, 4)

    assert [
        reserve(real_engine) for _ in range(5)
    ] == [4, 3, 2, 1, 0]

    assert reserve(real_engine) is None


def test_real_king_rollback(real_engine):
    activate(real_engine, 4)

    with Session(real_engine) as db:
        assert reserve_super_kick(db, "u1") == 4
        db.rollback()

    assert quota_count(real_engine) == 0
    assert reserve(real_engine) == 4
