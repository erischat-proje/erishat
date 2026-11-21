"""BT referral PostgreSQL single-root concurrency check."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError


def test_concurrent_bt_roots_postgres():
    raw = os.getenv("V7_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Test PostgreSQL URL tanımlı değil")

    url = make_url(raw)
    if (
        not url.drivername.startswith("postgresql")
        or url.host not in ("localhost", "127.0.0.1", "::1")
        or (url.database or "").lower() not in ("lidya_v7_test", "lidyachat_security_test")
        or os.getenv("V7_ISOLATED_CONFIRM") != "YES"
    ):
        pytest.fail("Yalnızca izole yerel test veritabanı kullanılabilir")

    engine = create_engine(raw, pool_pre_ping=True)
    schema = "btref_" + uuid.uuid4().hex[:16]

    try:
        with engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            conn.execute(text(f'''
                CREATE TABLE "{schema}".bt_referrals_v1 (
                    user_id VARCHAR(64) PRIMARY KEY,
                    code VARCHAR(16) NOT NULL UNIQUE,
                    parent_id VARCHAR(64),
                    activated_at TIMESTAMPTZ
                )
            '''))
            conn.execute(text(f'''
                CREATE UNIQUE INDEX
                uq_bt_referrals_v1_single_root
                ON "{schema}".bt_referrals_v1 ((1))
                WHERE activated_at IS NOT NULL
                  AND parent_id IS NULL
            '''))
            for uid, code in (
                ("bt_a", "1000000000000001"),
                ("bt_b", "1000000000000002"),
            ):
                conn.execute(text(f'''
                    INSERT INTO "{schema}".bt_referrals_v1
                    (user_id, code)
                    VALUES (:uid, :code)
                '''), {"uid": uid, "code": code})

        barrier = Barrier(2)

        def activate(uid):
            barrier.wait(timeout=10)
            try:
                with engine.begin() as conn:
                    conn.execute(text(f'''
                        UPDATE "{schema}".bt_referrals_v1
                        SET activated_at = CURRENT_TIMESTAMP
                        WHERE user_id = :uid
                    '''), {"uid": uid})
                return "ok"
            except IntegrityError:
                return "conflict"

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(activate, uid)
                for uid in ("bt_a", "bt_b")
            ]
            results = [f.result(timeout=20) for f in futures]

        assert sorted(results) == ["conflict", "ok"]

        with engine.connect() as conn:
            roots = conn.scalar(text(f'''
                SELECT COUNT(*)
                FROM "{schema}".bt_referrals_v1
                WHERE activated_at IS NOT NULL
                  AND parent_id IS NULL
            '''))
        assert roots == 1

    finally:
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
                )
        finally:
            engine.dispose()
