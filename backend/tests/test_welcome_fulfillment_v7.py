from datetime import datetime, timedelta, timezone
import pytest

from fastapi import HTTPException
from sqlalchemy import BigInteger, create_engine, select
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from backend.app.models import User, UserCosmetic
from backend.app.admin_models import AdminRole
from backend.app.play_billing import _account_hash
from backend.app.play_billing_models import PlayPurchaseRecord
from backend.app.play_refund_models import PlayRefundCase
from backend.app.welcome_purchase_models import (
    WelcomePurchase, WelcomePlayReceipt,
)
from backend.app.cosmetic_leases import CosmeticLease
from backend.app.welcome_purchase_service import prepare_intent
from backend.app.welcome_receipt_service import capture_verified_receipt
from backend.app.welcome_cosmetics import rewards_for
from backend.app import welcome_fulfillment as service

NOW = datetime(2026, 11, 28, tzinfo=timezone.utc)
DELIVERED = NOW + timedelta(minutes=2)
TOKEN = "welcome-test-token-001"


@compiles(BigInteger, "sqlite")
def sqlite_bigint(type_, compiler, **kw):
    return "INTEGER"


@pytest.fixture
def db(monkeypatch, tmp_path):
    from backend.app.system_data import LidyaLedger
    from backend.app import system_logs

    monkeypatch.setattr(system_logs, "ROOT", tmp_path)
    monkeypatch.setenv(
        "LIDYACHAT_WELCOME_DELIVERY_ENABLED", "true"
    )
    monkeypatch.setattr(
        service, "_checkout_ready", lambda: True
    )
    monkeypatch.setattr(
        service.settings, "google_play_test_mode", False
    )

    engine = create_engine("sqlite://")

    for model in (
        User, AdminRole, UserCosmetic,
        WelcomePurchase, PlayPurchaseRecord,
        WelcomePlayReceipt, PlayRefundCase,
        CosmeticLease, LidyaLedger,
        VipStatus, DealerInventory, DealerDesignation,
    ):
        model.__table__.create(engine)

    with Session(engine, expire_on_commit=False) as session:
        yield session

    engine.dispose()


def seed(db, monkeypatch, tier="gold", gender="male",
         late=False):
    user = User(
        id="owner",
        public_id="9900000001",
        _nickname="WelcomeTest",
        gender=gender,
        profile_completed=True,
        is_active=True,
        created_at=NOW,
        lidya=100,
        lidya_gem=50,
    )

    db.add(user)
    db.commit()

    intent = prepare_intent(db, user.id, tier, NOW)
    intent.created_at = NOW

    data = {
        "purchaseStateContext": {
            "purchaseState": "PURCHASED"
        },
        "purchaseCompletionTime": (
            NOW + (
                timedelta(days=8)
                if late else timedelta(minutes=1)
            )
        ).isoformat(),
        "orderId": "TEST-WELCOME-ORDER",
        "obfuscatedExternalAccountId": _account_hash(user.id),
        "acknowledgementState":
            "ACKNOWLEDGEMENT_STATE_PENDING",
        "productLineItem": [{
            "productId": intent.product_id,
            "productOfferDetails": {
                "purchaseOptionId": "standart",
                "quantity": 1,
                "refundableQuantity": 1,
                "consumptionState":
                    "CONSUMPTION_STATE_YET_TO_BE_CONSUMED",
            },
        }],
    }

    link = capture_verified_receipt(
        db, user.id, intent.id, TOKEN, data
    )

    db.commit()

    monkeypatch.setattr(
        service, "fetch_from_google", lambda token: data
    )

    return intent, link


def call(db, link, uid="owner"):
    return service.deliver(
        db, link.receipt_id, uid, TOKEN, DELIVERED
    )


def leases(db):
    return db.scalars(select(CosmeticLease)).all()


def unchanged(db):
    assert db.get(User, "owner").lidya == 100
    assert db.get(User, "owner").lidya_gem == 50


@pytest.mark.parametrize("gender", ["male", "female"])
@pytest.mark.parametrize("tier,amount,count,days", [
    ("bronze",6000,2,7),
    ("silver",14000,4,15),
    ("gold",28000,5,30),
])
def test_delivery(db, monkeypatch, gender,
                  tier, amount, count, days):
    from backend.app.system_data import LidyaLedger
    from backend.app.welcome_cosmetics import utc

    intent, link = seed(db, monkeypatch, tier, gender)

    result = call(db, link)

    assert result["credited"]
    assert result["amount"] == amount
    assert result["cosmetics"] == count
    assert intent.status == "credited"
    assert db.get(User, "owner").lidya == 100 + amount
    assert db.get(User, "owner").lidya_gem == 50

    items = leases(db)
    assert len(items) == count

    assert all(
        x.asset_key.startswith(f"welcome_{gender}_{tier}_")
        for x in items
    )

    assert all(
        utc(x.expires_at) == DELIVERED + timedelta(days=days)
        for x in items
    )

    records = db.scalars(
        select(LidyaLedger).where(
            LidyaLedger.operation == "google_play_credit"
        )
    ).all()

    assert len(records) == 1
    assert records[0].delta == amount
    assert records[0].balance_after == 100 + amount


