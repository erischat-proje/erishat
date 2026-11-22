"""Isolated PostgreSQL concurrency regression for Firebase devices."""
import os
import uuid
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from types import SimpleNamespace

from sqlalchemy import create_engine, event, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker


def isolated_database_url():
    raw = os.environ.get("V7_TEST_DATABASE_URL", "")
    if not raw:
        raise unittest.SkipTest("Yerel PostgreSQL test URL yok")

    url = make_url(raw)
    if (
        not url.drivername.startswith("postgresql")
        or url.host not in ("localhost", "127.0.0.1", "::1")
        or not url.database
        or "lidya_v7_test" not in url.database.lower()
        or os.environ.get("V7_ISOLATED_CONFIRM") != "YES"
    ):
        raise RuntimeError("Guvenli PostgreSQL test ortami gerekli")
    return raw


class PushPostgresV43(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        raw = isolated_database_url()

        from app.db import Base
        from app.models import User
        from app.push_device_models import PushDevice
        from app.push_device_routes import (
            DevicePayload, register_auth, token_hash
        )
        from app.session import UserSession, hash_token

        cls.User = User
        cls.PushDevice = PushDevice
        cls.UserSession = UserSession
        cls.DevicePayload = DevicePayload
        cls.token_hash = staticmethod(token_hash)
        cls.hash_token = staticmethod(hash_token)

        cls.schema = "push_v43_" + uuid.uuid4().hex[:12]
        cls.admin_engine = create_engine(raw)

        with cls.admin_engine.begin() as conn:
            conn.execute(text(f"CREATE SCHEMA {cls.schema}"))

        cls.engine = create_engine(raw, pool_size=4, max_overflow=4)

        @event.listens_for(cls.engine, "connect")
        def set_schema(connection, record):
            with connection.cursor() as cursor:
                cursor.execute(
                    f"SET search_path TO {cls.schema}, public"
                )
            connection.commit()

        cls.Session = sessionmaker(
            cls.engine, expire_on_commit=False
        )

        try:
            Base.metadata.create_all(
                cls.engine,
                tables=[
                    User.__table__,
                    UserSession.__table__,
                    PushDevice.__table__,
                ],
            )
            router = register_auth(lambda: None)
            cls.register = staticmethod(next(
                r.endpoint for r in router.routes
                if r.path == "/v1/push/device"
                and "POST" in r.methods
            ))
        except Exception:
            cls.tearDownClass()
            raise

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "engine"):
            cls.engine.dispose()
        if hasattr(cls, "admin_engine"):
            with cls.admin_engine.begin() as conn:
                conn.execute(text(
                    f"DROP SCHEMA IF EXISTS {cls.schema} CASCADE"
                ))
            cls.admin_engine.dispose()

    def test_two_concurrent_registrations_one_device(self):
        ids = [
            "push-a-" + uuid.uuid4().hex[:12],
            "push-b-" + uuid.uuid4().hex[:12],
        ]
        tokens = ["push-session-" + uuid.uuid4().hex for _ in ids]
        device_token = "fcm-" + uuid.uuid4().hex * 3

        with self.Session.begin() as db:
            for user_id, session_token in zip(ids, tokens):
                db.add(self.User(
                    id=user_id,
                    public_id=uuid.uuid4().hex[:12],
                    _nickname="Push Test",
                    _avatar="P",
                    lidya=0,
                ))
                db.flush()
                db.add(self.UserSession(
                    token_hash=self.hash_token(session_token),
                    user_id=user_id,
                    expires_at=datetime.now(timezone.utc)
                    + timedelta(days=1),
                ))

        barrier = Barrier(2)

        def worker(user_id, session_token):
            with self.Session() as db:
                barrier.wait(timeout=10)
                return self.register(
                    payload=self.DevicePayload(token=device_token),
                    db=db,
                    user=SimpleNamespace(id=user_id),
                    authorization="Bearer " + session_token,
                )

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(worker, uid, session)
                for uid, session in zip(ids, tokens)
            ]
            results = [future.result(timeout=20) for future in futures]

        assert all(result["registered"] for result in results)

        with self.Session() as db:
            records = db.scalars(
                select(self.PushDevice).where(
                    self.PushDevice.token_hash
                    == self.token_hash(device_token)
                )
            ).all()

            assert len(records) == 1
            assert records[0].user_id in ids
            assert records[0].session_hash in {
                self.hash_token(t) for t in tokens
            }
            assert (
                records[0].session_hash
                == self.hash_token(
                    tokens[ids.index(records[0].user_id)]
                )
            )
