"""End-to-end nobility financial integrity tests."""

import pytest

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityPointLot,
    NobilityPointAllocation,
    NobilityPointsLedger,
    NobilityRefundEvent,
)
from backend.app.nobility_points import apply_points
from backend.app.nobility_engine import (
    activate_rank,
    upgrade_rank,
    renew_rank,
)
from backend.app.nobility_refunds import refund_points
from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine


def credit(db, key, amount, user="u1"):
    apply_points(db, user, amount, key, "test")
    db.commit()


def refund(db, lot, key, points=None, user="u1"):
    result = refund_points(
        db, user, lot, key, points=points
    )
    db.commit()
    return result


def verify_integrity(db, user="u1"):
    db.flush()

    member = db.get(
        NobilityMembership,
        user,
        populate_existing=True,
    )

    lots = db.scalars(
        select(NobilityPointLot)
        .where(NobilityPointLot.user_id == user)
    ).all()

    ledger = db.scalars(
        select(NobilityPointsLedger)
        .where(NobilityPointsLedger.user_id == user)
    ).all()

    ledger_map = {
        row.event_key: row for row in ledger
    }

    balance = member.points if member else 0

    assert balance >= 0

    assert balance == sum(
        lot.remaining_points for lot in lots
    )

    assert balance == sum(
        row.amount for row in ledger
    )

    allocations_by_spend = {}
    total_refunded = 0
    total_valid_spent = 0

    for lot in lots:
        source = ledger_map[lot.event_key]

        assert source.amount == lot.original_points
        assert source.amount > 0

        allocations = db.scalars(
            select(NobilityPointAllocation)
            .where(
                NobilityPointAllocation.lot_event_key
                == lot.event_key
            )
        ).all()

        events = db.scalars(
            select(NobilityRefundEvent)
            .where(
                NobilityRefundEvent.lot_event_key
                == lot.event_key
            )
        ).all()

        valid_spent = sum(
            row.amount - row.revoked_points
            for row in allocations
        )

        revoked_spent = sum(
            row.revoked_points for row in allocations
        )

        assert lot.original_points == (
            lot.remaining_points
            + valid_spent
            + lot.refunded_points
        )

        assert lot.refunded == (
            lot.refunded_points == lot.original_points
        )

        assert lot.refunded_points == sum(
            row.refunded_points for row in events
        )

        assert lot.refunded_points == (
            revoked_spent
            + sum(row.removed_balance for row in events)
        )

        total_refunded += lot.refunded_points
        total_valid_spent += valid_spent

        for row in allocations:
            assert 0 <= row.revoked_points <= row.amount

            spend = ledger_map[row.spend_event_key]

            assert spend.amount < 0
            assert spend.source != "purchase_refund"

            allocations_by_spend[row.spend_event_key] = (
                allocations_by_spend.get(
                    row.spend_event_key, 0
                ) + row.amount
            )

        for event in events:
            entry = ledger_map.get(event.refund_key)

            if event.removed_balance:
                assert entry is not None
                assert entry.amount == -event.removed_balance
                assert entry.source == "purchase_refund"
            else:
                assert entry is None

    for row in ledger:
        if row.amount < 0 and row.source != "purchase_refund":
            assert allocations_by_spend.get(
                row.event_key, 0
            ) == -row.amount

    total_credit = sum(
        row.amount for row in ledger if row.amount > 0
    )

    assert total_credit == sum(
        lot.original_points for lot in lots
    )

    assert total_credit == (
        balance + total_valid_spent + total_refunded
    )


def test_credit_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 204000)
        credit(db, "p2", 68000)
        credit(db, "p3", 136000)

        verify_integrity(db)


def test_activation_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 204000)
        credit(db, "p2", 204000)

        activate_rank(db, "u1", 1, "activate1")
        db.commit()

        verify_integrity(db)


def test_upgrade_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 1200000)

        activate_rank(db, "u1", 1, "activate1")
        db.commit()

        verify_integrity(db)

        upgrade_rank(db, "u1", 2, "upgrade1")
        db.commit()

        verify_integrity(db)


def test_renewal_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 400000)

        activate_rank(db, "u1", 1, "activate1")
        db.commit()

        credit(db, "p2", 200000)

        renew_rank(db, "u1", 1, "renew1")
        db.commit()

        renew_rank(db, "u1", 1, "renew2")
        db.commit()

        verify_integrity(db)


def test_multiple_partial_refunds_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 204000)

        refund(db, "p1", "r1", 50000)
        verify_integrity(db)

        refund(db, "p1", "r2", 70000)
        verify_integrity(db)

        refund(db, "p1", "r3")
        verify_integrity(db)


def test_spent_and_unused_refund_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 500000)

        activate_rank(db, "u1", 1, "activate1")
        db.commit()

        result = refund(db, "p1", "r1", 150000)

        assert result["removed_balance"] == 100000
        assert result["removed_spent"] == 50000

        verify_integrity(db)


def test_king_downgrade_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 3200000)

        activate_rank(db, "u1", 4, "activate1")
        db.commit()

        refund(db, "p1", "r1", 800000)
        verify_integrity(db)

        refund(db, "p1", "r2", 1600000)
        verify_integrity(db)

        refund(db, "p1", "r3")
        verify_integrity(db)

        member = db.get(NobilityMembership, "u1")

        assert member.rank == 0
        assert member.points == 0


def test_renewal_refund_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 3200000)

        activate_rank(db, "u1", 4, "activate1")
        db.commit()

        credit(db, "p2", 800000)

        renew_rank(db, "u1", 4, "renew1")
        db.commit()

        first = refund(db, "p2", "r1", 1)
        second = refund(db, "p2", "r2")

        assert first["removed_days"] == 30
        assert second["removed_days"] == 0

        verify_integrity(db)


def test_duplicate_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 204000)

        refund(db, "p1", "r1", 50000)

        result = refund(db, "p1", "r1", 50000)

        assert result["duplicate"]

        verify_integrity(db)


def test_rejected_refund_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 204000)

        refund(db, "p1", "r1", 100000)

        with pytest.raises(ValueError):
            refund_points(
                db, "u1", "p1", "r2",
                points=104001,
            )

        verify_integrity(db)


def test_rollback_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 500000)

        activate_rank(db, "u1", 1, "activate1")
        db.commit()

        refund_points(
            db, "u1", "p1", "r1",
            points=150000,
        )

        db.rollback()

        verify_integrity(db)

        member = db.get(NobilityMembership, "u1")

        assert member.rank == 1
        assert member.points == 100000


def test_account_isolation_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 204000, "u1")
        credit(db, "p2", 136000, "u2")

        refund(db, "p1", "r1", 102000)

        with pytest.raises(ValueError):
            refund_points(
                db, "u1", "p2", "r2",
                points=50000,
            )

        verify_integrity(db, "u1")
        verify_integrity(db, "u2")

        member = db.get(NobilityMembership, "u2")

        assert member.points == 136000


def test_new_purchase_after_refund_integrity(engine):
    with Session(engine) as db:
        credit(db, "p1", 400000)

        activate_rank(db, "u1", 1, "activate1")
        db.commit()

        refund(db, "p1", "r1")

        verify_integrity(db)

        credit(db, "p2", 800000)

        activate_rank(db, "u1", 2, "activate2")
        db.commit()

        verify_integrity(db)

        member = db.get(NobilityMembership, "u1")

        assert member.rank == 2
        assert member.points == 0
