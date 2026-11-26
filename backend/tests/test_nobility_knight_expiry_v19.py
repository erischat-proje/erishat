from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from backend.app.nobility_config import get_rank_rule

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityRankConfig,
)

from backend.app.nobility_policy import (
    PRIVILEGES,
    active_rank,
    has_privilege,
    privileges_for_rank,
)

from backend.app.nobility_appearance import (
    public_appearance,
)

from backend.app.nobility_banner_policy import (
    authorized_banner,
)

from backend.app.nobility_room_priority import (
    member_nobility,
)

from backend.app.nobility_follow_appearance import (
    knight_follow_appearance,
)


START = datetime(
    2026, 11, 1, 12, 0,
    tzinfo=timezone.utc,
)

END = START + timedelta(days=30)

KNIGHT_PRIVILEGES = (
    "badge",
    "frame",
    "entrance",
    "online_priority",
    "gift_banner",
    "activation_banner",
)

EMPTY = {"rank": 0, "privileges": []}


@pytest.fixture
def state(monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "true"
    )

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_PAID_POINTS_ENABLED",
        "false",
    )

    member = SimpleNamespace(
        user_id="knight",
        rank=1,
        points=100000,
        started_at=START,
        expires_at=END,
    )

    config = SimpleNamespace(
        rank=1,
        enabled=True,
        required_points=400000,
        renewal_points=100000,
        duration_days=30,
    )

    db = Mock()
    db.scalars.return_value.all.return_value = []

    def get(model, key, **kwargs):
        if model is NobilityMembership:
            return member if key == "knight" else None

        if model is NobilityRankConfig:
            return config if key == 1 else None

        return None

    db.get.side_effect = get
    db.scalar.return_value = None

    return db, member, config


def test_official_knight_configuration():
    rule = get_rank_rule(1)

    assert rule.required_points == 400000
    assert rule.renewal_points == 100000
    assert rule.duration_days == 30


def test_exact_six_privileges():
    assert set(
        privileges_for_rank(1)
    ) == set(KNIGHT_PRIVILEGES)


@pytest.mark.parametrize(
    "privilege", KNIGHT_PRIVILEGES
)
def test_active_knight_privilege(state, privilege):
    db, _, _ = state

    assert has_privilege(
        db, "knight", privilege, START
    )


@pytest.mark.parametrize(
    "privilege", KNIGHT_PRIVILEGES
)
def test_expired_knight_privilege(state, privilege):
    db, _, _ = state

    assert not has_privilege(
        db, "knight", privilege, END
    )


@pytest.mark.parametrize(
    "privilege",
    [
        name for name, rank in PRIVILEGES.items()
        if rank > 1
    ],
)
def test_higher_rank_privilege_denied(
    state, privilege
):
    db, _, _ = state

    assert not has_privilege(
        db, "knight", privilege, START
    )


@pytest.mark.parametrize(
    "at,expected",
    [
        (START-timedelta(microseconds=1), 0),
        (START, 1),
        (END-timedelta(microseconds=1), 1),
        (END, 0),
        (END+timedelta(microseconds=1), 0),
    ],
)
def test_expiry_boundary(state, at, expected):
    db, _, _ = state

    assert active_rank(
        db, "knight", at
    ) == expected


@pytest.mark.parametrize(
    "field,value",
    [
        ("started_at", None),
        ("expires_at", None),
        ("expires_at", START),
        ("expires_at", START-timedelta(days=1)),
    ],
)
def test_invalid_membership_dates(
    state, field, value
):
    db, member, _ = state

    setattr(member, field, value)

    assert active_rank(
        db, "knight", START
    ) == 0


@pytest.mark.parametrize(
    "field,value",
    [
        ("enabled", False),
        ("required_points", 1),
        ("renewal_points", 1),
        ("duration_days", 999),
    ],
)
def test_invalid_configuration_denied(
    state, field, value
):
    db, _, config = state

    setattr(config, field, value)

    assert active_rank(
        db, "knight", START
    ) == 0


def test_global_switch_disabled(state, monkeypatch):
    db, _, _ = state

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    assert active_rank(
        db, "knight", START
    ) == 0


def test_no_membership(state):
    db, _, _ = state

    assert active_rank(
        db, "unknown", START
    ) == 0


def test_profile_appearance_before_expiry(state):
    db, _, _ = state

    assert public_appearance(
        db, "knight", START
    ) == {
        "rank": 1,
        "privileges": [
            "badge", "frame", "entrance"
        ],
    }


def test_profile_appearance_after_expiry(state):
    db, _, _ = state

    assert public_appearance(
        db, "knight", END
    ) == EMPTY


def test_online_priority_after_expiry(state):
    db, _, _ = state

    assert member_nobility(
        db, "knight", END
    ) == EMPTY


def test_follow_appearance_after_expiry(state):
    db, _, _ = state

    assert knight_follow_appearance(
        db, "viewer", "knight", END
    ) == EMPTY


@pytest.mark.parametrize(
    "kind", ["gift_banner", "activation_banner"]
)
def test_banner_before_expiry(state, kind):
    db, _, _ = state

    result = authorized_banner(
        db, "knight", kind,
        ghost=False,
        at=START,
    )

    assert result["rank"] == 1


@pytest.mark.parametrize(
    "kind", ["gift_banner", "activation_banner"]
)
def test_banner_after_expiry(state, kind):
    db, _, _ = state

    assert authorized_banner(
        db, "knight", kind,
        ghost=False,
        at=END,
    ) is None


def test_expiry_preserves_remaining_points(state):
    db, member, _ = state

    assert active_rank(
        db, "knight", END
    ) == 0

    assert member.points == 100000


def test_expiry_does_not_modify_membership(state):
    db, member, _ = state

    before = vars(member).copy()

    active_rank(db, "knight", END)

    assert vars(member) == before
    db.commit.assert_not_called()
    db.delete.assert_not_called()
