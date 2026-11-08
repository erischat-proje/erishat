"""Isolated accounting tests: no Google credentials, payment or network access."""
from unittest.mock import patch
import pytest
from fastapi import HTTPException
from sqlalchemy import BigInteger, create_engine, select
from sqlalchemy.ext.compiler import compiles

# SQLite needs INTEGER primary-key affinity for the existing BigInteger ledger.
@compiles(BigInteger, "sqlite")
def sqlite_bigint(type_, compiler, **kw):
    return "INTEGER"
from sqlalchemy.orm import Session

from app.db import Base
from app.models import User
from app.play_billing_models import PlayPurchaseRecord
from app.system_data import LidyaLedger
from app.play_fulfillment import credit_verified_purchase


@pytest.fixture
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[User.__table__, PlayPurchaseRecord.__table__, LidyaLedger.__table__])
    with Session(engine, expire_on_commit=False) as db:
        db.add(User(id="u1", public_id="1234567890", nickname="TestUser", lidya=100))
        db.add(PlayPurchaseRecord(token_sha256="a"*64, user_id="u1", product_id="lidya_001",
                                  google_order_id="GPA.TEST-ORDER", test_purchase=False,
                                  purchase_status="verified_no_credit"))
        db.commit()
        yield db
    engine.dispose()


def call(db, **kwargs):
    with patch("app.play_fulfillment.settings.google_play_billing_enabled", True), \
         patch("app.play_fulfillment.settings.google_play_fulfillment_enabled", True):
        return credit_verified_purchase(db, receipt_id=1, user_id="u1", product_id="lidya_001", **kwargs)


def test_disabled_by_default(db):
    with pytest.raises(HTTPException) as err:
        credit_verified_purchase(db, receipt_id=1, user_id="u1", product_id="lidya_001")
    assert err.value.status_code == 503
    assert db.get(User, "u1").lidya == 100


def test_credit_exactly_once_and_ledger(db):
    first = call(db)
    assert first["credited"] and first["amount"] == 95
    assert db.get(User, "u1").lidya == 195
    second = call(db)
    assert second["already_credited"] and not second["credited"]
    assert db.get(User, "u1").lidya == 195
    rows = db.scalars(select(LidyaLedger).where(LidyaLedger.operation == "google_play_credit")).all()
    assert len(rows) == 1 and rows[0].delta == 95


def test_test_purchase_rejected(db):
    db.get(PlayPurchaseRecord, 1).test_purchase = True
    db.commit()
    with pytest.raises(HTTPException) as err: call(db)
    assert err.value.status_code == 409
    assert db.get(User, "u1").lidya == 100


def test_wrong_user_rejected(db):
    with patch("app.play_fulfillment.settings.google_play_billing_enabled", True), \
         patch("app.play_fulfillment.settings.google_play_fulfillment_enabled", True):
        with pytest.raises(HTTPException) as err:
            credit_verified_purchase(db, receipt_id=1, user_id="another", product_id="lidya_001")
    assert err.value.status_code == 409


def test_invalid_state_rejected(db):
    db.get(PlayPurchaseRecord, 1).purchase_status = "cancelled"
    db.commit()
    with pytest.raises(HTTPException): call(db)
    assert db.get(User, "u1").lidya == 100


def test_missing_order_rejected(db):
    db.get(PlayPurchaseRecord, 1).google_order_id = None
    db.commit()
    with pytest.raises(HTTPException): call(db)


def test_account_inactive_rejected(db):
    db.get(User, "u1").is_active = False
    db.commit()
    with pytest.raises(HTTPException): call(db)
    assert db.get(User, "u1").lidya == 100
