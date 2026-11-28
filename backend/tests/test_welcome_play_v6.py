from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from backend.app.play_billing import _account_hash
from backend.app.welcome_packages import PACKAGES
from backend.app.welcome_play_verifier import (
    verify_welcome_receipt
)

NOW = datetime(2026, 11, 28, tzinfo=timezone.utc)


def intent(tier="gold", gender="male"):
    p = next(x for x in PACKAGES if x["id"] == tier)

    return SimpleNamespace(
        id="welcome-intent",
        user_id="owner",
        tier=tier,
        gender=gender,
        product_id=p["product_id"],
        price_kurus=p["price_kurus"],
        lidya=p["lidya"],
        duration_days=p["duration_days"],
        status="prepared",
        created_at=NOW,
        offer_expires_at=NOW+timedelta(days=7),
    )


def receipt(row):
    return {
        "purchaseStateContext": {
            "purchaseState": "PURCHASED"
        },
        "purchaseCompletionTime": (
            NOW+timedelta(minutes=1)
        ).isoformat(),
        "orderId": "TEST-ORDER-123",
        "obfuscatedExternalAccountId": _account_hash(
            row.user_id
        ),
        "acknowledgementState":
            "ACKNOWLEDGEMENT_STATE_PENDING",
        "productLineItem": [{
            "productId": row.product_id,
            "productOfferDetails": {
                "purchaseOptionId": "standart",
                "quantity": 1,
                "refundableQuantity": 1,
                "consumptionState":
                    "CONSUMPTION_STATE_YET_TO_BE_CONSUMED",
            },
        }],
    }


@pytest.mark.parametrize("gender", ["male", "female"])
@pytest.mark.parametrize("tier", [
    "bronze", "silver", "gold"
])
def test_valid_receipt(tier, gender):
    row = intent(tier, gender)

    result = verify_welcome_receipt(
        receipt(row), row, "owner"
    )

    assert result["gender"] == gender
    assert result["tier"] == tier
    assert result["lidya"] == row.lidya
    assert not result["credited"]
    assert not result["delivery_enabled"]
    assert not result["requires_review"]


@pytest.mark.parametrize("field,value", [
    ("quantity", 2),
    ("quantity", 0),
    ("quantity", True),
    ("refundableQuantity", 0),
    ("purchaseOptionId", "fake"),
    ("offerId", "unexpected-discount"),
    ("consumptionState", "CONSUMPTION_STATE_CONSUMED"),
])
def test_invalid_offer(field, value):
    row = intent()
    data = receipt(row)

    data["productLineItem"][0][
        "productOfferDetails"
    ][field] = value

    with pytest.raises(ValueError):
        verify_welcome_receipt(data, row, "owner")


def test_pending_payment():
    row = intent()
    data = receipt(row)
    data["purchaseStateContext"]["purchaseState"] = "PENDING"

    with pytest.raises(ValueError):
        verify_welcome_receipt(data, row, "owner")


def test_other_account():
    row = intent()

    with pytest.raises(ValueError):
        verify_welcome_receipt(
            receipt(row), row, "another-user"
        )


def test_fake_account_binding():
    row = intent()
    data = receipt(row)
    data["obfuscatedExternalAccountId"] = "fake"

    with pytest.raises(ValueError):
        verify_welcome_receipt(data, row, "owner")


def test_wrong_product():
    row = intent()
    data = receipt(row)
    data["productLineItem"][0]["productId"] = "lidya_016"

    with pytest.raises(ValueError):
        verify_welcome_receipt(data, row, "owner")


@pytest.mark.parametrize("field,value", [
    ("lidya", 99999999),
    ("price_kurus", 1),
    ("duration_days", 365),
    ("gender", "unknown"),
    ("tier", "bronze"),
])
def test_snapshot_tampering(field, value):
    row = intent()
    data = receipt(row)
    setattr(row, field, value)

    with pytest.raises(ValueError):
        verify_welcome_receipt(data, row, "owner")


def test_license_test_separation():
    row = intent()
    data = receipt(row)
    data["testPurchaseContext"] = {}

    with pytest.raises(ValueError):
        verify_welcome_receipt(data, row, "owner")

    result = verify_welcome_receipt(
        data, row, "owner", test_mode=True
    )

    assert result["test_purchase"]
    assert not result["credited"]


def test_real_receipt_rejected_in_test_mode():
    row = intent()

    with pytest.raises(ValueError):
        verify_welcome_receipt(
            receipt(row), row, "owner", test_mode=True
        )


def test_payment_before_intent():
    row = intent()
    data = receipt(row)

    data["purchaseCompletionTime"] = (
        NOW-timedelta(minutes=1)
    ).isoformat()

    with pytest.raises(ValueError):
        verify_welcome_receipt(data, row, "owner")


