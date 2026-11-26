"""LidyaChat nobility refund downgrade policy."""

from .nobility_config import get_rank_rule


def rank_after_refund(current_rank, valid_points):
    if type(current_rank) is not int:
        raise ValueError("Invalid rank")

    if current_rank not in (0, 1, 2, 3, 4):
        raise ValueError("Invalid rank")

    if type(valid_points) is not int:
        raise ValueError("Invalid points")

    if valid_points < 0:
        raise ValueError("Negative points")

    for rank in range(current_rank, 0, -1):
        rule = get_rank_rule(rank)

        if valid_points >= rule.required_points:
            return rank

    return 0
