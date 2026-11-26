from copy import deepcopy

import pytest

from backend.app import nobility_ranking as ranking


@pytest.fixture
def payload():
    return {
        "game": "wheel",
        "period": "hour",
        "limit": 50,
        "my_winnings": 500,
        "items": [
            {
                "rank": 1,
                "user_id": "normal",
                "winnings": 10000,
            },
            {
                "rank": 2,
                "user_id": "knight",
                "winnings": 5000,
            },
            {
                "rank": 3,
                "user_id": "expired",
                "winnings": 2000,
            },
        ],
    }


@pytest.fixture
def enable(monkeypatch):
    monkeypatch.setattr(
        ranking, "enabled", lambda: True
    )

    def appearance(db, viewer, target, at):
        assert viewer == "viewer"
        return (
            {"rank": 1, "privileges": ["badge", "frame"]}
            if target == "knight"
            else {"rank": 0, "privileges": []}
        )

    monkeypatch.setattr(
        ranking,
        "knight_follow_appearances",
        lambda db, viewer, ids, at: {
            uid: appearance(db, viewer, uid, at)
            for uid in ids
        },
    )


def test_ranking_order(payload, enable):
    out = ranking.knight_ranking(
        None, "viewer", payload
    )

    assert [r["rank"] for r in out["items"]] == [1, 2, 3]

    assert [
        r["user_id"] for r in out["items"]
    ] == ["normal", "knight", "expired"]


def test_winnings_unchanged(payload, enable):
    out = ranking.knight_ranking(
        None, "viewer", payload
    )

    assert [
        r["winnings"] for r in out["items"]
    ] == [10000, 5000, 2000]

    assert out["my_winnings"] == 500


def test_knight_visuals(payload, enable):
    out = ranking.knight_ranking(
        None, "viewer", payload
    )

    assert out["items"][1]["nobility"] == {
        "rank": 1,
        "privileges": ["badge", "frame"],
    }


def test_expired_visuals(payload, enable):
    out = ranking.knight_ranking(
        None, "viewer", payload
    )

    assert out["items"][2]["nobility"] == {
        "rank": 0,
        "privileges": [],
    }


def test_original_payload_unchanged(payload, enable):
    original = deepcopy(payload)

    ranking.knight_ranking(
        None, "viewer", payload
    )

    assert payload == original


@pytest.mark.parametrize(
    "period", ["hour", "day", "week", "month"]
)
def test_period_preserved(payload, enable, period):
    payload["period"] = period

    out = ranking.knight_ranking(
        None, "viewer", payload
    )

    assert out["period"] == period
    assert out["limit"] == 50


def test_disabled_system(payload, monkeypatch):
    monkeypatch.setattr(
        ranking, "enabled", lambda: False
    )

    def forbidden(*args):
        raise AssertionError("Unexpected lookup")

    monkeypatch.setattr(
        ranking,
        "knight_follow_appearances",
        forbidden,
    )

    assert ranking.knight_ranking(
        None, "viewer", payload
    ) == payload


def test_empty_ranking(payload, enable):
    payload["items"] = []

    out = ranking.knight_ranking(
        None, "viewer", payload
    )

    assert out["items"] == []