def test_retry(db, monkeypatch):
    intent, link = seed(db, monkeypatch)
    call(db, link)
    result = call(db, link)

    assert result["already_credited"]
    assert not result["credited"]
    assert len(leases(db)) == 5
    assert db.get(User, "owner").lidya == 28100


def test_disabled(db, monkeypatch):
    intent, link = seed(db, monkeypatch)
    monkeypatch.delenv(
        "LIDYACHAT_WELCOME_DELIVERY_ENABLED"
    )

    with pytest.raises(HTTPException) as error:
        call(db, link)

    assert error.value.status_code == 503
    unchanged(db)
    assert not leases(db)


def test_refund_block(db, monkeypatch):
    intent, link = seed(db, monkeypatch)

    db.add(PlayRefundCase(
        receipt_id=link.receipt_id,
        user_id="owner",
        product_id=intent.product_id,
    ))
    db.commit()

    with pytest.raises(HTTPException):
        call(db, link)

    unchanged(db)
    assert not leases(db)


def test_foreign_account(db, monkeypatch):
    intent, link = seed(db, monkeypatch)

    with pytest.raises(HTTPException):
        call(db, link, "other")

    unchanged(db)
    assert not leases(db)


def test_review_block(db, monkeypatch):
    intent, link = seed(db, monkeypatch, late=True)

    with pytest.raises(HTTPException):
        call(db, link)

    unchanged(db)
    assert not leases(db)


def test_existing_reward(db, monkeypatch):
    intent, link = seed(db, monkeypatch)
    item = rewards_for("male", "gold")[0]

    db.add(CosmeticLease(
        user_id="owner",
        cosmetic_type=item["type"],
        asset_key=item["asset_key"],
        expires_at=DELIVERED+timedelta(days=1),
    ))
    db.commit()

    with pytest.raises(HTTPException):
        call(db, link)

    unchanged(db)
    assert len(leases(db)) == 1


def test_atomic_rollback(db, monkeypatch):
    intent, link = seed(db, monkeypatch)

    def failed_commit():
        db.flush()
        raise RuntimeError("Simulated transaction failure")

    monkeypatch.setattr(db, "commit", failed_commit)

    with pytest.raises(RuntimeError):
        call(db, link)

    unchanged(db)
    assert not leases(db)
    assert intent.status == "verified"

    record = db.get(
        PlayPurchaseRecord, link.receipt_id
    )

    assert record.purchase_status == "verified_no_credit"


from backend.app.welcome_inventory import inventory


@pytest.mark.parametrize("gender", ["male", "female"])
@pytest.mark.parametrize("tier,count", [
    ("bronze",2),
    ("silver",4),
    ("gold",5),
])
def test_welcome_inventory(
    db, monkeypatch, gender, tier, count
):
    intent, link = seed(db, monkeypatch, tier, gender)

    assert inventory(
        db, db.get(User, "owner"), DELIVERED
    ) == []

    call(db, link)

    items = inventory(
        db, db.get(User, "owner"), DELIVERED
    )

    assert len(items) == count

    for item in items:
        assert item["source"] == "welcome_package"
        assert item["tier"] == tier
        assert item["asset_key"].startswith(
            f"welcome_{gender}_{tier}_"
        )
        assert item["asset"].endswith(".svg")
        assert item["locked"]
        assert not item["activation_enabled"]


def test_inventory_expired(db, monkeypatch):
    intent, link = seed(db, monkeypatch)
    call(db, link)

    assert inventory(
        db,
        db.get(User, "owner"),
        DELIVERED + timedelta(days=30),
    ) == []


def test_inventory_gender_changed(db, monkeypatch):
    intent, link = seed(db, monkeypatch)
    call(db, link)

    user = db.get(User, "owner")
    user.gender = "female"
    db.commit()

    assert inventory(db, user, DELIVERED) == []


def test_inventory_refunded(db, monkeypatch):
    intent, link = seed(db, monkeypatch)
    call(db, link)

    db.add(PlayRefundCase(
        receipt_id=link.receipt_id,
        user_id="owner",
        product_id=intent.product_id,
    ))
    db.commit()

    assert inventory(
        db, db.get(User, "owner"), DELIVERED
    ) == []


