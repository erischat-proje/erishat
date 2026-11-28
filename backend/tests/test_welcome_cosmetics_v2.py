from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from backend.app.welcome_cosmetics import (
    catalog,
    rewards_for,
    find_reward,
    entitlement_valid,
)

from backend.app.welcome_packages import PACKAGES

NOW = datetime(2026, 11, 28, tzinfo=timezone.utc)


def test_total_catalog():
    items = catalog()
    assert len(items) == 22
    assert len({x["asset_key"] for x in items}) == 22


@pytest.mark.parametrize("gender", ["male", "female"])
@pytest.mark.parametrize("tier,count,days", [
    ("bronze", 2, 7),
    ("silver", 4, 15),
    ("gold", 5, 30),
])
def test_collection(gender, tier, count, days):
    items = rewards_for(gender, tier)
    assert len(items) == count

    for item in items:
        assert item["gender"] == gender
        assert item["duration_days"] == days
        assert item["exclusive"]
        assert not item["shop_available"]
        assert not item["permanent"]
        assert not item["artwork_ready"]


def test_package_catalog_consistency():
    for package in PACKAGES:
        for gender in ("male", "female"):
            items = rewards_for(gender, package["id"])
            assert tuple(x["type"] for x in items) == package["cosmetics"]
            assert all(
                x["duration_days"] == package["duration_days"]
                for x in items
            )


def test_invalid_collection():
    assert rewards_for("unknown", "gold") == []
    assert rewards_for("male", "invalid") == []


def test_exclusive_title():
    titles = [i for i in catalog() if i["type"] == "title"]
    assert len(titles) == 2
    assert all(i["tier"] == "gold" for i in titles)


def test_animated_frame():
    frames = [i for i in catalog() if i["animated"]]
    assert len(frames) == 2
    assert all(i["type"] == "frame" for i in frames)


@pytest.mark.parametrize("item", catalog())
def test_entitlement_security(item):
    user = SimpleNamespace(
        id="owner",
        gender=item["gender"],
        is_active=True,
    )

    lease = SimpleNamespace(
        user_id="owner",
        cosmetic_type=item["type"],
        asset_key=item["asset_key"],
        expires_at=NOW + timedelta(days=1),
    )

    assert entitlement_valid(user, lease, NOW)

    lease.user_id = "other"
    assert not entitlement_valid(user, lease, NOW)
    lease.user_id = "owner"

    user.gender = (
        "female" if item["gender"] == "male" else "male"
    )
    assert not entitlement_valid(user, lease, NOW)
    user.gender = item["gender"]

    user.is_active = False
    assert not entitlement_valid(user, lease, NOW)
    user.is_active = True

    lease.expires_at = NOW
    assert not entitlement_valid(user, lease, NOW)

    lease.expires_at = NOW - timedelta(seconds=1)
    assert not entitlement_valid(user, lease, NOW)

    lease.expires_at = NOW + timedelta(days=1)
    lease.asset_key = "fake-reward"
    assert not entitlement_valid(user, lease, NOW)


def test_no_shop_catalog_leak():
    from backend.app.cosmetics import catalog as shop_catalog

    welcome_keys = {i["asset_key"] for i in catalog()}
    shop_keys = {i["asset_key"] for i in shop_catalog()}

    assert welcome_keys.isdisjoint(shop_keys)
