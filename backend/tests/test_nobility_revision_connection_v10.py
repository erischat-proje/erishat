"""Nobility revision integration tests."""

from uuid import uuid4

from sqlalchemy.orm import Session

from backend.app.nobility_actions import (
    execute_action,
    membership_state,
)
from backend.app.nobility_requests import NobilityActionRequest

from test_nobility_activation_v10 import engine, fund
from test_nobility_postgres_v1 import scoped_db


def test_membership_revision_present(engine):
    fund(engine, 800000)

    with Session(engine) as db:
        state = membership_state(db, "u1")

        assert len(state["revision"]) == 64
        assert all(
            c in "0123456789abcdef"
            for c in state["revision"]
        )


def test_revision_stable(engine):
    fund(engine, 800000)

    with Session(engine) as db:
        first = membership_state(db, "u1")
        second = membership_state(db, "u1")

        assert first["revision"] == second["revision"]


def test_revision_account_isolation(engine):
    with Session(engine) as db:
        first = membership_state(db, "u1")
        second = membership_state(db, "u2")

        assert first["revision"] != second["revision"]


def test_activation_changes_revision(engine):
    fund(engine, 800000)

    with Session(engine) as db:
        before = membership_state(db, "u1")

        result = execute_action(
            db,
            "u1",
            "activate",
            NobilityActionRequest(
                rank=1,
                request_id=str(uuid4()),
                confirmed_revision=before["revision"],
                confirmed_cost="400000",
            ),
        )

        after = membership_state(db, "u1")

        assert result["applied"] is True
        assert before["revision"] != after["revision"]
        assert result["membership"]["revision"] == after["revision"]
        assert after["points"] == "400000"


def test_duplicate_preserves_revision(engine):
    fund(engine, 800000)

    with Session(engine) as db:
        before = membership_state(db, "u1")

        request = NobilityActionRequest(
            rank=1,
            request_id=str(uuid4()),
            confirmed_revision=before["revision"],
            confirmed_cost="400000",
        )
        first = execute_action(
            db, "u1", "activate", request
        )

        second = execute_action(
            db, "u1", "activate", request
        )

        assert second["duplicate"] is True

        assert (
            first["membership"]["revision"]
            == second["membership"]["revision"]
        )


def test_revision_persists_across_sessions(engine):
    fund(engine, 800000)

    with Session(engine) as db:
        first = membership_state(db, "u1")

    with Session(engine) as db:
        second = membership_state(db, "u1")

    assert first["revision"] == second["revision"]
