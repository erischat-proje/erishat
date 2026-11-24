"""AdMob V4 preview safety tests. Local SQLite only."""
import base64
import time
from datetime import datetime, timedelta, timezone
from hashlib import sha256

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from sqlalchemy import BigInteger, Integer, create_engine, func, select
from sqlalchemy.orm import Session
from starlette.requests import Request

from backend.app import admob_reward_routes as ads
from backend.app.admin_models import AdminRole
from backend.app.db import Base
from backend.app.models import User
from backend.app.system_data import LidyaLedger


def signed_request(key, nonce, tx, amount=5):
    payload = (
        f"ad_unit=8782909853&custom_data={nonce}"
        f"&reward_amount={amount}&reward_item=Lidya"
        f"&timestamp={int(time.time() * 1000)}"
        f"&transaction_id={tx}&user_id=preview-user"
    )
    signature = base64.urlsafe_b64encode(
        key.sign(payload.encode(), ec.ECDSA(hashes.SHA256()))
    ).rstrip(b"=").decode()
    raw = (payload + "&signature=" + signature + "&key_id=42").encode()
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/v1/admob/ssv",
        "query_string": raw,
        "headers": [],
    })


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setattr(ads, "enabled", lambda: False)
    monkeypatch.setenv("LIDYACHAT_ADMOB_SSV_VERIFY_ONLY", "true")
    monkeypatch.setenv("LIDYACHAT_ADMOB_PREVIEW_CLAIMS_ENABLED", "true")
    monkeypatch.setenv("LIDYACHAT_ADMOB_PREVIEW_USER_IDS", "preview-user")

    key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(ads, "_keyset", lambda: {"42": key.public_key()})

    LidyaLedger.__table__.c.id.type = BigInteger().with_variant(
        Integer(), "sqlite"
    )

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[
        User.__table__, AdminRole.__table__,
        ads.AdmobClaim.__table__, ads.AdmobReward.__table__,
        LidyaLedger.__table__,
    ])

    with Session(engine) as db:
        db.add(User(
            id="preview-user",
            public_id="9000000998",
            nickname="PreviewTest",
            is_active=True,
            lidya=100,
        ))
        db.commit()
        yield db, key

    engine.dispose()


def add_claim(db, nonce):
    now = datetime.now(timezone.utc)
    db.add(ads.AdmobClaim(
        nonce_digest=sha256(nonce.encode()).hexdigest(),
        user_id="preview-user",
        created_at=now - timedelta(seconds=2),
        expires_at=now + timedelta(minutes=5),
    ))
    db.commit()


def assert_no_credit(db):
    db.expire_all()
    assert db.get(User, "preview-user").lidya == 100
    assert db.execute(
        select(func.count()).select_from(ads.AdmobReward)
    ).scalar_one() == 0


def test_preview_disabled_and_whitelist(monkeypatch):
    monkeypatch.setattr(ads, "enabled", lambda: False)
    monkeypatch.setenv("LIDYACHAT_ADMOB_SSV_VERIFY_ONLY", "true")
    monkeypatch.delenv("LIDYACHAT_ADMOB_PREVIEW_CLAIMS_ENABLED", raising=False)

    assert not ads.preview_allowed("preview-user")

    monkeypatch.setenv("LIDYACHAT_ADMOB_PREVIEW_CLAIMS_ENABLED", "true")
    monkeypatch.setenv("LIDYACHAT_ADMOB_PREVIEW_USER_IDS", "preview-user")

    assert ads.preview_allowed("preview-user")
    assert not ads.preview_allowed("other-user")


def test_signed_preview_no_credit_and_idempotency(setup):
    db, key = setup
    nonce = "a" * 32
    add_claim(db, nonce)
    req = signed_request(key, nonce, "abcdef123400")

    result = ads.ssv_callback(req, db)
    assert result["preview_claim_consumed"] is True
    assert_no_credit(db)

    duplicate = ads.ssv_callback(req, db)
    assert duplicate["duplicate"] is True
    assert_no_credit(db)

    with pytest.raises(HTTPException) as error:
        ads.ssv_callback(
            signed_request(key, nonce, "abcdef123401"), db
        )
    assert error.value.status_code == 409
    db.rollback()
    assert_no_credit(db)


def test_reused_transaction_different_claim_rejected(setup):
    db, key = setup
    first, second = "b" * 32, "c" * 32
    add_claim(db, first)
    add_claim(db, second)

    assert ads.ssv_callback(
        signed_request(key, first, "abcdef123402"), db
    )["preview_claim_consumed"]

    with pytest.raises(HTTPException) as error:
        ads.ssv_callback(
            signed_request(key, second, "abcdef123402"), db
        )

    assert error.value.status_code == 409
    db.rollback()
    assert_no_credit(db)


def test_wrong_reward_and_tampered_signature(setup):
    db, key = setup
    nonce = "d" * 32
    add_claim(db, nonce)

    with pytest.raises(HTTPException) as error:
        ads.ssv_callback(
            signed_request(key, nonce, "abcdef123403", amount=50), db
        )
    assert error.value.status_code == 400

    req = signed_request(key, nonce, "abcdef123404")
    raw = req.scope["query_string"].replace(
        b"reward_amount=5", b"reward_amount=50"
    )
    tampered = Request({
        **req.scope,
        "query_string": raw,
    })

    with pytest.raises(HTTPException) as error:
        ads.ssv_callback(tampered, db)
    assert error.value.status_code == 403

    assert_no_credit(db)
