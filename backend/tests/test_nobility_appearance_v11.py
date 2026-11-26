import pytest
from unittest.mock import Mock
from types import SimpleNamespace
from datetime import datetime, timedelta, timezone
from backend.app import nobility_avatar

from backend.app import nobility_appearance as appearance


@pytest.mark.parametrize("rank,expected", [
    (0, []),
    (1, ["badge", "frame", "entrance"]),
    (2, ["badge", "frame", "entrance"]),
    (3, [
        "badge", "frame", "entrance",
        "region_background",
    ]),
    (4, [
        "badge", "frame", "entrance",
        "region_background",
        "room_frame", "super_avatar",
    ]),
])
def test_public_visual_privileges(monkeypatch, rank, expected):
    monkeypatch.setattr(
        appearance,
        "active_rank",
        lambda *args: rank,
    )

    db = Mock()
    db.get.return_value = None

    monkeypatch.setattr(
        nobility_avatar,
        "active_avatar",
        lambda *args: None,
    )

    result = appearance.public_appearance(db, "u1")

    assert result == {
        "rank": rank,
        "privileges": expected,
    }


@pytest.mark.parametrize("rank", [-1, 5, 99, None])
def test_invalid_rank_has_no_appearance(monkeypatch, rank):
    monkeypatch.setattr(
        appearance,
        "active_rank",
        lambda *args: rank,
    )

    assert appearance.public_appearance(None, "u1") == {
        "rank": 0,
        "privileges": [],
    }


def test_empty_user_has_no_appearance(monkeypatch):
    def forbidden(*args):
        pytest.fail("Empty user must not query membership")

    monkeypatch.setattr(
        appearance,
        "active_rank",
        forbidden,
    )

    assert appearance.public_appearance(None, None) == {
        "rank": 0,
        "privileges": [],
    }


def test_king_personal_animation(monkeypatch):
    db = Mock()
    db.get.return_value = None

    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=15)

    monkeypatch.setattr(
        appearance, "active_rank",
        lambda *args: 4,
    )

    avatar = SimpleNamespace(
        asset_id="test-avatar",
        expires_at=expires,
    )

    lookup = Mock(return_value=avatar)

    monkeypatch.setattr(
        nobility_avatar, "active_avatar", lookup,
    )

    result = appearance.public_appearance(
        db, "u1", now
    )

    assert result["rank"] == 4
    assert result["animated_avatar"] == {
        "asset_id": "test-avatar",
        "expires_at": expires.isoformat(),
    }

    lookup.assert_called_once_with(db, "u1", now)


def test_staff_animation_protection(monkeypatch):
    db = Mock()
    db.get.return_value = object()

    monkeypatch.setattr(
        appearance, "active_rank",
        lambda *args: 4,
    )

    lookup = Mock()

    monkeypatch.setattr(
        nobility_avatar, "active_avatar", lookup,
    )

    result = appearance.public_appearance(db, "u1")

    assert "animated_avatar" not in result
    lookup.assert_not_called()


@pytest.mark.parametrize("rank", [0, 1, 2, 3])
def test_lower_rank_cannot_show_animation(
    monkeypatch, rank
):
    db = Mock()

    monkeypatch.setattr(
        appearance, "active_rank",
        lambda *args: rank,
    )

    lookup = Mock()

    monkeypatch.setattr(
        nobility_avatar, "active_avatar", lookup,
    )

    result = appearance.public_appearance(db, "u1")

    assert "animated_avatar" not in result
    lookup.assert_not_called()
    db.get.assert_not_called()
