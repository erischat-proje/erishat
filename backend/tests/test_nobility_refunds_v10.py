"""Nobility refund and downgrade security tests."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityPointLot,
    NobilityRefundEvent,
)
from backend.app.nobility_points import apply_points
from backend.app.nobility_engine import activate_rank
from backend.app.nobility_refunds import refund_points
from backend.app.nobility_funding import valid_membership_points
from backend.app.nobility_policy import has_privilege

from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine


def prepare_king(db):
    apply_points(db, "u1", 204000, "p1", "test")
    apply_points(db, "u1", 2996000, "p2", "test")

    activate_rank(db, "u1", 4, "king1")
    db.commit()


def test_king_downgrade(engine):
    with Session(engine) as db:
        prepare_king(db)

        member = db.get(NobilityMembership, "u1")
        expiry = member.expires_at

        result = refund_points(
            db, "u1", "p1", "refund1"
        )
        db.commit()

        assert result["rank_before"] == 4
        assert result["rank_after"] == 3
        assert member.rank == 3
        assert member.points == 0
        assert member.expires_at == expiry

        assert valid_membership_points(
            db, "u1"
        ) == 2996000


def test_unused_points_refund(engine):
    with Session(engine) as db:
        prepare_king(db)

        apply_points(
            db, "u1", 204000, "unused", "test"
        )
        db.commit()

        result = refund_points(
            db, "u1", "unused", "refund1"
        )
        db.commit()

        assert result["rank_after"] == 4
        assert result["removed_balance"] == 204000

        assert db.get(
            NobilityMembership, "u1"
        ).points == 0


def test_multiple_rank_downgrade(engine):
    with Session(engine) as db:
        prepare_king(db)

        result = refund_points(
            db, "u1", "p2", "refund1"
        )
        db.commit()

        assert result["rank_after"] == 0

        member = db.get(NobilityMembership, "u1")

        assert member.rank == 0
        assert member.started_at is None
        assert member.expires_at is None


def test_duplicate_refund(engine):
    with Session(engine) as db:
        prepare_king(db)

        assert refund_points(
            db, "u1", "p1", "refund1"
        )["applied"]

        assert refund_points(
            db, "u1", "p1", "refund1"
        )["duplicate"]

        db.commit()

        rows = db.scalars(
            select(NobilityRefundEvent)
        ).all()

        assert len(rows) == 1


def test_account_isolation(engine):
    with Session(engine) as db:
        prepare_king(db)

        with pytest.raises(ValueError):
            refund_points(
                db, "u2", "p1", "refund1"
            )

        assert not db.get(
            NobilityPointLot, "p1"
        ).refunded

        assert db.get(
            NobilityMembership, "u1"
        ).rank == 4


def test_refund_rollback(engine):
    with Session(engine) as db:
        prepare_king(db)

        refund_points(
            db, "u1", "p1", "refund1"
        )

        db.rollback()

        assert db.get(
            NobilityMembership, "u1"
        ).rank == 4

        assert not db.get(
            NobilityPointLot, "p1"
        ).refunded

        assert db.scalars(
            select(NobilityRefundEvent)
        ).all() == []


def test_privilege_revocation(engine):
    with Session(engine) as db:
        prepare_king(db)

        assert has_privilege(
            db, "u1", "super_kick"
        )

        refund_points(
            db, "u1", "p1", "refund1"
        )
        db.commit()

        assert not has_privilege(
            db, "u1", "super_kick"
        )

        assert not has_privilege(
            db, "u1", "super_avatar"
        )

        assert has_privilege(
            db, "u1", "region_background"
        )

        assert has_privilege(
            db, "u1", "badge"
        )


def test_refund_when_disabled(engine, monkeypatch):
    with Session(engine) as db:
        prepare_king(db)

        monkeypatch.setenv(
            "LIDYACHAT_NOBILITY_ENABLED", "false"
        )

        result = refund_points(
            db, "u1", "p1", "refund1"
        )
        db.commit()

        assert result["rank_after"] == 3


def concurrent_refunds(engine, requests):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    barrier = Barrier(len(requests))

    def worker(item):
        lot_key, refund_key = item

        with Session(engine) as db:
            barrier.wait(timeout=10)

            result = refund_points(
                db, "u1", lot_key, refund_key
            )

            db.commit()
            return result

    with ThreadPoolExecutor(
        max_workers=len(requests)
    ) as pool:
        futures = [
            pool.submit(worker, item)
            for item in requests
        ]

        return [
            f.result(timeout=30)
            for f in futures
        ]


def test_concurrent_duplicate_refund(engine):
    with Session(engine) as db:
        prepare_king(db)

    results = concurrent_refunds(engine, [
        ("p1", "refund1"),
        ("p1", "refund1"),
    ])

    assert sum(r["applied"] for r in results) == 1
    assert sum(r["duplicate"] for r in results) == 1

    with Session(engine) as db:
        assert db.get(
            NobilityMembership, "u1"
        ).rank == 3

        assert len(db.scalars(
            select(NobilityRefundEvent)
        ).all()) == 1


def test_concurrent_distinct_refunds(engine):
    with Session(engine) as db:
        prepare_king(db)

    results = concurrent_refunds(engine, [
        ("p1", "refund1"),
        ("p2", "refund2"),
    ])

    assert all(r["applied"] for r in results)

    with Session(engine) as db:
        member = db.get(
            NobilityMembership, "u1"
        )

        assert member.rank == 0
        assert member.points == 0

        assert len(db.scalars(
            select(NobilityRefundEvent)
        ).all()) == 2


def test_concurrent_unused_refund(engine):
    with Session(engine) as db:
        apply_points(
            db, "u1", 204000, "p1", "test"
        )
        db.commit()

    results = concurrent_refunds(engine, [
        ("p1", "refund1"),
        ("p1", "refund2"),
    ])

    assert sum(r["applied"] for r in results) == 1

    with Session(engine) as db:
        assert db.get(
            NobilityMembership, "u1"
        ).points == 0

        assert len(db.scalars(
            select(NobilityRefundEvent)
        ).all()) == 1


def test_refund_key_conflict(engine):
    with Session(engine) as db:
        prepare_king(db)

        refund_points(
            db, "u1", "p1", "refund1"
        )
        db.commit()

        with pytest.raises(ValueError):
            refund_points(
                db, "u1", "p2", "refund1"
            )

        assert not db.get(
            NobilityPointLot, "p2"
        ).refunded

        assert db.get(
            NobilityMembership, "u1"
        ).rank == 3


def test_concurrent_refund_and_upgrade(engine):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from backend.app.nobility_engine import upgrade_rank

    with Session(engine) as db:
        apply_points(
            db, "u1", 400000, "initial", "test"
        )

        activate_rank(
            db, "u1", 1, "knight1"
        )

        apply_points(
            db, "u1", 3200000, "upgradefund", "test"
        )

        db.commit()

    barrier = Barrier(2)

    def upgrade_worker():
        with Session(engine) as db:
            barrier.wait(timeout=10)

            try:
                upgrade_rank(
                    db, "u1", 4, "upgrade1"
                )
                db.commit()
                return True

            except ValueError as exc:
                db.rollback()

                if str(exc) != "Insufficient points":
                    raise

                return False

    def refund_worker():
        with Session(engine) as db:
            barrier.wait(timeout=10)

            result = refund_points(
                db, "u1",
                "upgradefund", "refund1"
            )

            db.commit()
            return result

    with ThreadPoolExecutor(max_workers=2) as pool:
        upgrade = pool.submit(upgrade_worker)
        refund = pool.submit(refund_worker)

        upgraded = upgrade.result(timeout=30)
        refunded = refund.result(timeout=30)

    assert refunded["applied"]

    with Session(engine) as db:
        member = db.get(
            NobilityMembership, "u1"
        )

        lot = db.get(
            NobilityPointLot, "upgradefund"
        )

        assert member.points == 0
        assert lot.refunded
        assert lot.remaining_points == 0

        if upgraded:
            assert member.rank == 0
        else:
            assert member.rank == 1

        assert not has_privilege(
            db, "u1", "super_kick"
        )


def test_old_membership_refund(engine):
    from backend.app.nobility_engine import upgrade_rank

    with Session(engine) as db:
        apply_points(
            db, "u1", 400000, "oldfund", "test"
        )

        activate_rank(
            db, "u1", 1, "knight1"
        )

        apply_points(
            db, "u1", 3200000, "newfund", "test"
        )

        upgrade_rank(
            db, "u1", 4, "king1"
        )

        db.commit()

        result = refund_points(
            db, "u1", "oldfund", "refund1"
        )

        db.commit()

        assert result["rank_after"] == 4

        assert valid_membership_points(
            db, "u1"
        ) == 3200000

        assert has_privilege(
            db, "u1", "super_kick"
        )


def test_spent_refund_ledger_key_conflict(engine):
    with Session(engine) as db:
        prepare_king(db)

        with pytest.raises(
            ValueError, match="Refund ledger key conflict"
        ):
            refund_points(
                db, "u1", "p1", "p2"
            )

        assert not db.get(
            NobilityPointLot, "p1"
        ).refunded

        assert db.get(
            NobilityMembership, "u1"
        ).rank == 4


def test_unused_refund_ledger_key_conflict(engine):
    with Session(engine) as db:
        apply_points(
            db, "u1", 204000, "p1", "test"
        )
        db.commit()

        with pytest.raises(
            ValueError, match="Refund ledger key conflict"
        ):
            refund_points(
                db, "u1", "p1", "p1"
            )

        assert db.get(
            NobilityMembership, "u1"
        ).points == 204000

        assert not db.get(
            NobilityPointLot, "p1"
        ).refunded


def test_duplicate_refund_conflicting_key(engine):
    with Session(engine) as db:
        prepare_king(db)

        refund_points(
            db, "u1", "p1", "refund1"
        )

        refund_points(
            db, "u1", "p2", "refund2"
        )

        db.commit()

        with pytest.raises(
            ValueError, match="Refund key conflict"
        ):
            refund_points(
                db, "u1", "p1", "refund2"
            )

        assert len(db.scalars(
            select(NobilityRefundEvent)
        ).all()) == 2


def test_cross_account_ledger_key_conflict(engine):
    with Session(engine) as db:
        prepare_king(db)

        apply_points(
            db, "u2", 100000, "otheruser", "test"
        )
        db.commit()

        with pytest.raises(
            ValueError, match="Refund ledger key conflict"
        ):
            refund_points(
                db, "u1", "p1", "otheruser"
            )

        assert db.get(
            NobilityMembership, "u1"
        ).rank == 4

        assert db.get(
            NobilityMembership, "u2"
        ).points == 100000

        assert not db.get(
            NobilityPointLot, "p1"
        ).refunded


def test_refund_key_cannot_be_reused_as_credit(engine):
    with Session(engine) as db:
        prepare_king(db)

        refund_points(
            db, "u1", "p1", "sharedkey"
        )
        db.commit()

        with pytest.raises(
            ValueError, match="Event key conflict"
        ):
            apply_points(
                db, "u2", 100000,
                "sharedkey", "test"
            )

        assert db.get(
            NobilityMembership, "u2"
        ) is None


def test_concurrent_credit_and_refund_key(engine):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    with Session(engine) as db:
        prepare_king(db)

    barrier = Barrier(2)

    def worker(operation):
        with Session(engine) as db:
            barrier.wait(timeout=10)

            try:
                if operation == "credit":
                    apply_points(
                        db, "u2", 100000,
                        "sharedkey", "test"
                    )
                else:
                    refund_points(
                        db, "u1", "p1",
                        "sharedkey"
                    )

                db.commit()
                return operation

            except ValueError as exc:
                db.rollback()

                assert str(exc) in (
                    "Event key conflict",
                    "Refund ledger key conflict",
                )

                return "rejected"

    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(worker, "credit")
        b = pool.submit(worker, "refund")

        results = [
            a.result(timeout=30),
            b.result(timeout=30),
        ]

    assert results.count("rejected") == 1

    with Session(engine) as db:
        lot = db.get(NobilityPointLot, "p1")
        king = db.get(NobilityMembership, "u1")
        other = db.get(NobilityMembership, "u2")

        if "refund" in results:
            assert lot.refunded
            assert king.rank == 3
            assert other is None
        else:
            assert not lot.refunded
            assert king.rank == 4
            assert other.points == 100000
