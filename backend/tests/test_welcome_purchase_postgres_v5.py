import os
from datetime import datetime, timezone
from uuid import uuid4
from threading import Barrier
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app.welcome_purchase_models import WelcomePurchase
from backend.app.welcome_purchase_service import prepare_intent

NOW = datetime(2026, 11, 28, tzinfo=timezone.utc)


@pytest.fixture
def pg():
    raw = os.getenv("SECURITY_TEST_DATABASE_URL", "")
    assert raw, "Isolated PostgreSQL URL required"
    url = make_url(raw)

    assert url.drivername.startswith("postgresql")
    assert url.host in ("localhost", "127.0.0.1", "::1")
    assert url.database == "lidyachat_security_test"
    assert os.getenv("WELCOME_PG_CONFIRM") == "YES"

    schema = "welcome_" + uuid4().hex[:16]
    root = create_engine(url)
    engine = None
    created = False

    try:
        with root.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))

        created = True

        engine = create_engine(
            url,
            pool_size=8,
            max_overflow=0,
            connect_args={
                "options": (
                    f"-c search_path={schema} "
                    "-c lock_timeout=10000 "
                    "-c statement_timeout=20000"
                )
            },
        )

        User.__table__.create(engine)
        AdminRole.__table__.create(engine)
        WelcomePurchase.__table__.create(engine)

        with Session(engine) as db:
            for uid, gender, public_id in (
                ("male-user", "male", "9900000001"),
                ("female-user", "female", "9900000002"),
            ):
                db.add(User(
                    id=uid,
                    public_id=public_id,
                    _nickname=uid,
                    gender=gender,
                    is_active=True,
                    profile_completed=True,
                    created_at=NOW,
                    lidya=100,
                    lidya_gem=50,
                ))

            db.commit()

        yield engine

    finally:
        if engine:
            engine.dispose()

        if created:
            with root.begin() as conn:
                conn.execute(
                    text(f'DROP SCHEMA "{schema}" CASCADE')
                )

        root.dispose()


def race(engine, calls):
    barrier = Barrier(len(calls))

    def worker(call):
        uid, tier = call

        with Session(engine) as db:
            barrier.wait(timeout=15)

            row = prepare_intent(db, uid, tier, NOW)
            result = row.id
            db.commit()

            return result

    with ThreadPoolExecutor(
        max_workers=len(calls)
    ) as pool:
        futures = [
            pool.submit(worker, call)
            for call in calls
        ]

        return [
            f.result(timeout=45)
            for f in futures
        ]


def verify_balances(db):
    users = db.scalars(select(User)).all()

    assert len(users) == 2
    assert all(u.lidya == 100 for u in users)
    assert all(u.lidya_gem == 50 for u in users)


def test_same_account_same_tier(pg):
    ids = race(pg, [("male-user", "gold")] * 6)

    assert len(set(ids)) == 1

    with Session(pg) as db:
        rows = db.scalars(
            select(WelcomePurchase)
        ).all()

        assert len(rows) == 1
        assert rows[0].status == "prepared"
        verify_balances(db)


def test_same_account_three_tiers(pg):
    calls = [
        ("male-user", tier)
        for tier in ("bronze", "silver", "gold")
        for _ in range(2)
    ]

    ids = race(pg, calls)
    assert len(set(ids)) == 3

    with Session(pg) as db:
        rows = db.scalars(
            select(WelcomePurchase)
        ).all()

        assert len(rows) == 3
        assert {r.tier for r in rows} == {
            "bronze", "silver", "gold"
        }

        verify_balances(db)


def test_different_accounts(pg):
    calls = [
        ("male-user", "gold"),
        ("female-user", "gold"),
    ] * 3

    ids = race(pg, calls)
    assert len(set(ids)) == 2

    with Session(pg) as db:
        rows = db.scalars(
            select(WelcomePurchase)
        ).all()

        assert len(rows) == 2
        assert {r.gender for r in rows} == {
            "male", "female"
        }

        assert all(r.status == "prepared" for r in rows)
        verify_balances(db)
