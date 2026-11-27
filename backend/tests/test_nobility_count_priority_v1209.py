import pytest

from backend.app import nobility_room_priority as priority
from backend.app import nobility_collection as collection


def row(uid, rank, privileges=None):
    return {
        "user_id": uid,
        "nobility": {
            "rank": rank,
            "privileges": (
                ["badge"] if privileges is None
                else privileges
            ),
        },
    }


def ids(rows):
    return [r["user_id"] for r in rows]


def test_count_correct_priority():
    rows = [
        row("normal", 0),
        row("knight", 1),
        row("king", 4),
        row("count", 2),
        row("duke", 3),
    ]

    assert ids(priority.order_room_members(rows)) == [
        "king", "duke", "count", "knight", "normal"
    ]


def test_equal_rank_stable_order():
    rows = [
        row("count1", 2),
        row("knight", 1),
        row("count2", 2),
        row("count3", 2),
    ]

    assert ids(priority.order_room_members(rows)) == [
        "count1", "count2", "count3", "knight"
    ]


def test_hidden_badge_keeps_priority():
    rows = [
        row("knight", 1),
        row("count", 2, []),
    ]

    assert ids(priority.order_room_members(rows)) == [
        "count", "knight"
    ]


@pytest.mark.parametrize(
    "rank", [None, -1, 5, 999, "2", True, 2.0]
)
def test_invalid_rank_has_no_priority(rank):
    rows = [
        row("invalid", rank),
        row("knight", 1),
    ]

    assert ids(priority.order_room_members(rows)) == [
        "knight", "invalid"
    ]


def test_missing_nobility_has_no_priority():
    rows = [
        {"user_id": "normal"},
        row("count", 2),
    ]

    assert ids(priority.order_room_members(rows)) == [
        "count", "normal"
    ]


def test_active_count_badge(monkeypatch):
    monkeypatch.setattr(
        priority, "active_rank",
        lambda *args: 2
    )

    monkeypatch.setattr(
        collection, "disabled_privileges",
        lambda *args: set()
    )

    assert priority.member_nobility(
        None, "test-user", None
    ) == {
        "rank": 2,
        "privileges": ["badge"]
    }


def test_count_badge_disabled(monkeypatch):
    monkeypatch.setattr(
        priority, "active_rank",
        lambda *args: 2
    )

    monkeypatch.setattr(
        collection, "disabled_privileges",
        lambda *args: {"badge"}
    )

    assert priority.member_nobility(
        None, "test-user", None
    ) == {
        "rank": 2,
        "privileges": []
    }


def test_inactive_membership_no_priority(monkeypatch):
    monkeypatch.setattr(
        priority, "active_rank",
        lambda *args: 0
    )

    assert priority.member_nobility(
        None, "test-user", None
    ) == {
        "rank": 0,
        "privileges": []
    }


def test_sort_does_not_mutate_input():
    rows = [
        row("normal", 0),
        row("count", 2),
    ]

    priority.order_room_members(rows)

    assert ids(rows) == ["normal", "count"]
