import pytest

from backend.app.nobility_config import (
    RANK_RULES,
    POINTS_PER_PAID_LIDYA,
    RENEWAL_PERCENT,
    DURATION_DAYS,
    get_rank_rule,
)


@pytest.mark.parametrize(
    "rank,required,renewal",
    [
        (1, 400_000, 100_000),
        (2, 800_000, 200_000),
        (3, 1_600_000, 400_000),
        (4, 3_200_000, 800_000),
    ],
)
def test_official_rank_prices(rank, required, renewal):
    rule = get_rank_rule(rank)

    assert rule.required_points == required
    assert rule.renewal_points == renewal
    assert rule.duration_days == 30
    assert renewal * 4 == required


def test_point_conversion():
    assert POINTS_PER_PAID_LIDYA == 1


def test_renewal_percentage():
    assert RENEWAL_PERCENT == 25


def test_duration():
    assert DURATION_DAYS == 30


def test_rank_count():
    assert len(RANK_RULES) == 4


@pytest.mark.parametrize(
    "rank", [0, -1, 5, 99, True, "1", 1.0, None]
)
def test_invalid_rank(rank):
    with pytest.raises(ValueError):
        get_rank_rule(rank)


def test_rank_configuration_immutable():
    with pytest.raises(TypeError):
        RANK_RULES[5] = RANK_RULES[4]


def test_rank_rule_immutable():
    with pytest.raises(AttributeError):
        RANK_RULES[1].required_points = 1


def test_rank_prices_double():
    for rank in range(2, 5):
        assert (
            RANK_RULES[rank].required_points
            == RANK_RULES[rank - 1].required_points * 2
        )
