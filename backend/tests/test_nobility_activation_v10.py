"""Nobility activation transactional security tests."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from datetime import datetime, timezone, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.nobility_config import RANK_RULES
from backend.app.nobility_engine import activate_rank
from backend.app.nobility_points import apply_points
from backend.app.nobility_policy import effective_rank, utc
from backend.app.nobility_models import (
    NobilityMembership,
    NobilityPointsLedger,
    NobilityRankConfig,
    NobilityAuditLog,
)

from test_nobility_postgres_v1 import scoped_db


@pytest.fixture
def engine(scoped_db):
    Base.metadata.create_all(
        scoped_db,
        tables=[
            NobilityRankConfig.__table__,
            NobilityAuditLog.__table__,
        ],
    )

    with Session(scoped_db) as db:
        for rank, rule in RANK_RULES.items():
            db.add(NobilityRankConfig(
                rank=rank,
                required_points=rule.required_points,
                renewal_points=rule.renewal_points,
                duration_days=rule.duration_days,
                enabled=True,
            ))
        db.commit()

    return scoped_db


def fund(engine, amount):
    with Session(engine) as db:
        apply_points(
            db, "u1", amount,
            "test-funding", "test"
        )
        db.commit()


def verify(engine, rank, points, audits):
    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")

        assert member.rank == rank
        assert member.points == points

        logs = db.scalars(
            select(NobilityAuditLog)
        ).all()

        assert len(logs) == audits

        ledger = db.scalars(
            select(NobilityPointsLedger)
            .where(
                NobilityPointsLedger.user_id == "u1"
            )
        ).all()

        assert sum(row.amount for row in ledger) == points


@pytest.mark.parametrize("rank", [1, 2, 3, 4])
def test_activation_prices(engine, rank):
    rule = RANK_RULES[rank]
    fund(engine, rule.required_points + 100)

    with Session(engine) as db:
        result = activate_rank(
            db, "u1", rank, "activation-1"
        )
        db.commit()

        assert result["applied"] is True

        member = db.get(NobilityMembership, "u1")

        assert effective_rank(member) == rank
        assert (
            utc(member.expires_at)
            - utc(member.started_at)
        ) == timedelta(days=30)

    verify(engine, rank, 100, 1)


def test_insufficient_balance(engine):
    fund(engine, 399_999)

    with Session(engine) as db:
        with pytest.raises(
            ValueError, match="Insufficient points"
        ):
            activate_rank(db, "u1", 1, "low")

        db.commit()

    verify(engine, 0, 399_999, 0)


def test_duplicate_request(engine):
    fund(engine, 800_000)

    with Session(engine) as db:
        first = activate_rank(db, "u1", 1, "same")
        db.commit()

        second = activate_rank(db, "u1", 1, "same")
        db.commit()

        assert first["applied"] is True
        assert second["duplicate"] is True

    verify(engine, 1, 400_000, 1)


def test_request_conflict(engine):
    fund(engine, 1_200_000)

    with Session(engine) as db:
        activate_rank(db, "u1", 1, "same")
        db.commit()

        with pytest.raises(
            ValueError, match="Request conflict"
        ):
            activate_rank(db, "u1", 2, "same")

        db.commit()

    verify(engine, 1, 800_000, 1)


def test_active_rank_rejected(engine):
    fund(engine, 800_000)

    with Session(engine) as db:
        activate_rank(db, "u1", 1, "first")
        db.commit()

        with pytest.raises(
            ValueError, match="Active membership"
        ):
            activate_rank(db, "u1", 1, "second")

        db.commit()

    verify(engine, 1, 400_000, 1)


def test_expired_rank_full_price(engine):
    fund(engine, 800_000)

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        now = datetime.now(timezone.utc)

        member.rank = 1
        member.started_at = now - timedelta(days=31)
        member.expires_at = now - timedelta(days=1)

        db.commit()

        activate_rank(db, "u1", 1, "expired")
        db.commit()

    verify(engine, 1, 400_000, 1)


def test_disabled_system(engine, monkeypatch):
    fund(engine, 400_000)

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    with Session(engine) as db:
        with pytest.raises(
            ValueError, match="Nobility disabled"
        ):
            activate_rank(db, "u1", 1, "disabled")

        db.commit()

    verify(engine, 0, 400_000, 0)


def test_invalid_configuration(engine):
    fund(engine, 400_000)

    with Session(engine) as db:
        config = db.get(NobilityRankConfig, 1)
        config.required_points = 1
        db.commit()

        with pytest.raises(
            ValueError, match="configuration unavailable"
        ):
            activate_rank(db, "u1", 1, "invalid")

        db.commit()

    verify(engine, 0, 400_000, 0)


def test_outer_rollback(engine):
    fund(engine, 400_000)

    with Session(engine) as db:
        activate_rank(db, "u1", 1, "rollback")
        db.rollback()

    verify(engine, 0, 400_000, 0)


@pytest.mark.parametrize("same_key", [True, False])
def test_concurrent_activation(engine, same_key):
    fund(engine, 400_000)

    barrier = Barrier(2)

    def worker(key):
        with Session(engine) as db:
            barrier.wait(timeout=10)

            try:
                result = activate_rank(
                    db, "u1", 1, key
                )
                db.commit()

                return (
                    "applied" if result["applied"]
                    else "duplicate"
                )

            except ValueError as error:
                db.rollback()
                assert str(error) == "Active membership exists"
                return "rejected"

    keys = ["race", "race"] if same_key else ["a", "b"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(worker, key)
            for key in keys
        ]
        results = [
            future.result(timeout=30)
            for future in futures
        ]

    expected = (
        "duplicate" if same_key else "rejected"
    )

    assert sorted(results) == sorted([
        "applied", expected
    ])

    verify(engine, 1, 0, 1)
