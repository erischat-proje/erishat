from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from backend.app import nobility_policy as policy


NOW = datetime(2026, 11, 27, tzinfo=timezone.utc)


class TestDatabase:
    __test__ = False

    def __init__(self, rank=2):
        self.member = SimpleNamespace(
            rank=rank,
            started_at=NOW-timedelta(days=1),
            expires_at=NOW+timedelta(days=1),
        )

        rule = policy.get_rank_rule(rank)

        self.config = SimpleNamespace(
            enabled=True,
            required_points=rule.required_points,
            renewal_points=rule.renewal_points,
            duration_days=rule.duration_days,
        )

    def get(self, model, key, **kwargs):
        if model is policy.NobilityMembership:
            return self.member

        if model is policy.NobilityRankConfig:
            return self.config

        raise AssertionError("Unexpected database request")


@pytest.fixture(autouse=True)
def enable_nobility(monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "true"
    )


def protected(db, at=NOW):
    return policy.has_privilege(
        db, "test-user", "kick_protection", at
    )


@pytest.mark.parametrize(
    "rank,expected",
    [(1, False), (2, True), (3, True), (4, True)]
)
def test_rank_protection(rank, expected):
    assert protected(TestDatabase(rank)) is expected


def test_count_expired():
    db = TestDatabase()
    db.member.expires_at = NOW-timedelta(seconds=1)

    assert not protected(db)


def test_count_exact_expiration():
    db = TestDatabase()
    db.member.expires_at = NOW

    assert not protected(db)


def test_count_before_expiration():
    db = TestDatabase()
    db.member.expires_at = NOW+timedelta(seconds=1)

    assert protected(db)


def test_future_membership():
    db = TestDatabase()
    db.member.started_at = NOW+timedelta(seconds=1)

    assert not protected(db)


def test_missing_membership():
    db = TestDatabase()
    db.member = None

    assert not protected(db)


def test_missing_rank_configuration():
    db = TestDatabase()
    db.config = None

    assert not protected(db)


def test_disabled_rank():
    db = TestDatabase()
    db.config.enabled = False

    assert not protected(db)


def test_disabled_system(monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    assert not protected(TestDatabase())


@pytest.mark.parametrize(
    "field",
    [
        "required_points",
        "renewal_points",
        "duration_days",
    ]
)
def test_invalid_configuration(field):
    db = TestDatabase()

    setattr(
        db.config, field,
        getattr(db.config, field)+1
    )

    assert not protected(db)


def test_visual_privileges_independent():
    db = TestDatabase()

    assert protected(db)

    assert "kick_protection" in (
        policy.privileges_for_rank(2)
    )


def test_count_cannot_super_kick():
    assert not policy.has_privilege(
        TestDatabase(2),
        "test-user",
        "super_kick",
        NOW,
    )


def test_king_super_kick_authorized():
    assert policy.has_privilege(
        TestDatabase(4),
        "test-user",
        "super_kick",
        NOW,
    )


def test_downgrade_removes_protection():
    db = TestDatabase(2)

    assert protected(db)

    knight = TestDatabase(1)
    db.member = knight.member
    db.config = knight.config

    assert not protected(db)


def test_renewal_keeps_protection():
    db = TestDatabase(2)
    db.member.expires_at = NOW

    assert not protected(db)

    db.member.expires_at = NOW+timedelta(days=30)

    assert protected(db)
