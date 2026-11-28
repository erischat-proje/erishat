from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app.welcome_packages import offer_status
from backend.app.welcome_purchase_models import WelcomePurchase
from backend.app.welcome_purchase_service import prepare_intent

NOW = datetime(2026, 11, 28, tzinfo=timezone.utc)


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    User.__table__.create(engine)
    AdminRole.__table__.create(engine)
    WelcomePurchase.__table__.create(engine)

    with Session(engine) as session:
        yield session

    engine.dispose()


def account(db, gender="male", age=0):
    user = User(
        id=str(uuid4()),
        public_id=str(uuid4().int % 9000000000 + 1000000000),
        nickname="WelcomeTest",
        gender=gender,
        profile_completed=True,
        is_active=True,
        created_at=NOW-timedelta(days=age),
        lidya=100,
        lidya_gem=50,
    )
    db.add(user)
    db.commit()
    return user


def count(db):
    return db.scalar(
        select(func.count()).select_from(WelcomePurchase)
    )


@pytest.mark.parametrize("gender", ["male", "female"])
@pytest.mark.parametrize("tier,price,amount,days", [
    ("bronze",9999,6000,7),
    ("silver",24999,14000,15),
    ("gold",49999,28000,30),
])
def test_authoritative_snapshot(
    db, gender, tier, price, amount, days
):
    user = account(db, gender)
    row = prepare_intent(db, user.id, tier, NOW)

    assert row.gender == gender
    assert row.tier == tier
    assert row.price_kurus == price
    assert row.lidya == amount
    assert row.duration_days == days
    assert row.status == "prepared"

    db.commit()
    db.refresh(user)

    assert user.lidya == 100
    assert user.lidya_gem == 50
    assert count(db) == 1


def test_duplicate_is_idempotent(db):
    user = account(db)
    first = prepare_intent(db, user.id, "gold", NOW)
    second = prepare_intent(db, user.id, "gold", NOW)

    assert first.id == second.id
    assert count(db) == 1


def test_three_levels(db):
    user = account(db)

    for tier in ("bronze","silver","gold"):
        prepare_intent(db, user.id, tier, NOW)

    assert count(db) == 3
    assert user.lidya == 100


def test_account_isolation(db):
    first = account(db, "male")
    second = account(db, "female")

    a = prepare_intent(db, first.id, "gold", NOW)
    b = prepare_intent(db, second.id, "gold", NOW)

    assert a.id != b.id
    assert a.user_id != b.user_id
    assert a.gender != b.gender
    assert count(db) == 2


def test_gender_change_cannot_duplicate(db):
    user = account(db, "male")
    prepare_intent(db, user.id, "gold", NOW)

    user.gender = "female"
    db.commit()

    with pytest.raises(HTTPException) as error:
        prepare_intent(db, user.id, "gold", NOW)

    assert error.value.status_code == 409
    assert count(db) == 1


@pytest.mark.parametrize("age", [7, 30, -1])
def test_invalid_offer_window(db, age):
    user = account(db, age=age)

    with pytest.raises(HTTPException):
        prepare_intent(db, user.id, "gold", NOW)

    assert count(db) == 0


def test_inactive_user(db):
    user = account(db)
    user.is_active = False
    db.commit()

    with pytest.raises(HTTPException):
        prepare_intent(db, user.id, "gold", NOW)

    assert count(db) == 0


def test_unknown_tier(db):
    user = account(db)

    with pytest.raises(HTTPException):
        prepare_intent(db, user.id, "fake", NOW)

    assert count(db) == 0


def test_database_unique_constraint(db):
    user = account(db)

    first = prepare_intent(db, user.id, "gold", NOW)
    db.commit()

    duplicate = WelcomePurchase(
        id=str(uuid4()),
        user_id=user.id,
        tier="gold",
        gender="female",
        product_id=first.product_id,
        price_kurus=first.price_kurus,
        lidya=first.lidya,
        duration_days=30,
        status="prepared",
        offer_expires_at=NOW+timedelta(days=7),
    )

    db.add(duplicate)

    with pytest.raises(IntegrityError):
        db.flush()

    db.rollback()
    assert count(db) == 1


def test_transaction_rollback(db):
    user = account(db)
    prepare_intent(db, user.id, "gold", NOW)
    db.rollback()

    assert count(db) == 0
    assert user.lidya == 100


def test_sales_still_disabled(db):
    user = account(db)

    assert offer_status(
        user, NOW
    )["purchase_enabled"] is False
