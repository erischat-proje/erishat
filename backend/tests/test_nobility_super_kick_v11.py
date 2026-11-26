"""PostgreSQL super-kick quota security tests."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app import nobility_super_kick as kick
from backend.app.nobility_super_kick_models import (
    NobilitySuperKickQuota,
    NobilitySuperKickEvent,
)

from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine


AT = datetime(2026, 11, 26, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def kick_engine(engine, monkeypatch):
    Base.metadata.create_all(
        engine,
        tables=[
            NobilitySuperKickQuota.__table__,
            NobilitySuperKickEvent.__table__,
        ],
    )

    monkeypatch.setattr(
        kick,
        "has_privilege",
        lambda db, uid, privilege, at=None: (
            uid == "u1" and privilege == "super_kick"
        ),
    )

    return engine


def reserve(engine, uid="u1", at=AT):
    with Session(engine) as db:
        result = kick.reserve_super_kick(db, uid, at)
        db.commit()
        return result


def quotas(engine):
    with Session(engine) as db:
        return db.scalars(
            select(NobilitySuperKickQuota)
        ).all()


def test_first_use(kick_engine):
    assert reserve(kick_engine) == 4
    assert quotas(kick_engine)[0].used == 1


def test_daily_limit(kick_engine):
    assert [
        reserve(kick_engine)
        for _ in range(5)
    ] == [4, 3, 2, 1, 0]

    assert reserve(kick_engine) is None
    assert quotas(kick_engine)[0].used == 5


def test_unauthorized_user(kick_engine):
    assert reserve(kick_engine, "u2") is None
    assert quotas(kick_engine) == []


@pytest.mark.parametrize("rank", [0, 1, 2, 3])
def test_denied_entitlement(kick_engine, monkeypatch, rank):
    monkeypatch.setattr(
        kick,
        "has_privilege",
        lambda *args: rank >= 4,
    )

    assert reserve(kick_engine) is None
    assert quotas(kick_engine) == []


def test_rollback(kick_engine):
    with Session(kick_engine) as db:
        assert kick.reserve_super_kick(db, "u1", AT) == 4
        db.rollback()

    assert quotas(kick_engine) == []
    assert reserve(kick_engine) == 4


def test_existing_quota_rollback(kick_engine):
    assert reserve(kick_engine) == 4

    with Session(kick_engine) as db:
        assert kick.reserve_super_kick(db, "u1", AT) == 3
        db.rollback()

    assert quotas(kick_engine)[0].used == 1
    assert reserve(kick_engine) == 3


def test_concurrent_twenty_requests(kick_engine):
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(
            lambda _: reserve(kick_engine),
            range(20),
        ))

    successful = sorted(
        x for x in results if x is not None
    )

    assert successful == [0, 1, 2, 3, 4]
    assert results.count(None) == 15
    assert quotas(kick_engine)[0].used == 5


def test_istanbul_midnight(kick_engine):
    before = datetime(
        2026, 11, 26, 20, 59, 59,
        tzinfo=timezone.utc,
    )

    after = before + timedelta(seconds=1)

    for _ in range(5):
        assert reserve(kick_engine, at=before) is not None

    assert reserve(kick_engine, at=before) is None
    assert reserve(kick_engine, at=after) == 4

    rows = sorted(quotas(kick_engine), key=lambda x: x.day)

    assert len(rows) == 2
    assert rows[0].used == 5
    assert rows[1].used == 1


def test_timezone_required(kick_engine):
    with Session(kick_engine) as db:
        with pytest.raises(ValueError):
            kick.reserve_super_kick(
                db, "u1", datetime(2026, 11, 26)
            )

    assert quotas(kick_engine) == []


def test_entitlement_removed(kick_engine, monkeypatch):
    assert reserve(kick_engine) == 4

    monkeypatch.setattr(
        kick, "has_privilege", lambda *args: False
    )

    assert reserve(kick_engine) is None
    assert quotas(kick_engine)[0].used == 1


def test_independent_user_quotas(kick_engine, monkeypatch):
    monkeypatch.setattr(
        kick, "has_privilege", lambda *args: True
    )

    for _ in range(5):
        assert reserve(kick_engine, "u1") is not None

    assert reserve(kick_engine, "u1") is None
    assert reserve(kick_engine, "u2") == 4

    assert len(quotas(kick_engine)) == 2
