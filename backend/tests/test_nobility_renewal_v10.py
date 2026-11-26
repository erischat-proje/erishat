"""Nobility renewal transactional security tests."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from datetime import datetime, timezone, timedelta

import pytest
from sqlalchemy.orm import Session

from backend.app.nobility_config import RANK_RULES
from backend.app.nobility_engine import renew_rank
from backend.app.nobility_models import (
    NobilityMembership,
    NobilityRankConfig,
)
from backend.app.nobility_policy import utc

from test_nobility_activation_v10 import (
    engine,
    fund,
    verify,
)
from test_nobility_postgres_v1 import scoped_db
from test_nobility_upgrade_v10 import prepare


def expiry(engine):
    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        return utc(member.expires_at)


@pytest.mark.parametrize("rank", [1, 2, 3, 4])
def test_renewal_price_and_duration(engine, rank):
    cost = RANK_RULES[rank].renewal_points

    prepare(engine, rank, cost + 100)

    old_expiry = expiry(engine)

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        old_start = utc(member.started_at)

        result = renew_rank(
            db, "u1", rank, "renewal"
        )
        db.commit()

        assert result["applied"] is True
        assert utc(member.started_at) == old_start

    assert expiry(engine) == (
        old_expiry + timedelta(days=30)
    )

    verify(engine, rank, 100, 2)


def test_insufficient_points(engine):
    prepare(engine, 1, 99_999)
    old_expiry = expiry(engine)

    with Session(engine) as db:
        with pytest.raises(
            ValueError, match="Insufficient points"
        ):
            renew_rank(db, "u1", 1, "low")

        db.commit()

    assert expiry(engine) == old_expiry
    verify(engine, 1, 99_999, 1)


def test_expired_membership(engine):
    prepare(engine, 1, 100_000)

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        now = datetime.now(timezone.utc)

        member.started_at = now - timedelta(days=31)
        member.expires_at = now - timedelta(days=1)

        db.commit()

        with pytest.raises(
            ValueError, match="Active membership required"
        ):
            renew_rank(db, "u1", 1, "expired")

        db.commit()

    verify(engine, 1, 100_000, 1)


def test_no_active_membership(engine):
    fund(engine, 100_000)

    with Session(engine) as db:
        with pytest.raises(
            ValueError, match="Active membership required"
        ):
            renew_rank(db, "u1", 1, "inactive")

        db.commit()

    verify(engine, 0, 100_000, 0)


@pytest.mark.parametrize("target", [1, 3])
def test_wrong_rank(engine, target):
    prepare(engine, 2, 800_000)
    old_expiry = expiry(engine)

    with Session(engine) as db:
        with pytest.raises(
            ValueError, match="Rank mismatch"
        ):
            renew_rank(db, "u1", target, "wrong")

        db.commit()

    assert expiry(engine) == old_expiry
    verify(engine, 2, 800_000, 1)


def test_duplicate_renewal(engine):
    prepare(engine, 1, 200_000)
    old_expiry = expiry(engine)

    with Session(engine) as db:
        first = renew_rank(db, "u1", 1, "same")
        db.commit()

        second = renew_rank(db, "u1", 1, "same")
        db.commit()

        assert first["applied"] is True
        assert second["duplicate"] is True

    assert expiry(engine) == (
        old_expiry + timedelta(days=30)
    )

    verify(engine, 1, 100_000, 2)


def test_request_conflict(engine):
    prepare(engine, 1, 200_000)

    with Session(engine) as db:
        renew_rank(db, "u1", 1, "same")
        db.commit()

        with pytest.raises(
            ValueError, match="Request conflict"
        ):
            renew_rank(db, "u1", 2, "same")

        db.commit()

    verify(engine, 1, 100_000, 2)


def test_renewal_rollback(engine):
    prepare(engine, 1, 100_000)
    old_expiry = expiry(engine)

    with Session(engine) as db:
        renew_rank(db, "u1", 1, "rollback")
        db.rollback()

    assert expiry(engine) == old_expiry
    verify(engine, 1, 100_000, 1)


def test_invalid_configuration(engine):
    prepare(engine, 1, 100_000)
    old_expiry = expiry(engine)

    with Session(engine) as db:
        config = db.get(NobilityRankConfig, 1)
        config.renewal_points = 1
        db.commit()

        with pytest.raises(
            ValueError, match="configuration unavailable"
        ):
            renew_rank(db, "u1", 1, "invalid")

        db.commit()

    assert expiry(engine) == old_expiry
    verify(engine, 1, 100_000, 1)


def test_disabled_renewal(engine, monkeypatch):
    prepare(engine, 1, 100_000)
    old_expiry = expiry(engine)

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    with Session(engine) as db:
        with pytest.raises(
            ValueError, match="Nobility disabled"
        ):
            renew_rank(db, "u1", 1, "disabled")

        db.commit()

    assert expiry(engine) == old_expiry
    verify(engine, 1, 100_000, 1)


@pytest.mark.parametrize(
    "keys,points,expected,extensions",
    [
        (
            ["same", "same"],
            200_000,
            ["applied", "duplicate"],
            1,
        ),
        (
            ["first", "second"],
            100_000,
            ["applied", "rejected"],
            1,
        ),
        (
            ["first", "second"],
            200_000,
            ["applied", "applied"],
            2,
        ),
    ],
)
def test_concurrent_renewal(
    engine, keys, points, expected, extensions
):
    prepare(engine, 1, points)
    old_expiry = expiry(engine)

    barrier = Barrier(2)

    def worker(key):
        with Session(engine) as db:
            barrier.wait(timeout=10)

            try:
                result = renew_rank(
                    db, "u1", 1, key
                )
                db.commit()

                return (
                    "applied" if result["applied"]
                    else "duplicate"
                )

            except ValueError as error:
                db.rollback()
                assert str(error) == "Insufficient points"
                return "rejected"

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(worker, key)
            for key in keys
        ]

        results = [
            future.result(timeout=30)
            for future in futures
        ]

    assert sorted(results) == sorted(expected)

    assert expiry(engine) == (
        old_expiry + timedelta(days=30 * extensions)
    )

    verify(
        engine,
        1,
        points - 100_000 * extensions,
        1 + extensions,
    )
