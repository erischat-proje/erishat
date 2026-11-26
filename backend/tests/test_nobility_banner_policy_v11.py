from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from backend.app.nobility_banner_policy import (
    banner_scope,
    daily_key,
    authorized_banner,
    WELCOME_COOLDOWN_SECONDS,
)

EXPECTED = {
    "gift_banner": [None, "global", "global", "global", "global"],
    "activation_banner": [None, "room", "room", "global", "global"],
    "daily_banner": [None, None, None, "global", "global"],
    "room_welcome": [None, None, None, "room", "room"],
}


@pytest.mark.parametrize("kind", EXPECTED)
@pytest.mark.parametrize("rank", range(5))
def test_scope(kind, rank):
    assert banner_scope(rank, kind) == EXPECTED[kind][rank]


@pytest.mark.parametrize("rank", [-1, 5, 99, True, "4", None])
def test_invalid_rank(rank):
    assert banner_scope(rank, "gift_banner") is None


@pytest.mark.parametrize("kind", ["unknown", None, [], {}])
def test_invalid_kind(kind):
    assert banner_scope(4, kind) is None


@pytest.mark.parametrize("ghost", [True, None, 0, "false"])
def test_ghost_blocked(ghost):
    with patch(
        "backend.app.nobility_banner_policy.active_rank"
    ) as lookup:
        assert authorized_banner(
            None, "u1", "daily_banner", ghost=ghost
        ) is None
        lookup.assert_not_called()


@pytest.mark.parametrize("rank", range(5))
def test_server_rank(rank):
    with patch(
        "backend.app.nobility_banner_policy.active_rank",
        return_value=rank,
    ):
        result = authorized_banner(
            None, "u1", "daily_banner", ghost=False
        )

        if rank < 3:
            assert result is None
        else:
            assert result["rank"] == rank
            assert result["scope"] == "global"


def test_turkey_midnight():
    before = datetime(
        2026, 11, 25, 20, 59, 59,
        tzinfo=timezone.utc,
    )
    after = datetime(
        2026, 11, 25, 21, 0, 0,
        tzinfo=timezone.utc,
    )

    assert daily_key(before) == "2026-11-25"
    assert daily_key(after) == "2026-11-26"


def test_naive_time_rejected():
    with pytest.raises(ValueError):
        daily_key(datetime(2026, 11, 25))


def test_cooldown():
    assert WELCOME_COOLDOWN_SECONDS == 1800
