"""Renewal refund security tests."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityRenewalFunding,
)
from backend.app.nobility_points import apply_points
from backend.app.nobility_engine import (
    activate_rank,
    renew_rank,
    upgrade_rank,
)
from backend.app.nobility_refunds import refund_points
from backend.app.nobility_policy import (
    effective_rank,
    has_privilege,
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


def renew(db, key, request):
    apply_points(
        db, "u1", 800000, key, "test"
    )
    renew_rank(db, "u1", 4, request)
    db.commit()


def test_renewal_refund_removes_30_days(engine):
    with Session(engine) as db:
        initial_expiry = prepare(db)
        renew(db, "renewfund", "renew1")

        result = refund_points(
            db, "u1", "renewfund", "refund1"
        )
        db.commit()

        member = db.get(
            NobilityMembership, "u1"
        )

        assert result["removed_days"] == 30
        assert member.rank == 4
        assert member.expires_at == initial_expiry
        assert member.points == 0


def test_duplicate_renewal_refund(engine):
    with Session(engine) as db:
        initial_expiry = prepare(db)
        renew(db, "renewfund", "renew1")

        refund_points(
            db, "u1", "renewfund", "refund1"
        )
        db.commit()

        result = refund_points(
            db, "u1", "renewfund", "refund2"
        )
        db.commit()

        assert result["duplicate"]

        assert db.get(
            NobilityMembership, "u1"
        ).expires_at == initial_expiry


def test_multiple_renewal_refunds(engine):
    with Session(engine) as db:
        initial_expiry = prepare(db)

        renew(db, "renewfund1", "renew1")
        renew(db, "renewfund2", "renew2")

        first = refund_points(
            db, "u1", "renewfund1", "refund1"
        )
        db.commit()

        member = db.get(
            NobilityMembership, "u1"
        )

        assert first["removed_days"] == 30
        assert member.expires_at == (
            initial_expiry + timedelta(days=30)
        )

        second = refund_points(
            db, "u1", "renewfund2", "refund2"
        )
        db.commit()

        assert second["removed_days"] == 30
        assert member.expires_at == initial_expiry
        assert member.rank == 4


def test_split_funding_single_revocation(engine):
    with Session(engine) as db:
        initial_expiry = prepare(db)

        apply_points(
            db, "u1", 400000, "part1", "test"
        )
        apply_points(
            db, "u1", 400000, "part2", "test"
        )

        renew_rank(db, "u1", 4, "renew1")
        db.commit()

        first = refund_points(
            db, "u1", "part1", "refund1"
        )
        db.commit()

        second = refund_points(
            db, "u1", "part2", "refund2"
        )
        db.commit()

        assert first["removed_days"] == 30
        assert second["removed_days"] == 0

        member = db.get(
            NobilityMembership, "u1"
        )

        assert member.expires_at == initial_expiry
        assert member.rank == 4


def test_refund_expires_membership(engine):
    with Session(engine) as db:
        prepare(db)
        renew(db, "renewfund", "renew1")

        member = db.get(
            NobilityMembership, "u1"
        )

        member.started_at -= timedelta(days=40)
        member.expires_at -= timedelta(days=40)
        db.commit()

        assert effective_rank(member) == 4

        result = refund_points(
            db, "u1", "renewfund", "refund1"
        )
        db.commit()

        assert result["removed_days"] == 30
        assert result["rank_after"] == 0
        assert member.rank == 0
        assert member.expires_at is None
        assert not has_privilege(
            db, "u1", "super_kick"
        )


def test_old_renewal_does_not_affect_upgrade(engine):
    with Session(engine) as db:
        apply_points(
            db, "u1", 400000, "initial", "test"
        )
        activate_rank(db, "u1", 1, "knight1")

        apply_points(
            db, "u1", 100000, "oldrenew", "test"
        )
        renew_rank(db, "u1", 1, "renew1")

        apply_points(
            db, "u1", 3200000, "kingfund", "test"
        )
        upgrade_rank(db, "u1", 4, "upgrade1")
        db.commit()

        member = db.get(
            NobilityMembership, "u1"
        )
        expiry = member.expires_at

        result = refund_points(
            db, "u1", "oldrenew", "refund1"
        )
        db.commit()

        assert result["removed_days"] == 0
        assert member.rank == 4
        assert member.expires_at == expiry


def test_renewal_refund_rollback(engine):
    with Session(engine) as db:
        prepare(db)
        renew(db, "renewfund", "renew1")

        expiry = db.get(
            NobilityMembership, "u1"
        ).expires_at

        refund_points(
            db, "u1", "renewfund", "refund1"
        )

        db.rollback()

        member = db.get(
            NobilityMembership, "u1"
        )

        renewal = db.scalars(
            select(NobilityRenewalFunding)
        ).one()

        assert member.expires_at == expiry
        assert not renewal.revoked
        assert renewal.revoked_at is None


def test_concurrent_split_renewal_refund(engine):
    from backend.tests.test_nobility_refunds_v10 import (
        concurrent_refunds,
    )

    with Session(engine) as db:
        initial_expiry = prepare(db)

        apply_points(
            db, "u1", 400000, "part1", "test"
        )
        apply_points(
            db, "u1", 400000, "part2", "test"
        )

        renew_rank(db, "u1", 4, "renew1")
        db.commit()

    results = concurrent_refunds(engine, [
        ("part1", "refund1"),
        ("part2", "refund2"),
    ])

    assert all(r["applied"] for r in results)
    assert sum(r["removed_days"] for r in results) == 30

    with Session(engine) as db:
        member = db.get(
            NobilityMembership, "u1"
        )

        renewal = db.scalars(
            select(NobilityRenewalFunding)
        ).one()

        assert member.rank == 4
        assert member.expires_at == initial_expiry
        assert member.points == 0
        assert renewal.revoked
        assert renewal.revoked_at is not None


def test_concurrent_distinct_renewal_refunds(engine):
    from backend.tests.test_nobility_refunds_v10 import (
        concurrent_refunds,
    )

    with Session(engine) as db:
        initial_expiry = prepare(db)

        renew(db, "renewfund1", "renew1")
        renew(db, "renewfund2", "renew2")

    results = concurrent_refunds(engine, [
        ("renewfund1", "refund1"),
        ("renewfund2", "refund2"),
    ])

    assert all(r["applied"] for r in results)
    assert sum(r["removed_days"] for r in results) == 60

    with Session(engine) as db:
        member = db.get(
            NobilityMembership, "u1"
        )

        renewals = db.scalars(
            select(NobilityRenewalFunding)
        ).all()

        assert len(renewals) == 2
        assert all(r.revoked for r in renewals)
        assert member.rank == 4
        assert member.expires_at == initial_expiry
        assert member.points == 0


def test_concurrent_duplicate_renewal_refund(engine):
    from backend.tests.test_nobility_refunds_v10 import (
        concurrent_refunds,
    )

    with Session(engine) as db:
        initial_expiry = prepare(db)
        renew(db, "renewfund", "renew1")

    results = concurrent_refunds(engine, [
        ("renewfund", "refund1"),
        ("renewfund", "refund1"),
    ])

    assert sum(r["applied"] for r in results) == 1
    assert sum(r["duplicate"] for r in results) == 1

    assert sum(
        r.get("removed_days", 0)
        for r in results
    ) == 30

    with Session(engine) as db:
        member = db.get(
            NobilityMembership, "u1"
        )

        assert member.rank == 4
        assert member.expires_at == initial_expiry
        assert member.points == 0


def test_refund_financial_audit(engine):
    import json
    from backend.app.nobility_models import NobilityAuditLog

    with Session(engine) as db:
        prepare(db)
        renew(db, "renewfund", "renew1")

        refund_points(
            db, "u1", "renewfund", "refund1"
        )
        db.commit()

        audit = db.scalars(
            select(NobilityAuditLog)
            .where(
                NobilityAuditLog.user_id == "u1",
                NobilityAuditLog.action == "purchase_refund",
            )
        ).one()

        data = json.loads(audit.reason)

        assert data["version"] == 1
        assert data["event"] == "purchase_refund"
        assert data["lot_event_key"] == "renewfund"
        assert data["refund_key"] == "refund1"
        assert data["refunded_points"] == 800000
        assert data["removed_balance"] == 0
        assert data["removed_days"] == 30
        assert data["rank_before"] == 4
        assert data["rank_after"] == 4
        assert data["processed_at"]

        before = json.loads(audit.before_state)
        after = json.loads(audit.after_state)

        assert before["expires_at"] != after["expires_at"]


def test_duplicate_refund_single_audit(engine):
    from backend.app.nobility_models import NobilityAuditLog

    with Session(engine) as db:
        prepare(db)
        renew(db, "renewfund", "renew1")

        refund_points(
            db, "u1", "renewfund", "refund1"
        )
        db.commit()

        refund_points(
            db, "u1", "renewfund", "refund2"
        )
        db.commit()

        audits = db.scalars(
            select(NobilityAuditLog)
            .where(
                NobilityAuditLog.user_id == "u1",
                NobilityAuditLog.action == "purchase_refund",
            )
        ).all()

        assert len(audits) == 1


def test_refund_audit_rollback(engine):
    from backend.app.nobility_models import NobilityAuditLog

    with Session(engine) as db:
        prepare(db)
        renew(db, "renewfund", "renew1")

        refund_points(
            db, "u1", "renewfund", "refund1"
        )

        db.rollback()

        audits = db.scalars(
            select(NobilityAuditLog)
            .where(
                NobilityAuditLog.user_id == "u1",
                NobilityAuditLog.action == "purchase_refund",
            )
        ).all()

        assert audits == []
