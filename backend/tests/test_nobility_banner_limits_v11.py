from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.app.nobility_banner_models import NobilityBannerLimit
from backend.app.nobility_banner_limits import reserve_banner


NOW = datetime(
    2026, 11, 26, 10, 0,
    tzinfo=timezone.utc,
)


@pytest.fixture
def engine(scoped_db):
    NobilityBannerLimit.__table__.create(scoped_db)
    return scoped_db


def reserve(engine, kind, room=None, at=NOW, uid="u1"):
    with Session(engine) as db:
        result = reserve_banner(
            db, uid, kind, room, at
        )
        db.commit()
        return result


def test_daily_first_entry(engine):
    assert reserve(engine, "daily_banner")


def test_daily_duplicate(engine):
    assert reserve(engine, "daily_banner")
    assert not reserve(engine, "daily_banner")


def test_daily_other_room(engine):
    assert reserve(engine, "daily_banner", "r1")
    assert not reserve(engine, "daily_banner", "r2")


def test_daily_other_user(engine):
    assert reserve(engine, "daily_banner", uid="u1")
    assert reserve(engine, "daily_banner", uid="u2")


def test_daily_midnight(engine):
    before = datetime(
        2026, 11, 26, 20, 59, 59,
        tzinfo=timezone.utc,
    )

    after = before + timedelta(seconds=1)

    assert reserve(engine, "daily_banner", at=before)
    assert reserve(engine, "daily_banner", at=after)
    assert not reserve(engine, "daily_banner", at=after)


@pytest.mark.parametrize(
    "seconds,expected",
    [(0,False),(1,False),(1799,False),
     (1800,True),(1801,True)],
)
def test_room_cooldown(engine, seconds, expected):
    assert reserve(engine, "room_welcome", "r1")

    assert reserve(
        engine,
        "room_welcome",
        "r1",
        NOW + timedelta(seconds=seconds),
    ) is expected


def test_different_rooms(engine):
    assert reserve(engine, "room_welcome", "r1")
    assert reserve(engine, "room_welcome", "r2")


def test_different_users(engine):
    assert reserve(
        engine,"room_welcome","r1",uid="u1"
    )
    assert reserve(
        engine,"room_welcome","r1",uid="u2"
    )


def test_independent_banner_types(engine):
    assert reserve(engine, "daily_banner")
    assert reserve(engine, "room_welcome", "r1")


@pytest.mark.parametrize(
    "kind,room",
    [("daily_banner",None),("room_welcome","r1")],
)
def test_concurrent_entries(engine, kind, room):
    barrier = Barrier(4)

    def worker():
        barrier.wait(timeout=15)
        return reserve(engine, kind, room)

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(worker) for _ in range(4)]
        results = [f.result(timeout=30) for f in futures]

    assert results.count(True) == 1
    assert results.count(False) == 3


def test_rollback_restores_right(engine):
    with Session(engine) as db:
        assert reserve_banner(
            db,"u1","daily_banner",at=NOW
        )
        db.rollback()

    assert reserve(engine, "daily_banner")


def test_daily_storage_bounded(engine):
    for day in range(5):
        assert reserve(
            engine,
            "daily_banner",
            at=NOW+timedelta(days=day),
        )

    with Session(engine) as db:
        count = db.scalar(
            select(func.count())
            .select_from(NobilityBannerLimit)
        )

    assert count == 1


@pytest.mark.parametrize(
    "room",[None,"","x"*129,123]
)
def test_invalid_room(engine,room):
    with pytest.raises(ValueError):
        reserve(engine,"room_welcome",room)


def test_invalid_kind(engine):
    with pytest.raises(ValueError):
        reserve(engine,"unknown")


def test_naive_time(engine):
    with pytest.raises(ValueError):
        reserve(
            engine,
            "daily_banner",
            at=NOW.replace(tzinfo=None),
        )
