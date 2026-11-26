"""Partial refund membership funding tests."""

from sqlalchemy.orm import Session

from backend.app.nobility_points import apply_points
from backend.app.nobility_engine import activate_rank
from backend.app.nobility_funding import (
    valid_membership_points,
)
from backend.app.nobility_partial_allocations import (
    distribute_refund,
)
from backend.app.nobility_refund_policy import (
    rank_after_refund,
)
from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine


def prepare(db, amount=3200000):
    apply_points(
        db, "u1", amount, "purchase1", "test"
    )

    activate_rank(db, "u1", 4, "king1")
    db.commit()


def test_partial_refund_reduces_valid_funding(engine):
    with Session(engine) as db:
        prepare(db)

        assert valid_membership_points(
            db, "u1"
        ) == 3200000

        distribute_refund(
            db, "u1", "purchase1", 102000
        )

        assert valid_membership_points(
            db, "u1"
        ) == 3098000

        db.rollback()


def test_partial_refund_king_to_duke(engine):
    with Session(engine) as db:
        prepare(db)

        distribute_refund(
            db, "u1", "purchase1", 102000
        )

        valid = valid_membership_points(db, "u1")

        assert rank_after_refund(4, valid) == 3

        db.rollback()


def test_partial_refund_king_to_count(engine):
    with Session(engine) as db:
        prepare(db)

        distribute_refund(
            db, "u1", "purchase1", 2400000
        )

        valid = valid_membership_points(db, "u1")

        assert valid == 800000
        assert rank_after_refund(4, valid) == 2

        db.rollback()


def test_partial_refund_king_to_knight(engine):
    with Session(engine) as db:
        prepare(db)

        distribute_refund(
            db, "u1", "purchase1", 2800000
        )

        valid = valid_membership_points(db, "u1")

        assert valid == 400000
        assert rank_after_refund(4, valid) == 1

        db.rollback()


def test_partial_refund_removes_all_ranks(engine):
    with Session(engine) as db:
        prepare(db)

        distribute_refund(
            db, "u1", "purchase1", 2800001
        )

        valid = valid_membership_points(db, "u1")

        assert valid == 399999
        assert rank_after_refund(4, valid) == 0

        db.rollback()


def test_unused_refund_preserves_king(engine):
    with Session(engine) as db:
        prepare(db, 3404000)

        result = distribute_refund(
            db, "u1", "purchase1", 204000
        )

        assert result["removed_spent"] == 0

        valid = valid_membership_points(db, "u1")

        assert valid == 3200000
        assert rank_after_refund(4, valid) == 4

        db.rollback()


def test_multiple_refunds_reduce_funding(engine):
    with Session(engine) as db:
        prepare(db)

        distribute_refund(
            db, "u1", "purchase1", 800000
        )

        distribute_refund(
            db, "u1", "purchase1", 800000
        )

        valid = valid_membership_points(db, "u1")

        assert valid == 1600000
        assert rank_after_refund(4, valid) == 3

        db.rollback()


def test_full_refund_removes_valid_funding(engine):
    with Session(engine) as db:
        prepare(db)

        distribute_refund(
            db, "u1", "purchase1", 3200000
        )

        assert valid_membership_points(
            db, "u1"
        ) == 0

        db.rollback()


def test_funding_restored_after_rollback(engine):
    with Session(engine) as db:
        prepare(db)

        distribute_refund(
            db, "u1", "purchase1", 102000
        )

        db.rollback()

        assert valid_membership_points(
            db, "u1"
        ) == 3200000
