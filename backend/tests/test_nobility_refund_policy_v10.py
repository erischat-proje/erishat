"""Nobility refund rank boundary tests."""

import pytest

from backend.app.nobility_refund_policy import (
    rank_after_refund,
)


@pytest.mark.parametrize("points,expected", [
    (3200000, 4),
    (3199999, 3),
    (1600000, 3),
    (1599999, 2),
    (800000, 2),
    (799999, 1),
    (400000, 1),
    (399999, 0),
    (0, 0),
])
def test_rank_boundaries(points, expected):
    assert rank_after_refund(4, points) == expected


@pytest.mark.parametrize("rank", [0, 1, 2, 3, 4])
def test_refund_never_upgrades(rank):
    assert rank_after_refund(rank, 9000000) == rank


@pytest.mark.parametrize("rank,points", [
    (-1, 100),
    (5, 100),
    (True, 100),
    ("4", 100),
    (4, -1),
    (4, True),
    (4, 1.5),
    (4, "3200000"),
])
def test_invalid_input(rank, points):
    with pytest.raises(ValueError):
        rank_after_refund(rank, points)
