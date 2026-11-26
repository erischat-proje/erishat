"""PostgreSQL partial refund allocation tests."""

import pytest

from datetime import timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityPointLot,
    NobilityPointAllocation,
)
from backend.app.nobility_points import apply_points
from backend.app.nobility_partial_allocations import (
    distribute_refund,
)
from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine


def credit(db, amount=204000):
    apply_points(
        db, "u1", amount, "purchase1", "test"
    )
    db.commit()


def allocation(db, key):
    return db.get(
        NobilityPointAllocation,
        ("purchase1", key),
    )


def test_unused_points_partial_refund(engine):
    with Session(engine) as db:
        credit(db)

        result = distribute_refund(
            db, "u1", "purchase1", 102000
        )

        lot = db.get(NobilityPointLot, "purchase1")

        assert result["removed_balance"] == 102000
        assert result["removed_spent"] == 0
        assert lot.remaining_points == 102000
        assert lot.refunded_points == 102000
        assert not lot.refunded

        db.rollback()


def test_unused_points_removed_first(engine):
    with Session(engine) as db:
        credit(db)

        apply_points(
            db, "u1", -150000, "spend1", "test"
        )
        db.commit()

        result = distribute_refund(
            db, "u1", "purchase1", 102000
        )

        assert result["removed_balance"] == 54000
        assert result["removed_spent"] == 48000

        row = allocation(db, "spend1")

        assert row.amount == 150000
        assert row.revoked_points == 48000

        db.rollback()


def test_newest_spending_revoked_first(engine):
    with Session(engine) as db:
        credit(db)

        apply_points(
            db, "u1", -100000, "spend1", "test"
        )
        apply_points(
            db, "u1", -104000, "spend2", "test"
        )

        first = allocation(db, "spend1")
        second = allocation(db, "spend2")

        first.created_at = (
            second.created_at - timedelta(seconds=1)
        )

        db.commit()

        result = distribute_refund(
            db, "u1", "purchase1", 50000
        )

        assert result["removed_balance"] == 0
        assert result["removed_spent"] == 50000

        assert allocation(
            db, "spend1"
        ).revoked_points == 0

        assert allocation(
            db, "spend2"
        ).revoked_points == 50000

        db.rollback()


def test_multiple_partial_refunds(engine):
    with Session(engine) as db:
        credit(db)

        distribute_refund(
            db, "u1", "purchase1", 50000
        )

        result = distribute_refund(
            db, "u1", "purchase1", 70000
        )

        lot = db.get(NobilityPointLot, "purchase1")

        assert result["total_refunded"] == 120000
        assert lot.remaining_points == 84000
        assert not lot.refunded

        db.rollback()


def test_partial_then_full_refund(engine):
    with Session(engine) as db:
        credit(db)

        distribute_refund(
            db, "u1", "purchase1", 100000
        )

        result = distribute_refund(
            db, "u1", "purchase1", 104000
        )

        lot = db.get(NobilityPointLot, "purchase1")

        assert result["fully_refunded"]
        assert lot.refunded
        assert lot.refunded_points == 204000
        assert lot.remaining_points == 0

        db.rollback()


def test_refund_cannot_exceed_remaining(engine):
    with Session(engine) as db:
        credit(db)

        distribute_refund(
            db, "u1", "purchase1", 100000
        )

        with pytest.raises(
            ValueError,
            match="Refund exceeds available points",
        ):
            distribute_refund(
                db, "u1", "purchase1", 104001
            )

        lot = db.get(NobilityPointLot, "purchase1")

        assert lot.refunded_points == 100000
        assert lot.remaining_points == 104000

        db.rollback()


def test_fully_refunded_source_rejected(engine):
    with Session(engine) as db:
        credit(db)

        distribute_refund(
            db, "u1", "purchase1", 204000
        )

        with pytest.raises(
            ValueError,
            match="Point source fully refunded",
        ):
            distribute_refund(
                db, "u1", "purchase1", 1
            )

        db.rollback()


def test_cross_account_refund_rejected(engine):
    with Session(engine) as db:
        credit(db)

        with pytest.raises(
            ValueError,
            match="Point source not found",
        ):
            distribute_refund(
                db, "u2", "purchase1", 100000
            )

        lot = db.get(NobilityPointLot, "purchase1")

        assert lot.remaining_points == 204000
        assert lot.refunded_points == 0


@pytest.mark.parametrize(
    "amount",
    [0, -1, True, 1.5, "100000", None],
)
def test_invalid_refund_amount(engine, amount):
    with Session(engine) as db:
        credit(db)

        with pytest.raises(
            ValueError,
            match="Invalid refund amount",
        ):
            distribute_refund(
                db, "u1", "purchase1", amount
            )

        lot = db.get(NobilityPointLot, "purchase1")

        assert lot.refunded_points == 0


def test_partial_refund_rollback(engine):
    with Session(engine) as db:
        credit(db)

        apply_points(
            db, "u1", -150000, "spend1", "test"
        )
        db.commit()

        distribute_refund(
            db, "u1", "purchase1", 102000
        )

        db.rollback()

        lot = db.get(NobilityPointLot, "purchase1")

        assert lot.remaining_points == 54000
        assert lot.refunded_points == 0

        assert allocation(
            db, "spend1"
        ).revoked_points == 0
