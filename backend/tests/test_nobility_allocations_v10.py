"""Nobility point provenance security tests."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityPointLot,
    NobilityPointAllocation,
)

from backend.app.nobility_points import apply_points

from backend.tests.test_nobility_postgres_v1 import scoped_db


def test_credit_creates_lot(scoped_db):
    with Session(scoped_db) as db:
        assert apply_points(
            db, "u1", 204000, "purchase1", "test"
        )
        db.commit()

        lot = db.get(NobilityPointLot, "purchase1")

        assert lot.user_id == "u1"
        assert lot.original_points == 204000
        assert lot.remaining_points == 204000
        assert not lot.refunded


def test_fifo_multiple_purchases(scoped_db):
    with Session(scoped_db) as db:
        for key in ("p1", "p2", "p3"):
            apply_points(
                db, "u1", 204000, key, "test"
            )

        apply_points(
            db, "u1", -400000,
            "activation1", "rank_activation"
        )

        db.commit()

        assert db.get(
            NobilityPointLot, "p1"
        ).remaining_points == 0

        assert db.get(
            NobilityPointLot, "p2"
        ).remaining_points == 8000

        assert db.get(
            NobilityPointLot, "p3"
        ).remaining_points == 204000

        rows = db.scalars(
            select(NobilityPointAllocation)
            .where(
                NobilityPointAllocation.spend_event_key
                == "activation1"
            )
        ).all()

        assert len(rows) == 2
        assert sum(r.amount for r in rows) == 400000

        assert db.get(
            NobilityMembership, "u1"
        ).points == 212000


def test_duplicate_credit(scoped_db):
    with Session(scoped_db) as db:
        assert apply_points(
            db, "u1", 100, "p1", "test"
        )

        assert not apply_points(
            db, "u1", 100, "p1", "test"
        )

        db.commit()

        assert db.get(
            NobilityPointLot, "p1"
        ).remaining_points == 100


def test_duplicate_spend(scoped_db):
    with Session(scoped_db) as db:
        apply_points(
            db, "u1", 100, "p1", "test"
        )

        assert apply_points(
            db, "u1", -60, "s1", "test"
        )

        assert not apply_points(
            db, "u1", -60, "s1", "test"
        )

        db.commit()

        assert db.get(
            NobilityPointLot, "p1"
        ).remaining_points == 40

        rows = db.scalars(
            select(NobilityPointAllocation)
        ).all()

        assert len(rows) == 1
        assert rows[0].amount == 60


def test_account_isolation(scoped_db):
    with Session(scoped_db) as db:
        apply_points(
            db, "u1", 100, "p1", "test"
        )

        apply_points(
            db, "u2", 200, "p2", "test"
        )

        with pytest.raises(ValueError):
            apply_points(
                db, "u1", -150, "s1", "test"
            )

        db.commit()

        assert db.get(
            NobilityPointLot, "p1"
        ).remaining_points == 100

        assert db.get(
            NobilityPointLot, "p2"
        ).remaining_points == 200


def test_rollback_preserves_sources(scoped_db):
    with Session(scoped_db) as db:
        apply_points(
            db, "u1", 100, "p1", "test"
        )
        db.commit()

        apply_points(
            db, "u1", -80, "s1", "test"
        )

        db.rollback()

        assert db.get(
            NobilityPointLot, "p1"
        ).remaining_points == 100

        assert db.get(
            NobilityMembership, "u1"
        ).points == 100

        assert db.scalars(
            select(NobilityPointAllocation)
        ).all() == []