def test_late_payment_review():
    row = intent()
    data = receipt(row)

    data["purchaseCompletionTime"] = (
        NOW+timedelta(days=8)
    ).isoformat()

    result = verify_welcome_receipt(
        data, row, "owner"
    )

    assert result["requires_review"]
    assert not result["credited"]


def test_acknowledged_receipt_review():
    row = intent()
    data = receipt(row)

    data["acknowledgementState"] = (
        "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
    )

    assert verify_welcome_receipt(
        data, row, "owner"
    )["requires_review"]


from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import Session
from fastapi import HTTPException

from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app.play_billing_models import PlayPurchaseRecord
from backend.app.welcome_purchase_models import (
    WelcomePurchase, WelcomePlayReceipt,
)
from backend.app.welcome_receipt_service import (
    capture_verified_receipt,
)


@pytest.fixture
def receipt_db():
    engine = create_engine("sqlite://")

    for model in (
        User, AdminRole, WelcomePurchase,
        PlayPurchaseRecord, WelcomePlayReceipt,
    ):
        model.__table__.create(engine)

    with Session(engine) as db:
        db.add(User(
            id="owner",
            public_id="9900000001",
            _nickname="WelcomeTest",
            gender="male",
            is_active=True,
            profile_completed=True,
            created_at=NOW,
            lidya=100,
            lidya_gem=50,
        ))

        db.flush()

        source = intent()

        row = WelcomePurchase(**vars(source))
        db.add(row)
        db.commit()

        yield db, row

    engine.dispose()


def receipt_count(db):
    return db.scalar(
        select(func.count()).select_from(
            WelcomePlayReceipt
        )
    )


def capture(db, row, data=None, token="test-token-001"):
    return capture_verified_receipt(
        db, "owner", row.id, token,
        data if data is not None else receipt(row),
    )


def test_persistent_receipt(receipt_db):
    db, row = receipt_db

    link = capture(db, row)
    db.commit()

    assert link.disposition == "verified"
    assert row.status == "verified"
    assert receipt_count(db) == 1

    record = db.get(
        PlayPurchaseRecord, link.receipt_id
    )

    assert record.purchase_status == "verified_no_credit"
    assert record.token_sha256 != "test-token-001"
    assert len(record.token_sha256) == 64

    assert db.get(User, "owner").lidya == 100
    assert db.get(User, "owner").lidya_gem == 50


def test_persistent_retry(receipt_db):
    db, row = receipt_db

    first = capture(db, row)
    db.commit()

    second = capture(db, row)

    assert first.receipt_id == second.receipt_id
    assert receipt_count(db) == 1


def test_duplicate_paid_package_review(receipt_db):
    db, row = receipt_db

    capture(db, row)
    db.commit()

    data = receipt(row)
    data["orderId"] = "SECOND-ORDER"

    second = capture(
        db, row, data, "test-token-002"
    )

    assert second.disposition == "review"
    assert second.review_reason == "duplicate_paid_package"
    assert receipt_count(db) == 2
    assert row.status == "verified"
    assert db.get(User, "owner").lidya == 100


def test_same_order_different_token(receipt_db):
    db, row = receipt_db

    capture(db, row)
    db.commit()

    with pytest.raises(HTTPException) as error:
        capture(db, row, token="test-token-002")

    assert error.value.status_code == 409
    assert receipt_count(db) == 1


def test_late_receipt_persistent_review(receipt_db):
    db, row = receipt_db

    data = receipt(row)
    data["purchaseCompletionTime"] = (
        NOW+timedelta(days=8)
    ).isoformat()

    link = capture(db, row, data)

    assert link.disposition == "review"
    assert row.status == "review"
    assert db.get(User, "owner").lidya == 100


def test_gender_change_review(receipt_db):
    db, row = receipt_db

    user = db.get(User, "owner")
    user.gender = "female"
    db.commit()

    link = capture(db, row)

    assert link.disposition == "review"
    assert link.review_reason == "collection_changed"
    assert row.gender == "male"


def test_receipt_transaction_rollback(receipt_db):
    db, row = receipt_db

    capture(db, row)
    db.rollback()

    assert receipt_count(db) == 0

    assert db.scalar(
        select(func.count()).select_from(
            PlayPurchaseRecord
        )
    ) == 0

    assert row.status == "prepared"
    assert db.get(User, "owner").lidya == 100


def test_unverified_receipt_not_saved(receipt_db):
    db, row = receipt_db

    data = receipt(row)
    data["obfuscatedExternalAccountId"] = "fake"

    with pytest.raises(ValueError):
        capture(db, row, data)

    assert receipt_count(db) == 0
    assert row.status == "prepared"


def test_order_identity_conflict(receipt_db):
    db, row = receipt_db

    capture(db, row)
    db.commit()

    data = receipt(row)
    data["orderId"] = "CHANGED-ORDER"

    with pytest.raises(HTTPException) as error:
        capture(db, row, data)

    assert error.value.status_code == 409
    assert receipt_count(db) == 1
