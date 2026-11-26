"""Concurrent partial nobility refund tests."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityPointLot,
    NobilityRefundEvent,
    NobilityAuditLog,
)
from backend.app.nobility_points import apply_points
from backend.app.nobility_engine import (
    activate_rank,
    renew_rank,
)
from backend.app.nobility_refunds import refund_points
from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine


def credit(db, amount=204000, key="purchase1"):
    apply_points(db, "u1", amount, key, "test")
    db.commit()


def concurrent_refunds(engine, requests):
    barrier = Barrier(len(requests))

    def worker(request):
        lot, key, points = request

        with Session(engine) as db:
            barrier.wait(timeout=15)

            try:
                result = refund_points(
                    db, "u1", lot, key, points=points
                )

                db.commit()
                return result

            except ValueError as exc:
                db.rollback()

                return {
                    "applied": False,
                    "duplicate": False,
                    "error": str(exc),
                }

    with ThreadPoolExecutor(
        max_workers=len(requests)
    ) as pool:
        futures = [
            pool.submit(worker, request)
            for request in requests
        ]

        return [
            future.result(timeout=30)
            for future in futures
        ]


def verify(engine, balance, refunded, count):
    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        lot = db.get(NobilityPointLot, "purchase1")

        events = db.scalars(
            select(NobilityRefundEvent)
        ).all()

        audits = db.scalars(
            select(NobilityAuditLog)
            .where(
                NobilityAuditLog.action
                == "purchase_refund"
            )
        ).all()

        assert member.points == balance
        assert lot.refunded_points == refunded
        assert len(events) == count
        assert len(audits) == count

        assert sum(
            row.refunded_points for row in events
        ) == refunded


def test_concurrent_same_partial_refund(engine):
    with Session(engine) as db:
        credit(db)

    results = concurrent_refunds(engine, [
        ("purchase1", "refund1", 50000),
        ("purchase1", "refund1", 50000),
    ])

    assert sum(r["applied"] for r in results) == 1
    assert sum(r["duplicate"] for r in results) == 1

    verify(engine, 154000, 50000, 1)


def test_concurrent_distinct_partial_refunds(engine):
    with Session(engine) as db:
        credit(db)

    results = concurrent_refunds(engine, [
        ("purchase1", "refund1", 50000),
        ("purchase1", "refund2", 70000),
    ])

    assert sum(r["applied"] for r in results) == 2

    verify(engine, 84000, 120000, 2)


def test_concurrent_over_refund_blocked(engine):
    with Session(engine) as db:
        credit(db)

    results = concurrent_refunds(engine, [
        ("purchase1", "refund1", 150000),
        ("purchase1", "refund2", 150000),
    ])

    assert sum(r["applied"] for r in results) == 1

    errors = [
        r["error"] for r in results if "error" in r
    ]

    assert errors == [
        "Refund exceeds available points"
    ]

    verify(engine, 54000, 150000, 1)


def test_concurrent_same_key_different_amount(engine):
    with Session(engine) as db:
        credit(db)

    results = concurrent_refunds(engine, [
        ("purchase1", "refund1", 50000),
        ("purchase1", "refund1", 70000),
    ])

    applied = [
        r for r in results if r["applied"]
    ]

    assert len(applied) == 1

    errors = [
        r["error"] for r in results if "error" in r
    ]

    assert errors == ["Refund amount conflict"]

    amount = applied[0]["refunded_points"]

    verify(engine, 204000 - amount, amount, 1)


def test_concurrent_full_and_partial_refund(engine):
    with Session(engine) as db:
        credit(db)

    results = concurrent_refunds(engine, [
        ("purchase1", "refund1", None),
        ("purchase1", "refund2", 50000),
    ])

    applied = [
        r for r in results if r["applied"]
    ]

    assert len(applied) in (1, 2)

    assert sum(
        r["refunded_points"] for r in applied
    ) == 204000

    if len(applied) == 1:
        errors = [
            r["error"] for r in results if "error" in r
        ]

        assert errors == [
            "Point source fully refunded"
        ]

    verify(engine, 0, 204000, len(applied))


def test_concurrent_king_downgrade(engine):
    with Session(engine) as db:
        credit(db, 3200000)

        activate_rank(db, "u1", 4, "king1")
        db.commit()

        original = db.get(
            NobilityMembership, "u1"
        ).expires_at

    results = concurrent_refunds(engine, [
        ("purchase1", "refund1", 800000),
        ("purchase1", "refund2", 800000),
    ])

    assert sum(r["applied"] for r in results) == 2

    verify(engine, 0, 1600000, 2)

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")

        assert member.rank == 3
        assert member.expires_at == original


def test_concurrent_renewal_duration_removed_once(engine):
    with Session(engine) as db:
        credit(db, 3200000)

        activate_rank(db, "u1", 4, "king1")
        db.commit()

        original = db.get(
            NobilityMembership, "u1"
        ).expires_at

        credit(db, 800000, "renewal1")

        renew_rank(db, "u1", 4, "renew1")
        db.commit()

    results = concurrent_refunds(engine, [
        ("renewal1", "refund1", 100000),
        ("renewal1", "refund2", 200000),
    ])

    assert sum(r["applied"] for r in results) == 2

    assert sum(
        r["removed_days"] for r in results
    ) == 30

    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        lot = db.get(NobilityPointLot, "renewal1")

        assert member.rank == 4
        assert member.points == 0
        assert member.expires_at == original
        assert lot.refunded_points == 300000
