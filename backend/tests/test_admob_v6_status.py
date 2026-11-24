"""AdMob V6 authenticated status tests."""
from types import SimpleNamespace

import pytest
from backend.app import admob_reward_routes as ads


def status_for(user_id):
    path = "/v1/admob/status"

    # register_auth() endpointleri dinamik olarak kaydeder.
    if not any(
        getattr(route, "path", None) == path
        for route in ads.router.routes
    ):
        ads.register_auth(lambda: None)

    matches = [
        route for route in ads.router.routes
        if getattr(route, "path", None) == path
        and "GET" in getattr(route, "methods", set())
    ]

    assert len(matches) == 1, (
        "AdMob status endpoint kaydi bulunamadi: "
        + str([r.path for r in ads.router.routes])
    )

    return matches[0].endpoint(SimpleNamespace(id=user_id))

@pytest.fixture(autouse=True)
def safe_defaults(monkeypatch):
    monkeypatch.setenv("LIDYACHAT_ADMOB_REWARDS_ENABLED", "false")
    monkeypatch.setenv("LIDYACHAT_ADMOB_SSV_VERIFY_ONLY", "true")
    monkeypatch.setenv("LIDYACHAT_ADMOB_PREVIEW_CLAIMS_ENABLED", "true")
    monkeypatch.setenv(
        "LIDYACHAT_ADMOB_PREVIEW_USER_IDS",
        "authorized-test-user"
    )


def test_authorized_preview_account():
    data = status_for("authorized-test-user")
    assert data["mode"] == "preview"
    assert data["preview_allowed"] is True
    assert data["rewards_enabled"] is False
    assert data["reward_amount"] == 5
    assert data["daily_limit"] == 5


def test_other_account_disabled():
    data = status_for("other-user")
    assert data["mode"] == "disabled"
    assert data["preview_allowed"] is False
    assert data["rewards_enabled"] is False


def test_preview_global_switch_off(monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_ADMOB_PREVIEW_CLAIMS_ENABLED", "false"
    )
    data = status_for("authorized-test-user")
    assert data["mode"] == "disabled"


def test_preview_requires_ssv(monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_ADMOB_SSV_VERIFY_ONLY", "false"
    )
    data = status_for("authorized-test-user")
    assert data["mode"] == "disabled"


def test_no_preview_whitelist(monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_ADMOB_PREVIEW_USER_IDS", ""
    )
    data = status_for("authorized-test-user")
    assert data["mode"] == "disabled"


def test_live_mode_is_separate(monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_ADMOB_REWARDS_ENABLED", "true"
    )
    data = status_for("authorized-test-user")
    assert data["mode"] == "live"
    assert data["rewards_enabled"] is True
    assert data["preview_allowed"] is False
