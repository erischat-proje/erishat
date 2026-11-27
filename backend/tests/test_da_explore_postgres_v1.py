import os
import unittest

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4
from unittest.mock import patch

from sqlalchemy import create_engine, event, text, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

import test_da_explore_moderation_v1 as moderation


class DAPostgresV1(moderation.DAModerationV1):

    def setUp(self):
        raw = os.environ.get("DA_PG_TEST_DATABASE_URL")

        if not raw:
            self.fail("Isolated PostgreSQL URL required")

        url = make_url(raw)

        assert url.drivername.startswith("postgresql")
        assert url.host in ("localhost", "127.0.0.1", "::1")
        assert url.database == "lidyachat_security_test"
        assert os.environ.get("DA_PG_ISOLATED_CONFIRM") == "YES"

        schema = "da_moderation_" + uuid4().hex

        admin = create_engine(raw)
        self.addCleanup(admin.dispose)

        with admin.begin() as conn:
            conn.execute(text("CREATE SCHEMA " + schema))

        def cleanup():
            with admin.begin() as conn:
                conn.execute(text(
                    "DROP SCHEMA IF EXISTS " + schema + " CASCADE"
                ))

        self.addCleanup(cleanup)

        engine = create_engine(
            raw,
            connect_args={
                "connect_timeout": 5,
                "options":
                    "-c lock_timeout=10000 "
                    "-c statement_timeout=20000"
            }
        )

        self.addCleanup(engine.dispose)

        @event.listens_for(engine, "connect")
        def configure_schema(connection, record):
            with connection.cursor() as cursor:
                cursor.execute("SET search_path TO " + schema)
            connection.commit()

        with patch.object(
            moderation, "create_engine", return_value=engine
        ):
            super().setUp()

    def test_13_parallel_da_delete_single_audit(self):
        with Session(self.engine) as db:
            db.add(moderation.AdminRole(
                user_id="fa", role="DA"
            )) if not db.get(
                moderation.AdminRole, "fa"
            ) else None

            db.get(moderation.AdminRole, "fa").role = "DA"
            db.commit()

        barrier = Barrier(2)

        def worker(uid):
            barrier.wait(timeout=10)
            return self.remove(uid).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(worker, uid)
                for uid in ("da", "fa")
            ]

            results = [
                f.result(timeout=40)
                for f in futures
            ]

        self.assertEqual(sorted(results), [200,404])

        with Session(self.engine) as db:
            self.assertIsNone(
                db.get(moderation.SocialPost, 1)
            )

            logs = db.scalars(
                select(moderation.AdminAuditLog)
            ).all()

            self.assertEqual(len(logs), 1)

    def test_14_audit_failure_rolls_back_delete(self):
        def fail_audit(mapper, connection, target):
            raise RuntimeError("Isolated audit failure")

        model = moderation.AdminAuditLog

        event.listen(model, "before_insert", fail_audit)

        try:
            with self.assertRaises(RuntimeError):
                self.remove()
        finally:
            event.remove(model, "before_insert", fail_audit)

        with Session(self.engine) as db:
            self.assertIsNotNone(
                db.get(moderation.SocialPost, 1)
            )

            self.assertEqual(
                len(db.scalars(select(model)).all()), 0
            )


if __name__ == "__main__":
    unittest.main()
