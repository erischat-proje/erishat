"""V4 preview race test. Isolated localhost PostgreSQL only."""
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


def signed_request(key, nonce, tx):
    payload = (
        f"ad_unit=8782909853&custom_data={nonce}"
        f"&reward_amount=5&reward_item=Lidya"
        f"&timestamp={int(time.time() * 1000)}"
        f"&transaction_id={tx}&user_id=admob-v4-user"
    )
    signature = base64.urlsafe_b64encode(
        key.sign(payload.encode(), ec.ECDSA(hashes.SHA256()))
    ).rstrip(b"=").decode("ascii")
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/v1/admob/ssv",
        "query_string": (
            payload + "&signature=" + signature + "&key_id=42"
        ).encode("ascii"),
        "headers": [],
    })


def test_concurrent_preview_same_transaction(monkeypatch):
    url_text = os.getenv("V7_TEST_DATABASE_URL", "")
    if os.getenv("V7_ISOLATED_CONFIRM") != "YES":
        pytest.skip("Isolated PostgreSQL confirmation required")

    assert url_text
    url = make_url(url_text)
    assert url.get_backend_name() == "postgresql"
    assert url.host in ("localhost", "127.0.0.1")
    assert url.database == "lidya_v7_test"

    monkeypatch.setattr(ads, "enabled", lambda: False)
    monkeypatch.setenv("LIDYACHAT_ADMOB_SSV_VERIFY_ONLY", "true")
    monkeypatch.setenv("LIDYACHAT_ADMOB_PREVIEW_CLAIMS_ENABLED", "true")
    monkeypatch.setenv("LIDYACHAT_ADMOB_PREVIEW_USER_IDS", "admob-v4-user")

    key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(ads, "_keyset", lambda: {"42": key.public_key()})

    schema = "admob_v4_" + uuid4().hex[:16]
    admin_engine = create_engine(url_text)

    with admin_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))

    engine = create_engine(
        url_text,
        connect_args={"options": f"-csearch_path={schema}"},
        pool_size=4,
    )

    try:
        Base.metadata.create_all(engine, tables=[
            User.__table__, AdminRole.__table__,
            ads.AdmobClaim.__table__, ads.AdmobReward.__table__,
            LidyaLedger.__table__,
        ])

        first = "a" * 32
        second = "b" * 32
        tx = "abcdef1234567890"
        now = datetime.now(timezone.utc)

        with Session(engine) as db:
            db.add(User(
                id="admob-v4-user",
                public_id="9000000997",
                nickname="AdMobV4Race",
                is_active=True,
                lidya=100,
            ))
            db.flush()
            for nonce in (first, second):
                db.add(ads.AdmobClaim(
                    nonce_digest=sha256(nonce.encode()).hexdigest(),
                    user_id="admob-v4-user",
                    created_at=now - timedelta(seconds=3),
                    expires_at=now + timedelta(minutes=5),
                ))
            db.commit()

        requests = [
            signed_request(key, first, tx),
            signed_request(key, second, tx),
        ]
        barrier = Barrier(3)

        def invoke(req):
            with Session(engine) as db:
                barrier.wait(timeout=30)
                try:
                    return ("ok", ads.ssv_callback(req, db))
                except HTTPException as exc:
                    db.rollback()
                    return ("http", exc.status_code)

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(invoke, request)
                for request in requests
            ]
            barrier.wait(timeout=30)
            results = [future.result(timeout=60) for future in futures]

        assert sum(
            status == "ok" and result.get("preview_claim_consumed")
            for status, result in results
        ) == 1, results

        assert sum(
            status == "http" and result == 409
            for status, result in results
        ) == 1, results

        with Session(engine) as db:
            assert db.get(User, "admob-v4-user").lidya == 100
            assert db.execute(
                select(func.count()).select_from(ads.AdmobReward)
            ).scalar_one() == 0
            assert db.execute(
                select(func.count()).select_from(ads.AdmobClaim)
                .where(ads.AdmobClaim.transaction_id == tx)
            ).scalar_one() == 1

    finally:
        engine.dispose()
        with admin_engine.begin() as connection:
            connection.execute(
                text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
            )
        admin_engine.dispose()
