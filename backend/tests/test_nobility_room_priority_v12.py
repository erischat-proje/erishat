from datetime import datetime, timezone
from unittest.mock import Mock

import pytest

from backend.app import nobility_room_priority as priority


@pytest.mark.parametrize("rank", range(5))
def test_authorized_rank(monkeypatch, rank):
    monkeypatch.setattr(
        priority, "active_rank",
        lambda *args: rank
    )

    result = priority.member_nobility(
        Mock(), "user1",
        datetime.now(timezone.utc)
    )

    assert result["rank"] == rank
    assert result["privileges"] == (
        ["badge"] if rank else []
    )


@pytest.mark.parametrize(
    "rank", [-1, 5, 99, True, "4", None]
)
def test_invalid_rank(monkeypatch, rank):
    monkeypatch.setattr(
        priority, "active_rank",
        lambda *args: rank
    )

    result = priority.member_nobility(
        Mock(), "user1",
        datetime.now(timezone.utc)
    )

    assert result == {
        "rank": 0,
        "privileges": []
    }


def test_rank_order():
    rows = [
        {"nobility": {"rank": rank}}
        for rank in (0, 1, 4, 2, 3)
    ]

    ordered = priority.order_room_members(rows)

    assert [
        row["nobility"]["rank"]
        for row in ordered
    ] == [4, 3, 2, 1, 0]


def test_equal_rank_stability():
    rows = [
        {"id": "a", "nobility": {"rank": 1}},
        {"id": "b", "nobility": {"rank": 1}},
        {"id": "c", "nobility": {"rank": 1}},
    ]

    assert priority.order_room_members(rows) == rows


def test_management_role_preserved():
    rows = [
        {"role": "owner", "nobility": {"rank": 0}},
        {"role": "moderator", "nobility": {"rank": 1}},
        {"role": "user", "nobility": {"rank": 4}},
    ]

    ordered = priority.order_room_members(rows)

    assert [r["role"] for r in ordered] == [
        "user", "moderator", "owner"
    ]

    assert ordered[2]["role"] == "owner"


def test_missing_rank():
    rows = [
        {"id": "normal"},
        {"id": "knight", "nobility": {"rank": 1}}
    ]

    assert priority.order_room_members(rows)[0]["id"] == "knight"


def test_empty_room():
    assert priority.order_room_members([]) == []
