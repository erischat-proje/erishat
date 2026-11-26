"""Official LidyaChat nobility rank configuration."""

from dataclasses import dataclass
from types import MappingProxyType


@dataclass(frozen=True)
class RankRule:
    rank: int
    name: str
    required_points: int
    renewal_points: int
    duration_days: int


POINTS_PER_PAID_LIDYA = 1
RENEWAL_PERCENT = 25
DURATION_DAYS = 30

RANK_RULES = MappingProxyType({
    1: RankRule(
        1, "Şövalye", 400_000, 100_000, 30
    ),
    2: RankRule(
        2, "Kont", 800_000, 200_000, 30
    ),
    3: RankRule(
        3, "Dük", 1_600_000, 400_000, 30
    ),
    4: RankRule(
        4, "Kral", 3_200_000, 800_000, 30
    ),
})


def get_rank_rule(rank: int) -> RankRule:
    if type(rank) is not int or rank not in RANK_RULES:
        raise ValueError("Invalid nobility rank")

    return RANK_RULES[rank]
