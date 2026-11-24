import base64
import time
from datetime import datetime, timezone

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from backend.app.admob_reward_routes import verified_fields


def signed_query(key, content):
    signature = base64.urlsafe_b64encode(key.sign(content.encode(), ec.ECDSA(hashes.SHA256()))).rstrip(b"=").decode()
    return (content + "&signature=" + signature + "&key_id=42").encode()


def test_valid_signature():
    key = ec.generate_private_key(ec.SECP256R1())
    content = "ad_unit=8782909853&custom_data=abc&reward_amount=5&reward_item=Lidya&timestamp=1&transaction_id=abcdef1234"
    result = verified_fields(signed_query(key, content), {"42": key.public_key()})
    assert result["custom_data"] == "abc"


def test_tamper_rejected():
    key = ec.generate_private_key(ec.SECP256R1())
    content = "ad_unit=8782909853&custom_data=abc&reward_amount=5&reward_item=Lidya&timestamp=1&transaction_id=abcdef1234"
    query = signed_query(key, content).replace(b"reward_amount=5", b"reward_amount=50")
    with pytest.raises(HTTPException) as ex:
        verified_fields(query, {"42": key.public_key()})
    assert ex.value.status_code == 403


def test_duplicate_query_key_rejected():
    key = ec.generate_private_key(ec.SECP256R1())
    content = "ad_unit=8782909853&custom_data=abc&custom_data=evil&reward_amount=5&reward_item=Lidya&timestamp=1&transaction_id=abcdef1234"
    with pytest.raises(HTTPException):
        verified_fields(signed_query(key, content), {"42": key.public_key()})


def test_duplicate_reward_and_daily_limit(monkeypatch):
    from datetime import timedelta
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from starlette.requests import Request
    from backend.app.db import Base
    from backend.app.models import User
    from backend.app import admin_models  # Register admin tables for test DB
    from backend.app import admob_reward_routes as mod

    engine = create_engine("sqlite:///:memory:")
    from backend.app.admin_models import AdminRole
    from backend.app.system_data import LidyaLedger

    # SQLite requires INTEGER PRIMARY KEY for auto IDs.
    # Production PostgreSQL keeps BIGINT unchanged.
    from sqlalchemy import BigInteger, Integer
    LidyaLedger.__table__.c.id.type = (
        BigInteger().with_variant(Integer(), "sqlite")
    )

    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            AdminRole.__table__,
            mod.AdmobClaim.__table__,
            mod.AdmobReward.__table__,
            LidyaLedger.__table__,
        ],
    )
    monkeypatch.setenv(
        "LIDYACHAT_ADMOB_PILOT_USER_IDS", "user-one"
    )
    monkeypatch.setattr(mod, "enabled", lambda: True)
    private = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(mod, "_keyset", lambda: {"42": private.public_key()})
    with Session(engine) as db:
        db.add(User(
            id="user-one",
            public_id="9000000001",
            nickname="AdMobTest",
            is_active=True,
            lidya=0
        ))
        db.commit()
        def callback(n, tx):
            now = datetime.now(timezone.utc)
            db.add(mod.AdmobClaim(nonce_digest=mod.sha256(n.encode()).hexdigest(),
                                  user_id="user-one", created_at=now - timedelta(seconds=2),
                                  expires_at=now + timedelta(minutes=5)))
            db.commit()
            payload = (f"ad_unit=8782909853&custom_data={n}&reward_amount=5&reward_item=Lidya"
                       f"&timestamp={int(time.time() * 1000)}&transaction_id={tx}&user_id=user-one")
            raw = signed_query(private, payload)
            req = Request({"type": "http", "method": "GET", "path": "/v1/admob/ssv", "query_string": raw,
                           "headers": []})
            return req
        req = callback("a" * 32, "deadbeef0001")
        assert mod.ssv_callback(req, db)["reward"] == 5
        assert mod.ssv_callback(req, db)["duplicate"] is True
        assert db.get(User, "user-one").lidya == 5
        for i in range(2, 6):
            assert mod.ssv_callback(callback(chr(96+i) * 32, f"deadbeef{i:04x}"), db)["reward"] == 5
        assert db.get(User, "user-one").lidya == 25
        with pytest.raises(HTTPException) as err:
            mod.ssv_callback(callback("z" * 32, "deadbeef9999"), db)
        assert err.value.status_code == 409
        assert db.get(User, "user-one").lidya == 25


def test_percent_encoded_signed_callback():
    key = ec.generate_private_key(ec.SECP256R1())
    content = (
        "ad_unit=8782909853&custom_data=abc%2Ddef"
        "&reward_amount=5&reward_item=Lidya"
        "&timestamp=1&transaction_id=abcdef1234"
    )
    fields = verified_fields(
        signed_query(key, content),
        {"42": key.public_key()}
    )
    assert fields["custom_data"] == "abc-def"

    tampered = signed_query(key, content).replace(
        b"abc%2Ddef", b"abc-def"
    )
    with pytest.raises(HTTPException) as error:
        verified_fields(tampered, {"42": key.public_key()})
    assert error.value.status_code == 403


