import os
import uuid
import hashlib

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
from datetime import datetime, timezone, timedelta

import pytest

from fastapi import HTTPException
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.models import User
from backend.app.admin_models import UserBan
from backend.app.ban_workflow_models import UserBrowserDevice
from backend.app.ban_workflow import remember_device


DEVICE = str(uuid.UUID(int=1))
DIGEST = hashlib.sha256(DEVICE.encode()).hexdigest()


@pytest.fixture(params=["sqlite", "postgres"])
def isolated_db(request, tmp_path):
    postgres = request.param == "postgres"
    schema = None

    if postgres:
        raw = os.environ.get("SECURITY_TEST_DATABASE_URL", "")
        assert raw, "Isolated PostgreSQL URL required"
        url = make_url(raw)
        assert url.drivername.startswith("postgresql")
        assert url.host in ("127.0.0.1", "localhost", "::1")
        assert url.database == "lidyachat_security_test"
        assert os.environ.get("DEVICE_AUDIT_CONFIRM") == "YES"

        engine = create_engine(raw, pool_size=8)
        schema = "deviceaudit_" + uuid.uuid4().hex[:12]
    else:
        engine = create_engine(
            "sqlite+pysqlite:///" + str(tmp_path / "audit.db")
        )

    scoped = engine

    try:
        if schema:
            with engine.begin() as conn:
                conn.execute(text(f'CREATE SCHEMA "{schema}"'))

            scoped = engine.execution_options(
                schema_translate_map={None: schema}
            )

        Base.metadata.create_all(
            scoped,
            tables=[
                User.__table__,
                UserBrowserDevice.__table__,
                UserBan.__table__,
            ],
        )

        with Session(scoped) as db:
            db.add_all([
                User(id="u1", public_id="99000001",
                     _nickname="Audit One", is_active=True),
                User(id="u2", public_id="99000002",
                     _nickname="Audit Two", is_active=True),
            ])
            db.commit()

        yield scoped

    finally:
        try:
            if schema:
                with engine.begin() as conn:
                    conn.execute(text(
                        f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'
                    ))
        finally:
            engine.dispose()


def user(uid="u1"):
    return SimpleNamespace(id=uid)


def test_duplicate_registration(isolated_db):
    with Session(isolated_db) as db:
        for _ in range(10):
            remember_device(db, user(), DEVICE)

        rows = db.scalars(select(UserBrowserDevice)).all()
        assert len(rows) == 1
        assert rows[0].device_hash == DIGEST


def test_invalid_device(isolated_db):
    with Session(isolated_db) as db:
        for key in ("", None, "invalid-device"):
            remember_device(db, user(), key)

        assert not db.scalars(select(UserBrowserDevice)).all()


@pytest.mark.parametrize("expired", [False, True])
def test_device_ban_preserved(isolated_db, expired):
    with Session(isolated_db) as db:
        remember_device(db, user(), DEVICE)

        db.add(UserBan(
            user_id="u1",
            banned_by="u1",
            ban_type="device",
            active=True,
            expires_at=(
                datetime.now(timezone.utc) - timedelta(days=1)
                if expired else None
            ),
        ))
        db.commit()

        if expired:
            remember_device(db, user("u2"), DEVICE)
        else:
            with pytest.raises(HTTPException) as exc:
                remember_device(db, user("u2"), DEVICE)

            assert exc.value.status_code == 403

        row = db.get(UserBrowserDevice, ("u2", DIGEST))
        assert (row is not None) == expired


def test_postgres_concurrent_registration(isolated_db):
    if isolated_db.dialect.name != "postgresql":
        pytest.skip("PostgreSQL concurrency case")

    workers = 6
    barrier = Barrier(workers)

    class RaceSession(Session):
        def get(self, entity, ident, **kwargs):
            result = super().get(entity, ident, **kwargs)

            if entity is UserBrowserDevice and result is None:
                barrier.wait(timeout=15)

            return result

    def register():
        with RaceSession(isolated_db) as db:
            remember_device(db, user(), DEVICE)
            assert db.scalar(select(1)) == 1

        return True

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(register) for _ in range(workers)]
        assert all(f.result(timeout=30) for f in futures)

    with Session(isolated_db) as db:
        rows = db.scalars(select(UserBrowserDevice)).all()
        assert len(rows) == 1
        assert rows[0].device_hash == DIGEST
