"""Integrated partial refund security tests."""

import pytest

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityPointLot,
    NobilityRefundEvent,
    NobilityPointsLedger,
)
from backend.app.nobility_points import apply_points
from backend.app.nobility_engine import activate_rank
from backend.app.nobility_refunds import refund_points
from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine


def credit(db, amount=204000):
    apply_points(
        db, "u1", amount, "purchase1", "test"
    )
    db.commit()


def refund(db, key, points=None):
    return refund_points(
        db,
        "u1",
        "purchase1",
        key,
        points=points,
    )


def test_partial_refund_updates_balance(engine):
    with Session(engine) as db:
        credit(db)

        result = refund(db, "refund1", 102000)
        db.commit()

        member = db.get(NobilityMembership, "u1")
        lot = db.get(NobilityPointLot, "purchase1")
        event = db.get(NobilityRefundEvent, "refund1")
        ledger = db.get(NobilityPointsLedger, "refund1")

        assert result["applied"]
        assert member.points == 102000
        assert lot.remaining_points == 102000
        assert lot.refunded_points == 102000
        assert not lot.refunded
        assert event.refunded_points == 102000
        assert not event.is_full_request
        assert ledger.amount == -102000


def test_multiple_partial_refunds(engine):
    with Session(engine) as db:
        credit(db)

        refund(db, "refund1", 50000)
        refund(db, "refund2", 70000)
        db.commit()

        member = db.get(NobilityMembership, "u1")
        lot = db.get(NobilityPointLot, "purchase1")

        events = db.scalars(
            select(NobilityRefundEvent)
        ).all()

        assert member.points == 84000
        assert lot.refunded_points == 120000
        assert len(events) == 2
        assert sum(
            x.refunded_points for x in events
        ) == 120000


def test_partial_then_full_refund(engine):
    with Session(engine) as db:
        credit(db)

        refund(db, "refund1", 100000)

        result = refund(db, "refund2")
        db.commit()

        lot = db.get(NobilityPointLot, "purchase1")
        member = db.get(NobilityMembership, "u1")
        event = db.get(NobilityRefundEvent, "refund2")

        assert result["refunded_points"] == 104000
        assert result["fully_refunded"]
        assert lot.refunded_points == 204000
        assert lot.refunded
        assert member.points == 0
        assert event.is_full_request


def test_duplicate_partial_refund(engine):
    with Session(engine) as db:
        credit(db)

        refund(db, "refund1", 50000)
        db.commit()

        result = refund(db, "refund1", 50000)
        db.commit()

        assert result["duplicate"]
        assert not result["applied"]

        member = db.get(NobilityMembership, "u1")

        assert member.points == 154000


def test_duplicate_key_different_amount(engine):
    with Session(engine) as db:
        credit(db)

        refund(db, "refund1", 50000)
        db.commit()

        with pytest.raises(
            ValueError,
            match="Refund amount conflict",
        ):
            refund(db, "refund1", 60000)

        member = db.get(NobilityMembership, "u1")

        assert member.points == 154000


def test_duplicate_key_different_request_type(engine):
    with Session(engine) as db:
        credit(db)

        refund(db, "refund1", 50000)
        db.commit()

        with pytest.raises(
            ValueError,
            match="Refund request conflict",
        ):
            refund(db, "refund1")

        member = db.get(NobilityMembership, "u1")

        assert member.points == 154000


def test_partial_over_refund_rejected(engine):
    with Session(engine) as db:
        credit(db)

        refund(db, "refund1", 100000)
        db.commit()

        with pytest.raises(
            ValueError,
            match="Refund exceeds available points",
        ):
            refund(db, "refund2", 104001)

        member = db.get(NobilityMembership, "u1")
        lot = db.get(NobilityPointLot, "purchase1")

        assert member.points == 104000
        assert lot.refunded_points == 100000
        assert db.get(
            NobilityRefundEvent, "refund2"
        ) is None


def test_partial_refund_after_full_rejected(engine):
    with Session(engine) as db:
        credit(db)

        refund(db, "refund1")
        db.commit()

        with pytest.raises(
            ValueError,
            match="Point source fully refunded",
        ):
            refund(db, "refund2", 1)


def test_partial_refund_downgrades_king(engine):
    with Session(engine) as db:
        credit(db, 3200000)

        activate_rank(db, "u1", 4, "king1")
        db.commit()

        member = db.get(NobilityMembership, "u1")
        original_expiry = member.expires_at

        result = refund(db, "refund1", 102000)
        db.commit()

        assert result["rank_before"] == 4
        assert result["rank_after"] == 3
        assert member.rank == 3
        assert member.points == 0
        assert member.expires_at == original_expiry


def test_partial_refund_removes_membership(engine):
    with Session(engine) as db:
        credit(db, 3200000)

        activate_rank(db, "u1", 4, "king1")
        db.commit()

        refund(db, "refund1", 2800001)
        db.commit()

        member = db.get(NobilityMembership, "u1")

        assert member.rank == 0
        assert member.points == 0
        assert member.started_at is None
        assert member.expires_at is None


def test_partial_refund_rollback(engine):
    with Session(engine) as db:
        credit(db)

        refund(db, "refund1", 102000)

        db.rollback()

        member = db.get(NobilityMembership, "u1")
        lot = db.get(NobilityPointLot, "purchase1")

        assert member.points == 204000
        assert lot.remaining_points == 204000
        assert lot.refunded_points == 0

        assert db.get(
            NobilityRefundEvent, "refund1"
        ) is None

        assert db.get(
            NobilityPointsLedger, "refund1"
        ) is None


@pytest.mark.parametrize(
    "points",
    [0, -1, True, 1.5, "50000", 2**63],
)
def test_invalid_partial_amount(engine, points):
    with Session(engine) as db:
        credit(db)

        with pytest.raises(
            ValueError,
            match="Invalid refund amount",
        ):
            refund(db, "refund1", points)

        member = db.get(NobilityMembership, "u1")

        assert member.points == 204000
