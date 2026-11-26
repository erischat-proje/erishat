"""Nobility upgrade security tests."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from backend.app.nobility_config import RANK_RULES
from backend.app.nobility_engine import (
    activate_rank,
    upgrade_rank,
)
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


def prepare(engine, rank, remaining):
    fund(
        engine,
        RANK_RULES[rank].required_points + remaining
    )

    with Session(engine) as db:
        activate_rank(
            db, "u1", rank, "initial"
        )
        db.commit()


@pytest.mark.parametrize(
    "old_rank,new_rank",
    [
        (1, 2),
        (1, 3),
        (1, 4),
        (2, 3),
        (2, 4),
        (3, 4),
    ],
)
def test_full_upgrade_price(
    engine, old_rank, new_rank
):
    cost = RANK_RULES[new_rank].required_points

    prepare(engine, old_rank, cost + 100)

    with Session(engine) as db:
        result = upgrade_rank(
            db, "u1", new_rank, "upgrade"
        )
        db.commit()

        assert result["applied"] is True

        member = db.get(NobilityMembership, "u1")

        assert (
            utc(member.expires_at)
            - utc(member.started_at)
        ) == timedelta(days=30)

    verify(engine, new_rank, 100, 2)


def test_insufficient_full_price(engine):
    prepare(engine, 1, 799_999)

    with Session(engine) as db:
        with pytest.raises(
            ValueError, match="Insufficient points"
        ):
            upgrade_rank(db, "u1", 2, "low")

        db.commit()

    verify(engine, 1, 799_999, 1)


@pytest.mark.parametrize("target", [1, 2])
def test_same_or_lower_rank(engine, target):
    prepare(engine, 2, 3_200_000)

    with Session(engine) as db:
        with pytest.raises(
            ValueError, match="Higher rank required"
        ):
            upgrade_rank(db, "u1", target, "lower")

        db.commit()

    verify(engine, 2, 3_200_000, 1)


def test_no_active_membership(engine):
    fund(engine, 800_000)

    with Session(engine) as db:
        with pytest.raises(
            ValueError, match="Active membership required"
        ):
            upgrade_rank(db, "u1", 2, "inactive")

        db.commit()

    verify(engine, 0, 800_000, 0)


def test_duplicate_upgrade(engine):
    prepare(engine, 1, 1_600_000)

    with Session(engine) as db:
        first = upgrade_rank(
            db, "u1", 2, "same"
        )
        db.commit()

        second = upgrade_rank(
            db, "u1", 2, "same"
        )
        db.commit()

        assert first["applied"] is True
        assert second["duplicate"] is True

    verify(engine, 2, 800_000, 2)


def test_request_conflict(engine):
    prepare(engine, 1, 3_200_000)

    with Session(engine) as db:
        upgrade_rank(db, "u1", 2, "same")
        db.commit()

        with pytest.raises(
            ValueError, match="Request conflict"
        ):
            upgrade_rank(db, "u1", 3, "same")

        db.commit()

    verify(engine, 2, 2_400_000, 2)


def test_upgrade_rollback(engine):
    prepare(engine, 1, 800_000)

    with Session(engine) as db:
        upgrade_rank(db, "u1", 2, "rollback")
        db.rollback()

    verify(engine, 1, 800_000, 1)


def test_invalid_configuration(engine):
    prepare(engine, 1, 800_000)

    with Session(engine) as db:
        config = db.get(NobilityRankConfig, 2)
        config.required_points = 1
        db.commit()

        with pytest.raises(
            ValueError, match="configuration unavailable"
        ):
            upgrade_rank(db, "u1", 2, "invalid")

        db.commit()

    verify(engine, 1, 800_000, 1)


def test_disabled_upgrade(engine, monkeypatch):
    prepare(engine, 1, 800_000)

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    with Session(engine) as db:
        with pytest.raises(
            ValueError, match="Nobility disabled"
        ):
            upgrade_rank(db, "u1", 2, "disabled")

        db.commit()

    verify(engine, 1, 800_000, 1)


@pytest.mark.parametrize("same_key", [True, False])
def test_concurrent_upgrade(engine, same_key):
    prepare(engine, 1, 800_000)

    barrier = Barrier(2)

    def worker(key):
        with Session(engine) as db:
            barrier.wait(timeout=10)

            try:
                result = upgrade_rank(
                    db, "u1", 2, key
                )
                db.commit()

                return (
                    "applied" if result["applied"]
                    else "duplicate"
                )

            except ValueError as error:
                db.rollback()
                assert str(error) == "Higher rank required"
                return "rejected"

    keys = (
        ["same", "same"] if same_key
        else ["first", "second"]
    )

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(worker, key)
            for key in keys
        ]

        results = [
            f.result(timeout=30)
            for f in futures
        ]

    expected = (
        "duplicate" if same_key else "rejected"
    )

    assert sorted(results) == sorted([
        "applied", expected
    ])

    verify(engine, 2, 0, 2)