def test_inventory_other_account(db, monkeypatch):
    intent, link = seed(db, monkeypatch)
    call(db, link)

    other = User(
        id="other",
        public_id="9900000002",
        _nickname="OtherTest",
        gender="male",
        is_active=True,
        profile_completed=True,
        lidya=0,
        lidya_gem=0,
        created_at=NOW,
    )
    db.add(other)
    db.commit()

    assert inventory(db, other, DELIVERED) == []


def test_inventory_unpaid_lease(db, monkeypatch):
    intent, link = seed(db, monkeypatch)

    reward = rewards_for("male", "gold")[0]

    db.add(CosmeticLease(
        user_id="owner",
        cosmetic_type=reward["type"],
        asset_key=reward["asset_key"],
        expires_at=DELIVERED+timedelta(days=30),
    ))
    db.commit()

    assert inventory(
        db, db.get(User, "owner"), DELIVERED
    ) == []

from backend.app.platform_models import VipStatus
from backend.app.dealer_routes import (
    DealerInventory, DealerDesignation,
)
from backend.app import welcome_appearance as appearance


@pytest.fixture
def appearance_enabled(monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_WELCOME_APPEARANCE_ENABLED",
        "true",
    )


def equip_all(db):
    for reward in rewards_for("male", "gold"):
        appearance.select_reward(
            db,
            "owner",
            reward["type"],
            reward["asset_key"],
            DELIVERED,
        )

    db.commit()


def test_all_five_appearance_types(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)
    equip_all(db)

    user = db.get(User, "owner")

    for kind, column in appearance.COLUMNS.items():
        assert getattr(user, column) == (
            f"welcome_male_gold_{kind}_v1"
        )

    status = db.get(VipStatus, "owner")

    assert status.entry_effect == (
        "welcome_male_gold_entrance_v1"
    )

    assert status.level == 0
    assert status.total_spent == 0
    assert user.lidya == 28100


def test_active_appearance_preserved(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)
    equip_all(db)

    assert appearance.clear_invalid(
        db,
        "owner",
        DELIVERED+timedelta(days=29),
    ) == []


def test_all_expired_appearance_removed(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)
    equip_all(db)

    removed = appearance.clear_invalid(
        db,
        "owner",
        DELIVERED+timedelta(days=30),
    )

    db.commit()

    assert set(removed) == {
        "frame", "bubble", "profile",
        "title", "entrance",
    }

    user = db.get(User, "owner")

    assert all(
        getattr(user, column) is None
        for column in appearance.COLUMNS.values()
    )

    assert db.get(
        VipStatus, "owner"
    ).entry_effect is None

    assert len(leases(db)) == 5
    assert user.lidya == 28100


def test_unpaid_appearance_rejected(
    db, monkeypatch, appearance_enabled
):
    seed(db, monkeypatch)

    with pytest.raises(HTTPException):
        appearance.select_reward(
            db, "owner", "frame",
            "welcome_male_gold_frame_v1",
            DELIVERED,
        )

    assert db.get(User, "owner").frame_asset is None


def test_wrong_gender_appearance(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)

    with pytest.raises(HTTPException):
        appearance.select_reward(
            db, "owner", "frame",
            "welcome_female_gold_frame_v1",
            DELIVERED,
        )


def test_refund_removes_selected_appearance(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)
    equip_all(db)

    db.add(PlayRefundCase(
        receipt_id=link.receipt_id,
        user_id="owner",
        product_id=intent.product_id,
    ))
    db.commit()

    assert len(appearance.clear_invalid(
        db, "owner", DELIVERED
    )) == 5


def test_gender_change_removes_appearance(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)
    equip_all(db)

    user = db.get(User, "owner")
    user.gender = "female"
    db.commit()

    assert len(appearance.clear_invalid(
        db, "owner", DELIVERED
    )) == 5


def test_standard_cosmetics_preserved(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)
    equip_all(db)

    user = db.get(User, "owner")
    user.bubble_asset = "standard-bubble.svg"
    user.profile_asset = "standard-profile.svg"
    db.commit()

    removed = appearance.clear_invalid(
        db, "owner",
        DELIVERED+timedelta(days=30),
    )

    assert set(removed) == {
        "frame", "title", "entrance"
    }

    assert user.bubble_asset == "standard-bubble.svg"
    assert user.profile_asset == "standard-profile.svg"


