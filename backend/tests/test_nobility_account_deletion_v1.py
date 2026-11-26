"""Nobility account deletion privacy regression tests."""

from uuid import uuid4

import pytest

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.models import User

from backend.app.account_deletion_routes import (
    delete_user,
)

from backend.app.nobility_models import (
    NobilityAuditLog,
)

from backend.tests.test_nobility_postgres_v1 import (
    scoped_db,
)

@pytest.fixture
def deletion_engine(scoped_db):
    Base.metadata.create_all(
        scoped_db,
        tables=[NobilityAuditLog.__table__],
    )

    return scoped_db


def add_audit(db, user_id, actor_id):
    row = NobilityAuditLog(
        id=str(uuid4()),
        user_id=user_id,
        actor_id=actor_id,
        action="rank_activation",
        before_state="{}",
        after_state="{}",
        reason="User rank activation",
    )

    db.add(row)
    db.commit()

    return row.id


def test_own_audit_removed(deletion_engine):
    with Session(deletion_engine) as db:
        audit_id = add_audit(db, "u1", "u1")

        delete_user(db, db.get(User, "u1"))

    with Session(deletion_engine) as db:
        assert db.get(User, "u1") is None
        assert db.get(NobilityAuditLog, audit_id) is None
        assert db.get(User, "u2") is not None


def test_other_user_audit_preserved(deletion_engine):
    with Session(deletion_engine) as db:
        own_id = add_audit(db, "u1", "u1")
        other_id = add_audit(db, "u2", "u2")

        delete_user(db, db.get(User, "u1"))

    with Session(deletion_engine) as db:
        assert db.get(NobilityAuditLog, own_id) is None

        other = db.get(NobilityAuditLog, other_id)

        assert other is not None
        assert other.user_id == "u2"
        assert other.actor_id == "u2"


def test_actor_reference_removed(deletion_engine):
    with Session(deletion_engine) as db:
        audit_id = add_audit(db, "u2", "u1")

        delete_user(db, db.get(User, "u1"))

    with Session(deletion_engine) as db:
        row = db.get(NobilityAuditLog, audit_id)

        assert row is not None
        assert row.user_id == "u2"
        assert row.actor_id is None


def test_system_audit_preserved(deletion_engine):
    with Session(deletion_engine) as db:
        audit_id = add_audit(db, "u2", None)

        delete_user(db, db.get(User, "u1"))

    with Session(deletion_engine) as db:
        row = db.get(NobilityAuditLog, audit_id)

        assert row is not None
        assert row.actor_id is None


def test_multiple_own_audits_removed(
    deletion_engine,
):
    with Session(deletion_engine) as db:
        add_audit(db, "u1", "u1")
        add_audit(db, "u1", None)
        add_audit(db, "u1", "u2")
        add_audit(db, "u2", "u2")

        delete_user(db, db.get(User, "u1"))

    with Session(deletion_engine) as db:
        rows = db.scalars(
            select(NobilityAuditLog)
        ).all()

        assert len(rows) == 1
        assert rows[0].user_id == "u2"


def test_account_deletion_atomic_rollback(deletion_engine):
    from sqlalchemy import text

    with Session(deletion_engine) as db:
        own_id = add_audit(db, "u1", "u1")
        other_id = add_audit(db, "u2", "u1")

        db.execute(text("""
            CREATE FUNCTION nobility_test_reject_delete()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RAISE EXCEPTION 'Test deletion failure';
            END;
            $$
        """))

        db.execute(text("""
            CREATE TRIGGER nobility_test_delete_guard
            BEFORE DELETE ON users
            FOR EACH ROW
            EXECUTE FUNCTION nobility_test_reject_delete()
        """))

        db.commit()

        with pytest.raises(HTTPException) as exc:
            delete_user(db, db.get(User, "u1"))

        assert exc.value.status_code == 409
        assert "Test deletion failure" in str(
            exc.value.__cause__
        )

    with Session(deletion_engine) as db:
        assert db.get(User, "u1") is not None
        assert db.get(User, "u2") is not None

        own = db.get(NobilityAuditLog, own_id)
        other = db.get(NobilityAuditLog, other_id)

        assert own is not None
        assert other is not None
        assert own.actor_id == "u1"
        assert other.actor_id == "u1"
