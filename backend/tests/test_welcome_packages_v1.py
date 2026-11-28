from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from backend.app.welcome_packages import (
    PACKAGES, offer_status
)

NOW = datetime(2026, 11, 28, tzinfo=timezone.utc)


def user(age=0, active=True, completed=True, gender="male"):
    return SimpleNamespace(
        created_at=NOW-timedelta(days=age),
        is_active=active,
        gender=gender,
        profile_completed=completed,
    )


def test_catalog():
    assert len(PACKAGES) == 3
    assert len({p["product_id"] for p in PACKAGES}) == 3
    assert [p["lidya"] for p in PACKAGES] == [
        6000, 14000, 28000
    ]
    assert [p["price_kurus"] for p in PACKAGES] == [
        9999, 24999, 49999
    ]
    assert sum(p["lidya"] for p in PACKAGES) == 48000
    assert sum(p["price_kurus"] for p in PACKAGES) == 84997


@pytest.mark.parametrize("age,expected", [
    (0, True),
    (1, True),
    (6, True),
    (6.999, True),
    (7, False),
    (30, False),
    (-1, False),
])
def test_eligibility(age, expected):
    result = offer_status(user(age), NOW)
    assert result["eligible_for_offer"] == expected
    assert bool(result["packages"]) == expected
    assert result["purchase_enabled"] is False


@pytest.mark.parametrize("active,completed", [
    (False, True),
    (True, False),
    (False, False),
])
def test_invalid_accounts(active, completed):
    result = offer_status(
        user(active=active, completed=completed), NOW
    )
    assert not result["eligible_for_offer"]
    assert result["packages"] == []


def test_purchase_disabled():
    result = offer_status(user(), NOW)
    assert result["purchase_enabled"] is False
    assert all(
        p["purchase_limit"] == 1
        for p in result["packages"]
    )


def test_countdown():
    result = offer_status(user(6), NOW)
    assert result["remaining_seconds"] == 86400


def test_economy_protection():
    reference = [(105,6045),(305,16623),(504,27202)]
    for p, (price, amount) in zip(PACKAGES, reference):
        normal_rate = amount / price
        welcome_rate = p["lidya"] / (p["price_kurus"]/100)
        assert welcome_rate <= normal_rate * 1.05


@pytest.mark.parametrize("gender", ["male", "female"])
def test_gender_collection(gender):
    result = offer_status(user(gender=gender), NOW)
    assert result["eligible_for_offer"]
    assert result["collection"] == gender
    assert len(result["packages"]) == 3

    for package in result["packages"]:
        assert package["collection"] == gender
        assert package["collection_id"].startswith(
            f"welcome_{gender}_"
        )
        for reward in package["cosmetic_rewards"]:
            assert reward["asset_key"].startswith(
                f"welcome_{gender}_"
            )


@pytest.mark.parametrize("gender", [
    None, "", "unspecified", "unknown"
])
def test_invalid_gender(gender):
    result = offer_status(user(gender=gender), NOW)
    assert not result["eligible_for_offer"]
    assert not result["packages"]
    assert not result["purchase_enabled"]


def test_equal_package_value():
    male = offer_status(user(gender="male"), NOW)
    female = offer_status(user(gender="female"), NOW)

    for m, f in zip(male["packages"], female["packages"]):
        for key in (
            "price_kurus", "lidya", "duration_days",
            "purchase_limit", "product_id"
        ):
            assert m[key] == f[key]

        assert m["collection_id"] != f["collection_id"]
        assert m["name"] != f["name"]

        male_assets = {
            x["asset_key"] for x in m["cosmetic_rewards"]
        }
        female_assets = {
            x["asset_key"] for x in f["cosmetic_rewards"]
        }

        assert len(male_assets) == len(female_assets)
        assert male_assets.isdisjoint(female_assets)
