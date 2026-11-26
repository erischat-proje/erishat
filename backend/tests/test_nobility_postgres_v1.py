"""Nobility points PostgreSQL security tests."""

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import create_engine, select, text, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.models import User
from backend.app.nobility_models import (
    NobilityMembership,
    NobilityPointsLedger,
    NobilityPointLot,
    NobilityPointAllocation,
    NobilityRefundEvent,
    NobilityMembershipFunding,
    NobilityRenewalFunding,
    NobilityActionRejection,
    NobilityActionConfirmation,
)
from backend.app.nobility_points import apply_points


@pytest.fixture
def scoped_db(monkeypatch):
    raw = os.environ.get(
        "SECURITY_TEST_DATABASE_URL", ""
    )

    if not raw:
        pytest.skip("Isolated PostgreSQL required")

    url = make_url(raw)

    assert url.drivername.startswith("postgresql")
    assert url.host in (
        "localhost", "127.0.0.1", "::1"
    )
    assert url.database == "lidyachat_security_test"
    assert os.environ.get(
        "NOBILITY_TEST_CONFIRM"
    ) == "YES"

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "true"
    )

    engine = create_engine(raw, pool_size=4)
    schema = "nobility_" + uuid.uuid4().hex[:12]

    @event.listens_for(engine, "connect")
    def configure_test_search_path(connection, record):
        previous = connection.autocommit
        try:
            connection.autocommit = True
            with connection.cursor() as cursor:
                cursor.execute(
                    f'SET search_path TO "{schema}"'
                )
        finally:
            connection.autocommit = previous


    try:
        with engine.begin() as conn:
            conn.execute(
                text(f'CREATE SCHEMA "{schema}"')
            )

        scoped = engine.execution_options(
            schema_translate_map={None: schema}
        )

        Base.metadata.create_all(
            scoped,
            tables=[
                User.__table__,
                *[
                    Base.metadata.tables[name]
                    for name in (
                        "admin_roles",
                        "system_lidya_ledger",
                        "system_lidya_gem_ledger",
                    )
                    if name in Base.metadata.tables
                ],
                NobilityMembership.__table__,
                NobilityPointsLedger.__table__,
                NobilityPointLot.__table__,
                NobilityPointAllocation.__table__,
                NobilityRefundEvent.__table__,
                NobilityMembershipFunding.__table__,
                NobilityRenewalFunding.__table__,
                NobilityActionRejection.__table__,
                NobilityActionConfirmation.__table__,
            ],
        )

        with Session(scoped) as db:
            db.add_all([
                User(
                    id="u1", public_id="990001",
                    _nickname="Test 1",
                    is_active=True,
                ),
                User(
                    id="u2", public_id="990002",
                    _nickname="Test 2",
                    is_active=True,
                ),
            ])
            db.commit()

        yield scoped

    finally:
        try:
            with engine.begin() as conn:
                conn.execute(text(
                    f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'
                ))
        finally:
            engine.dispose()


def balance(engine, uid="u1"):
    with Session(engine) as db:
        row = db.get(NobilityMembership, uid)
        return row.points if row else 0


def race(engine, keys):
    barrier = Barrier(len(keys))

    def worker(key):
        with Session(engine) as db:
            barrier.wait(timeout=10)
            result = apply_points(
                db, "u1", 100, key, "test"
            )
            db.commit()
            return result

    with ThreadPoolExecutor(
        max_workers=len(keys)
    ) as pool:
        futures = [
            pool.submit(worker, key)
            for key in keys
        ]
        return [
            f.result(timeout=30)
            for f in futures
        ]


def test_duplicate_concurrent(scoped_db):
    results = race(
        scoped_db, ["same", "same"]
    )
    assert sorted(results) == [False, True]
    assert balance(scoped_db) == 100

    with Session(scoped_db) as db:
        rows = db.scalars(
            select(NobilityPointsLedger)
        ).all()
        assert len(rows) == 1


def test_distinct_concurrent(scoped_db):
    results = race(
        scoped_db, ["event1", "event2"]
    )
    assert results == [True, True]
    assert balance(scoped_db) == 200


def test_insufficient_points(scoped_db):
    with Session(scoped_db) as db:
        with pytest.raises(ValueError):
            apply_points(
                db, "u1", -100, "negative", "test"
            )
        db.commit()

    assert balance(scoped_db) == 0

    with Session(scoped_db) as db:
        assert db.get(
            NobilityPointsLedger, "negative"
        ) is None


def test_cross_user_conflict(scoped_db):
    with Session(scoped_db) as db:
        apply_points(
            db, "u1", 100, "shared", "test"
        )
        db.commit()

    with Session(scoped_db) as db:
        with pytest.raises(ValueError):
            apply_points(
                db, "u2", 100, "shared", "test"
            )
        db.commit()

    assert balance(scoped_db, "u1") == 100
    assert balance(scoped_db, "u2") == 0


def test_transaction_rollback(scoped_db):
    with Session(scoped_db) as db:
        apply_points(
            db, "u1", 100, "rollback", "test"
        )
        db.rollback()

    assert balance(scoped_db) == 0

    with Session(scoped_db) as db:
        assert db.get(
            NobilityPointsLedger, "rollback"
        ) is None


def test_cross_user_concurrent(scoped_db):
    from sqlalchemy.exc import IntegrityError

    barrier = Barrier(2)

    def worker(uid):
        with Session(scoped_db) as db:
            barrier.wait(timeout=10)
            try:
                apply_points(
                    db, uid, 100,
                    "global-race", "test"
                )
                db.commit()
                return "ok"
            except (ValueError, IntegrityError):
                db.rollback()
                return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(worker, uid)
            for uid in ("u1", "u2")
        ]
        results = [
            f.result(timeout=30)
            for f in futures
        ]

    assert sorted(results) == ["conflict", "ok"]

    assert (
        balance(scoped_db, "u1")
        + balance(scoped_db, "u2")
    ) == 100

    with Session(scoped_db) as db:
        rows = db.scalars(
            select(NobilityPointsLedger)
        ).all()
        assert len(rows) == 1


def test_concurrent_double_debit(scoped_db):
    with Session(scoped_db) as db:
        apply_points(
            db, "u1", 100, "initial", "test"
        )
        db.commit()

    barrier = Barrier(2)

    def worker(key):
        with Session(scoped_db) as db:
            barrier.wait(timeout=10)
            try:
                apply_points(
                    db, "u1", -80, key, "test"
                )
                db.commit()
                return "ok"
            except ValueError as e:
                db.rollback()
                assert str(e) == "Insufficient points"
                return "rejected"

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(worker, key)
            for key in ("debit1", "debit2")
        ]
        results = [
            f.result(timeout=30)
            for f in futures
        ]

    assert sorted(results) == ["ok", "rejected"]
    assert balance(scoped_db) == 20

    with Session(scoped_db) as db:
        rows = db.scalars(
            select(NobilityPointsLedger)
        ).all()
        assert len(rows) == 2
        assert sum(row.amount for row in rows) == 20
