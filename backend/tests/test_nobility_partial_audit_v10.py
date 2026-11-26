"""Integrated partial refund audit tests."""

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityAuditLog,
    NobilityMembership,
    NobilityRefundEvent,
)
from backend.app.nobility_points import apply_points
from backend.app.nobility_engine import (
    activate_rank,
    renew_rank,
)
from backend.app.nobility_refunds import refund_points
from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine


def credit(db, amount, key="purchase1"):
    apply_points(db, "u1", amount, key, "test")
    db.commit()


def audits(db):
    return db.scalars(
        select(NobilityAuditLog)
        .where(
            NobilityAuditLog.user_id == "u1",
            NobilityAuditLog.action == "purchase_refund",
        )
        .order_by(NobilityAuditLog.created_at.asc())
    ).all()


def refund(db, key, points=None, lot="purchase1"):
    return refund_points(
        db, "u1", lot, key, points=points
    )


def test_partial_refund_audit_balance(engine):
    with Session(engine) as db:
        credit(db, 204000)

        refund(db, "refund1", 102000)
        db.commit()

        rows = audits(db)
        assert len(rows) == 1

        row = rows[0]
        reason = json.loads(row.reason)
        before = json.loads(row.before_state)
        after = json.loads(row.after_state)

        assert reason["event"] == "purchase_refund"
        assert reason["refund_type"] == "partial"
        assert reason["lot_event_key"] == "purchase1"
        assert reason["refund_key"] == "refund1"
        assert reason["refunded_points"] == 102000
        assert reason["removed_balance"] == 102000
        assert reason["removed_spent"] == 0
        assert reason["total_refunded"] == 102000
        assert reason["fully_refunded"] is False
        assert reason["revoked_allocations"] == []
        assert reason["processed_at"]

        assert int(before["points"]) == 204000
        assert int(after["points"]) == 102000


def test_rank_downgrade_audit(engine):
    with Session(engine) as db:
        credit(db, 3200000)

        activate_rank(db, "u1", 4, "king1")
        db.commit()

        refund(db, "refund1", 102000)
        db.commit()

        rows = audits(db)
        assert len(rows) == 1

        reason = json.loads(rows[0].reason)
        before = json.loads(rows[0].before_state)
        after = json.loads(rows[0].after_state)

        assert reason["rank_before"] == 4
        assert reason["rank_after"] == 3
        assert reason["removed_balance"] == 0
        assert reason["removed_spent"] == 102000
        assert reason["removed_days"] == 0

        assert before["rank"] == 4
        assert after["rank"] == 3
        assert before["expires_at"] == after["expires_at"]

        revoked = reason["revoked_allocations"]

        assert len(revoked) == 1
        assert revoked[0]["removed_points"] == 102000
        assert revoked[0]["spend_event_key"] == (
            "nobility:activate:u1:king1"
        )


def test_multiple_refunds_audit_totals(engine):
    with Session(engine) as db:
        credit(db, 204000)

        refund(db, "refund1", 50000)
        refund(db, "refund2", 70000)
        refund(db, "refund3")
        db.commit()

        reasons = [
            json.loads(row.reason)
            for row in audits(db)
        ]

        assert len(reasons) == 3

        assert [
            r["total_refunded"] for r in reasons
        ] == [50000, 120000, 204000]

        assert [
            r["refunded_points"] for r in reasons
        ] == [50000, 70000, 84000]

        assert reasons[-1]["refund_type"] == "full"
        assert reasons[-1]["fully_refunded"] is True


def test_duplicate_refund_creates_no_extra_audit(engine):
    with Session(engine) as db:
        credit(db, 204000)

        refund(db, "refund1", 50000)
        db.commit()

        result = refund(db, "refund1", 50000)
        db.commit()

        assert result["duplicate"]
        assert len(audits(db)) == 1


def test_renewal_revocation_audit(engine):
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

        refund(
            db, "refund1", 100000, lot="renewal1"
        )

        refund(
            db, "refund2", 200000, lot="renewal1"
        )

        db.commit()

        reasons = [
            json.loads(row.reason)
            for row in audits(db)
        ]

        assert len(reasons) == 2

        assert reasons[0]["removed_days"] == 30
        assert reasons[1]["removed_days"] == 0

        assert reasons[0]["rank_after"] == 4
        assert reasons[1]["rank_after"] == 4

        member = db.get(NobilityMembership, "u1")

        assert member.expires_at == original


def test_refund_audit_rollback(engine):
    with Session(engine) as db:
        credit(db, 204000)

        refund(db, "refund1", 102000)

        assert len(audits(db)) == 1

        db.rollback()

        assert len(audits(db)) == 0

        assert db.get(
            NobilityRefundEvent, "refund1"
        ) is None

        member = db.get(NobilityMembership, "u1")

        assert member.points == 204000
