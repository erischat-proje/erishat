"""LB referans baglantisi: gercek ORM modeliyle PostgreSQL yarisi."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import create_engine, text, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.models import User
from backend.app.dealer_referrals import BTReferral, LBReferral


def test_one_lb_cannot_link_to_two_bts():
    raw = os.environ.get("SECURITY_TEST_DATABASE_URL", "")
    if not raw:
        pytest.skip("Izole PostgreSQL test ortami tanimli degil")

    url = make_url(raw)
    assert url.drivername.startswith("postgresql")
    assert url.host in ("localhost", "127.0.0.1", "::1")
    assert url.database == "lidyachat_security_test"
    assert os.environ.get("LB_V2_TEST_CONFIRM") == "YES"

    engine = create_engine(raw, pool_size=4)
    schema = "lbv2_" + uuid.uuid4().hex[:12]
    scoped = None

    try:
        with engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))

        scoped = engine.execution_options(
            schema_translate_map={None: schema}
        )

        Base.metadata.create_all(
            scoped,
            tables=[
                User.__table__,
                BTReferral.__table__,
                LBReferral.__table__,
            ],
        )

        with Session(scoped) as db:
            db.add_all([
                User(id="bt1", public_id="990001",
                     _nickname="BT 1", is_active=True),
                User(id="bt2", public_id="990002",
                     _nickname="BT 2", is_active=True),
                User(id="lb", public_id="990003",
                     _nickname="LB", is_active=True),
            ])
            db.flush()
            db.add_all([
                BTReferral(user_id="bt1", code="1111111111111111"),
                BTReferral(user_id="bt2", code="2222222222222222"),
            ])
            db.commit()

        barrier = Barrier(2)

        def link(bt_id):
            with Session(scoped) as db:
                from datetime import datetime, timezone
                barrier.wait(timeout=10)
                db.add(LBReferral(
                    user_id="lb",
                    bt_user_id=bt_id,
                    activated_at=datetime.now(timezone.utc),
                ))
                try:
                    db.commit()
                    return "ok"
                except IntegrityError:
                    db.rollback()
                    return "conflict"

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(link, "bt1"),
                pool.submit(link, "bt2"),
            ]
            results = [f.result(timeout=20) for f in futures]

        assert sorted(results) == ["conflict", "ok"]

        with Session(scoped) as db:
            links = db.scalars(select(LBReferral)).all()
            assert len(links) == 1
            assert links[0].user_id == "lb"
            assert links[0].bt_user_id in ("bt1", "bt2")

    finally:
        if scoped is not None:
            scoped.dispose()
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
                )
        finally:
            engine.dispose()