def test_management_identity_protected(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)

    db.add(AdminRole(
        user_id="owner", role="DA"
    ))
    db.commit()

    with pytest.raises(HTTPException) as error:
        appearance.select_reward(
            db, "owner", "frame",
            "welcome_male_gold_frame_v1",
            DELIVERED,
        )

    assert error.value.status_code == 403


def test_appearance_disabled_by_default(
    db, monkeypatch
):
    intent, link = seed(db, monkeypatch)
    call(db, link)

    monkeypatch.delenv(
        "LIDYACHAT_WELCOME_APPEARANCE_ENABLED",
        raising=False,
    )

    with pytest.raises(HTTPException) as error:
        appearance.select_reward(
            db, "owner", "frame",
            "welcome_male_gold_frame_v1",
            DELIVERED,
        )

    assert error.value.status_code == 503


def test_expired_appearance_cannot_reequip(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)

    with pytest.raises(HTTPException):
        appearance.select_reward(
            db, "owner", "frame",
            "welcome_male_gold_frame_v1",
            DELIVERED+timedelta(days=30),
        )


@pytest.mark.parametrize("designation", [
    "dealer", "support"
])
def test_dealer_frame_protection(
    db, monkeypatch, appearance_enabled,
    designation,
):
    intent, link = seed(db, monkeypatch)
    call(db, link)

    db.add(DealerInventory(
        user_id="owner",
        active=True,
        stock=0,
    ))

    if designation == "support":
        db.add(DealerDesignation(
            user_id="owner",
            kind="support",
        ))

    db.commit()

    with pytest.raises(HTTPException) as error:
        appearance.select_reward(
            db,
            "owner",
            "frame",
            "welcome_male_gold_frame_v1",
            DELIVERED,
        )

    assert error.value.status_code == 403
    assert db.get(User, "owner").frame_asset is None
    assert db.get(User, "owner").lidya == 28100


@pytest.mark.parametrize("role", [
    "SA", "UA", "FA", "DA"
])
def test_all_management_roles(
    db, monkeypatch, appearance_enabled, role
):
    intent, link = seed(db, monkeypatch)
    call(db, link)

    db.add(AdminRole(
        user_id="owner",
        role=role,
    ))
    db.commit()

    for item in rewards_for("male", "gold"):
        with pytest.raises(HTTPException) as error:
            appearance.select_reward(
                db,
                "owner",
                item["type"],
                item["asset_key"],
                DELIVERED,
            )

        assert error.value.status_code == 403


def test_cleanup_on_account_access(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)
    equip_all(db)

    removed = appearance.cleanup_if_selected(
        db,
        db.get(User, "owner"),
        DELIVERED+timedelta(days=30),
    )

    db.commit()

    assert len(removed) == 5

    assert appearance.cleanup_if_selected(
        db,
        db.get(User, "owner"),
        DELIVERED+timedelta(days=30),
    ) == []


def test_ordinary_account_fast_path(
    db, monkeypatch, appearance_enabled
):
    seed(db, monkeypatch)

    def unexpected(*args, **kwargs):
        pytest.fail("Unexpected welcome entitlement query")

    monkeypatch.setattr(
        appearance, "inventory", unexpected
    )

    assert appearance.cleanup_if_selected(
        db, db.get(User, "owner"), DELIVERED
    ) == []


def test_entrance_only_cleanup(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)

    appearance.select_reward(
        db,
        "owner",
        "entrance",
        "welcome_male_gold_entrance_v1",
        DELIVERED,
    )

    db.commit()

    assert appearance.cleanup_if_selected(
        db,
        db.get(User, "owner"),
        DELIVERED+timedelta(days=30),
    ) == ["entrance"]


def test_refresh_preserves_welcome_frame(
    db, monkeypatch, appearance_enabled
):
    from backend.app.appearance_refresh import refresh_user

    intent, link = seed(db, monkeypatch)
    call(db, link)
    equip_all(db)

    original = appearance.active_keys

    monkeypatch.setattr(
        appearance,
        "active_keys",
        lambda session, user: original(
            session, user, DELIVERED
        ),
    )

    user = db.get(User, "owner")

    refresh_user(db, user, level=0)

    assert user.frame_asset == (
        "welcome_male_gold_frame_v1"
    )


def test_emergency_disable_clears_selection(
    db, monkeypatch, appearance_enabled
):
    intent, link = seed(db, monkeypatch)
    call(db, link)
    equip_all(db)

    monkeypatch.setenv(
        "LIDYACHAT_WELCOME_APPEARANCE_ENABLED",
        "false",
    )

    assert len(appearance.cleanup_if_selected(
        db,
        db.get(User, "owner"),
        DELIVERED,
    )) == 5

    assert db.get(User, "owner").lidya == 28100
    assert len(leases(db)) == 5
