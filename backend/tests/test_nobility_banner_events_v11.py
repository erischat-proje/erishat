from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.app.nobility_banner_models import NobilityBannerEvent
from backend.app.nobility_banner_limits import reserve_gift_banner


@pytest.fixture
def engine(scoped_db):
    NobilityBannerEvent.__table__.create(scoped_db)
    return scoped_db


def reserve(engine, key, uid="u1"):
    with Session(engine) as db:
        result = reserve_gift_banner(db, uid, key)
        db.commit()
        return result


@pytest.mark.parametrize("key", ["gift:123", "couple:123"])
def test_first_event(engine, key):
    assert reserve(engine, key)


@pytest.mark.parametrize("key", ["gift:123", "couple:123"])
def test_duplicate_event(engine, key):
    assert reserve(engine, key)
    assert not reserve(engine, key)


def test_different_events(engine):
    assert reserve(engine, "gift:1")
    assert reserve(engine, "gift:2")


def test_independent_sources(engine):
    assert reserve(engine, "gift:1")
    assert reserve(engine, "couple:1")


def test_duplicate_other_user(engine):
    assert reserve(engine, "gift:1", "u1")
    assert not reserve(engine, "gift:1", "u2")


def test_rollback(engine):
    with Session(engine) as db:
        assert reserve_gift_banner(
            db, "u1", "gift:rollback"
        )
        db.rollback()

    assert reserve(engine, "gift:rollback")


@pytest.mark.parametrize("key", ["gift:race", "couple:race"])
def test_concurrent_event(engine, key):
    barrier = Barrier(4)

    def worker():
        barrier.wait(timeout=15)
        return reserve(engine, key)

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(worker) for _ in range(4)]
        results = [f.result(timeout=30) for f in futures]

    assert results.count(True) == 1
    assert results.count(False) == 3

    with Session(engine) as db:
        assert db.scalar(
            select(func.count())
            .select_from(NobilityBannerEvent)
        ) == 1


@pytest.mark.parametrize(
    "key", [None, "", 123, "invalid:1", "gift:"+"x"*160]
)
def test_invalid_event(engine, key):
    with pytest.raises(ValueError):
        reserve(engine, key)