def test_ssv_verify_only_no_credit(monkeypatch):
    from starlette.requests import Request
    from backend.app import admob_reward_routes as ads

    key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(ads, "enabled", lambda: False)
    monkeypatch.setattr(
        ads, "_keyset", lambda: {"42": key.public_key()}
    )
    monkeypatch.setenv("LIDYACHAT_ADMOB_SSV_VERIFY_ONLY", "true")

    content = (
        "ad_unit=8782909853&custom_data=" + "a" * 32
        + "&reward_amount=5&reward_item=Lidya"
        + f"&timestamp={int(time.time() * 1000)}"
        + "&transaction_id=abcdef1234"
    )
    raw = signed_query(key, content)
    def request(query):
        return Request({
            "type": "http",
            "method": "GET",
            "path": "/v1/admob/ssv",
            "query_string": query,
            "headers": [],
        })

    result = ads.ssv_callback(request(raw), db=None)
    assert result == {"ok": True, "verification_only": True}

    tampered = raw.replace(b"reward_amount=5", b"reward_amount=50")
    with pytest.raises(HTTPException) as error:
        ads.ssv_callback(request(tampered), db=None)
    assert error.value.status_code == 403

    bad_reward = signed_query(
        key, content.replace("reward_amount=5", "reward_amount=50")
    )
    with pytest.raises(HTTPException) as error:
        ads.ssv_callback(request(bad_reward), db=None)
    assert error.value.status_code == 400

    bad_unit = signed_query(
        key, content.replace("ad_unit=8782909853", "ad_unit=0000000000")
    )
    with pytest.raises(HTTPException) as error:
        ads.ssv_callback(request(bad_unit), db=None)
    assert error.value.status_code == 400

    stale_content = "&".join(
        "timestamp=1" if part.startswith("timestamp=") else part
        for part in content.split("&")
    )
    assert stale_content != content
    assert "timestamp=1" in stale_content
    stale = signed_query(key, stale_content)
    with pytest.raises(HTTPException) as error:
        ads.ssv_callback(request(stale), db=None)
    assert error.value.status_code == 400

    monkeypatch.delenv("LIDYACHAT_ADMOB_SSV_VERIFY_ONLY")
    with pytest.raises(HTTPException) as disabled:
        ads.ssv_callback(request(raw), db=None)
    assert disabled.value.status_code == 503



def test_ssv_verify_only_without_custom_data(monkeypatch):
    from starlette.requests import Request
    from backend.app import admob_reward_routes as ads

    key = ec.generate_private_key(ec.SECP256R1())

    monkeypatch.setattr(ads, "enabled", lambda: False)
    monkeypatch.setattr(
        ads, "_keyset", lambda: {"42": key.public_key()}
    )
    monkeypatch.setenv(
        "LIDYACHAT_ADMOB_SSV_VERIFY_ONLY", "true"
    )

    content = (
        "ad_unit=8782909853"
        "&reward_amount=5"
        "&reward_item=Lidya"
        f"&timestamp={int(time.time() * 1000)}"
        "&transaction_id=abcdef1234"
    )

    def make_request(raw):
        return Request({
            "type": "http",
            "method": "GET",
            "path": "/v1/admob/ssv",
            "query_string": raw,
            "headers": [],
        })

    raw = signed_query(key, content)

    result = ads.ssv_callback(make_request(raw), db=None)

    assert result == {
        "ok": True,
        "verification_only": True
    }

    tampered = raw.replace(
        b"reward_amount=5",
        b"reward_amount=50"
    )

    with pytest.raises(HTTPException) as error:
        ads.ssv_callback(
            make_request(tampered), db=None
        )

    assert error.value.status_code == 403


def test_google_url_sample_verify_only_never_live(monkeypatch):
    from starlette.requests import Request
    from backend.app import admob_reward_routes as ads

    key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(
        ads, "_keyset", lambda: {"42": key.public_key()}
    )
    monkeypatch.setenv(
        "LIDYACHAT_ADMOB_SSV_VERIFY_ONLY", "true"
    )
    content = (
        "ad_network=5450213213286189855"
        "&ad_unit=1234567890"
        "&reward_amount=5"
        "&reward_item=Lidya"
        f"&timestamp={int(time.time() * 1000)}"
        "&transaction_id=123456789"
    )
    req = Request({
        "type": "http",
        "method": "GET",
        "path": "/v1/admob/ssv",
        "query_string": signed_query(key, content),
        "headers": [],
    })

    monkeypatch.setattr(ads, "enabled", lambda: False)
    assert ads.ssv_callback(req, db=None) == {
        "ok": True, "verification_only": True
    }

    monkeypatch.setattr(ads, "enabled", lambda: True)
    with pytest.raises(HTTPException) as error:
        ads.ssv_callback(req, db=None)
    assert error.value.status_code == 400
