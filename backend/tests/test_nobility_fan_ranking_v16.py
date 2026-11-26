from copy import deepcopy

import pytest

from backend.app import nobility_ranking as ranking


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(
        ranking, "enabled", lambda: True
    )

    def appearance(db, viewer, target, at):
        if target == "knight":
            return {
                "rank": 1,
                "privileges": ["badge", "frame"],
            }

        return {
            "rank": 0,
            "privileges": [],
        }

    monkeypatch.setattr(
        ranking,
        "knight_follow_appearances",
        lambda db, viewer, ids, at: {
            uid: appearance(db, viewer, uid, at)
            for uid in ids
        },
    )


def decorate(rows):
    return ranking.knight_ranking(
        None, "viewer", {"items": rows}
    )["items"]


def test_fan_order_preserved(enabled):
    rows = [
        {"rank": 1, "user_id": "normal"},
        {"rank": 2, "user_id": "knight"},
    ]

    result = decorate(rows)

    assert [r["rank"] for r in result] == [1, 2]


def test_gift_total_preserved(enabled):
    rows = [{
        "rank": 1,
        "user_id": "knight",
        "total_lidya": 500000,
    }]

    assert decorate(rows)[0]["total_lidya"] == 500000


def test_fan_level_preserved(enabled):
    rows = [{
        "user_id": "knight",
        "fan_level": 15,
    }]

    assert decorate(rows)[0]["fan_level"] == 15


def test_hidden_gift_total_stays_hidden(enabled):
    rows = [{
        "user_id": "knight",
        "gifts_hidden": True,
    }]

    row = decorate(rows)[0]

    assert row["gifts_hidden"] is True
    assert "total_lidya" not in row
    assert "fan_level" not in row


def test_knight_appearance(enabled):
    row = decorate([
        {"user_id": "knight"}
    ])[0]

    assert row["nobility"] == {
        "rank": 1,
        "privileges": ["badge", "frame"],
    }


def test_normal_appearance(enabled):
    row = decorate([
        {"user_id": "normal"}
    ])[0]

    assert row["nobility"]["rank"] == 0


def test_original_rows_unchanged(enabled):
    rows = [{
        "user_id": "knight",
        "total_lidya": 100,
    }]

    original = deepcopy(rows)

    decorate(rows)

    assert rows == original


def test_empty_fan_list(enabled):
    assert decorate([]) == []


def test_disabled_system(monkeypatch):
    monkeypatch.setattr(
        ranking, "enabled", lambda: False
    )

    rows = [{"user_id": "knight"}]

    assert decorate(rows) == rows


def test_full_fifty_user_list(enabled):
    rows = [
        {
            "rank": i+1,
            "user_id": str(i),
            "total_lidya": 100000-i,
        }
        for i in range(50)
    ]

    result = decorate(rows)

    assert len(result) == 50

    for original, updated in zip(rows, result):
        assert original["rank"] == updated["rank"]
        assert (
            original["total_lidya"]
            == updated["total_lidya"]
        )
