"""AdMob V2 PostgreSQL concurrency isolation test; never uses production databases."""
import base64
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from threading import Barrier
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from starlette.requests import Request

from backend.app import admob_reward_routes as ads
from backend.app.admin_models import AdminRole
from backend.app.db import Base
from backend.app.models import User
from backend.app.system_data import LidyaLedger


def _request(private_key, nonce, tx):
    payload = (
        f"ad_unit={ads.AD_UNIT.split('/')[-1]}&custom_data={nonce}"
        f"&reward_amount=5&reward_item=Lidya&timestamp={int(time.time() * 1000)}"
        f"&transaction_id={tx}&user_id=admob-concurrent-user"
    )
    sig = base64.urlsafe_b64encode(
        private_key.sign(payload.encode(), ec.ECDSA(hashes.SHA256()))
    ).rstrip(b"=").decode("ascii")
    raw = (payload + "&signature=" + sig + "&key_id=42").encode("ascii")
    return Request({"type": "http", "method": "GET", "path": "/v1/admob/ssv",
                    "query_string": raw, "headers": []})


def test_parallel_rewards_obey_daily_cap_and_idempotency(monkeypatch):
    url_text = os.getenv("V7_TEST_DATABASE_URL", "")
    if os.getenv("V7_ISOLATED_CONFIRM") != "YES":
        pytest.skip("Explicit isolated PostgreSQL test confirmation is required")
    assert url_text, "V7_TEST_DATABASE_URL must point to isolated CI PostgreSQL"
    url = make_url(url_text)
    assert url.get_backend_name() == "postgresql"
    assert url.host in ("127.0.0.1", "localhost"), "Never run against remote or production DB"
    assert url.database == "lidya_v7_test", "Dedicated CI test database required"
    schema = "admob_v2_" + uuid4().hex[:16]
    admin_engine = create_engine(url_text)
    with admin_engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url_text, connect_args={"options": f"-csearch_path={schema}"},
                           pool_size=8, max_overflow=2)
    try:
        Base.metadata.create_all(engine, tables=[
            User.__table__, AdminRole.__table__, ads.AdmobClaim.__table__,
            ads.AdmobReward.__table__, LidyaLedger.__table__,
        ])
        monkeypatch.setenv(
            "LIDYACHAT_ADMOB_PILOT_USER_IDS",
            "admob-concurrent-user"
        )
        monkeypatch.setattr(ads, "enabled", lambda: True)
        private = ec.generate_private_key(ec.SECP256R1())
        monkeypatch.setattr(ads, "_keyset", lambda: {"42": private.public_key()})
        now = datetime.now(timezone.utc)
        requests = []
        with Session(engine) as db:
            db.add(User(id="admob-concurrent-user", public_id="9000000999",
                        nickname="AdMobConcurrent", is_active=True, lidya=0))
            # Ensure the parent user exists before inserting FK claims.
            db.flush()
            for i in range(6):
                nonce = (chr(97 + i) * 32)
                tx = f"abcdef000000{i:04x}"
                db.add(ads.AdmobClaim(
                    nonce_digest=sha256(nonce.encode()).hexdigest(),
                    user_id="admob-concurrent-user", created_at=now - timedelta(seconds=3),
                    expires_at=now + timedelta(minutes=5),
                ))
                requests.append(_request(private, nonce, tx))
            db.commit()

        def invoke(req, barrier=None):
            with Session(engine) as db:
                if barrier is not None:
                    barrier.wait(timeout=30)
                try:
                    return ("ok", ads.ssv_callback(req, db))
                except HTTPException as error:
                    db.rollback()
                    return ("http", error.status_code)

        barrier = Barrier(7)
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = [pool.submit(invoke, req, barrier) for req in requests]
            barrier.wait(timeout=30)
            results = [f.result(timeout=60) for f in futures]
        assert sum(k == "ok" and v.get("reward") == 5 for k, v in results) == 5, results
        assert sum(k == "http" and v == 409 for k, v in results) == 1, results

        with Session(engine) as db:
            balance = db.get(User, "admob-concurrent-user").lidya
            count = db.execute(select(func.count()).select_from(ads.AdmobReward)).scalar_one()
            assert balance == 25, balance
            assert count == 5, count

        succeeded = [requests[i] for i, item in enumerate(results) if item[0] == "ok"]
        assert succeeded
        repeated = invoke(succeeded[0])
        assert repeated[0] == "ok" and repeated[1].get("duplicate") is True, repeated
        with Session(engine) as db:
            assert db.get(User, "admob-concurrent-user").lidya == 25
            assert db.execute(select(func.count()).select_from(ads.AdmobReward)).scalar_one() == 5
    finally:
        engine.dispose()
        with admin_engine.begin() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin_engine.dispose()
