"""Partial refund renewal funding tests."""

from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityRenewalFunding,
)
from backend.app.nobility_points import apply_points
from backend.app.nobility_engine import (
    activate_rank,
    renew_rank,
)
from backend.app.nobility_partial_allocations import (
    distribute_refund,
)
from backend.app.nobility_renewal_funding import (
    revoke_invalid_renewals,
)
from backend.app.nobility_funding import (
    valid_membership_points,
)
from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine


def prepare(db):
    apply_points(
        db, "u1", 3200000, "initial", "test"
    )
    activate_rank(db, "u1", 4, "king1")
    db.commit()

    return db.get(
        NobilityMembership, "u1"
    ).expires_at


def renew(db, key="renewal1", request="renew1",
          amount=800000):
    apply_points(
        db, "u1", amount, key, "test"
    )
    renew_rank(db, "u1", 4, request)
    db.commit()


def revoke(db):
    return revoke_invalid_renewals(
        db, "u1", datetime.now(timezone.utc)
    )


def test_partial_renewal_refund_removes_30_days(engine):
    with Session(engine) as db:
        original = prepare(db)
        renew(db)

        distribute_refund(
            db, "u1", "renewal1", 100000
        )

        assert revoke(db) == 30

        member = db.get(NobilityMembership, "u1")

        assert member.expires_at == original
        assert member.rank == 4
        assert valid_membership_points(db, "u1") == 3200000

        db.rollback()


def test_one_point_invalidates_renewal(engine):
    with Session(engine) as db:
        original = prepare(db)
        renew(db)

        distribute_refund(
            db, "u1", "renewal1", 1
        )

        assert revoke(db) == 30

        member = db.get(NobilityMembership, "u1")

        assert member.expires_at == original
        assert member.rank == 4

        db.rollback()


def test_multiple_refunds_remove_duration_once(engine):
    with Session(engine) as db:
        original = prepare(db)
        renew(db)

        distribute_refund(
            db, "u1", "renewal1", 100000
        )

        assert revoke(db) == 30

        distribute_refund(
            db, "u1", "renewal1", 200000
        )

        assert revoke(db) == 0

        member = db.get(NobilityMembership, "u1")

        assert member.expires_at == original

        db.rollback()


def test_unused_points_preserve_renewal(engine):
    with Session(engine) as db:
        original = prepare(db)
        renew(db, amount=1000000)

        distribute_refund(
            db, "u1", "renewal1", 200000
        )

        assert revoke(db) == 0

        member = db.get(NobilityMembership, "u1")

        assert member.expires_at == (
            original + timedelta(days=30)
        )

        db.rollback()


def test_two_renewals_independent_refunds(engine):
    with Session(engine) as db:
        original = prepare(db)

        renew(db, "renewal1", "renew1")
        renew(db, "renewal2", "renew2")

        distribute_refund(
            db, "u1", "renewal2", 100000
        )

        assert revoke(db) == 30

        member = db.get(NobilityMembership, "u1")

        assert member.expires_at == (
            original + timedelta(days=30)
        )

        distribute_refund(
            db, "u1", "renewal1", 100000
        )

        assert revoke(db) == 30
        assert member.expires_at == original

        db.rollback()


def test_partial_renewal_refund_rollback(engine):
    with Session(engine) as db:
        original = prepare(db)
        renew(db)

        distribute_refund(
            db, "u1", "renewal1", 100000
        )

        assert revoke(db) == 30

        db.rollback()

        member = db.get(NobilityMembership, "u1")

        assert member.expires_at == (
            original + timedelta(days=30)
        )

        funding = db.get(
            NobilityRenewalFunding,
            "nobility:renew:u1:renew1",
        )

        assert funding is not None
        assert not funding.revoked
        assert funding.revoked_at is None


def test_partial_refund_can_end_membership(engine):
    with Session(engine) as db:
        prepare(db)
        renew(db)

        member = db.get(NobilityMembership, "u1")

        member.started_at -= timedelta(days=40)
        member.expires_at -= timedelta(days=40)

        db.commit()

        distribute_refund(
            db, "u1", "renewal1", 100000
        )

        assert revoke(db) == 30

        assert member.rank == 0
        assert member.started_at is None
        assert member.expires_at is None

        db.rollback()
