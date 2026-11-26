"""Nobility financial confirmation validation."""

import re
from hmac import compare_digest

from fastapi import HTTPException

from .nobility_config import get_rank_rule


REVISION_PATTERN = re.compile(r"[0-9a-f]{64}")
POINTS_PATTERN = re.compile(r"[1-9][0-9]{0,18}")

MAX_POINTS = 9223372036854775807

ACTIONS = frozenset({
    "activate",
    "upgrade",
    "renew",
})


def valid_revision(value):
    return (
        type(value) is str
        and REVISION_PATTERN.fullmatch(value) is not None
    )


def valid_cost(value):
    return (
        type(value) is str
        and POINTS_PATTERN.fullmatch(value) is not None
        and int(value) <= MAX_POINTS
    )


def expected_cost(action, rank):
    if action not in ACTIONS:
        raise ValueError("Invalid action")

    if type(rank) is not int or rank not in (1, 2, 3, 4):
        raise ValueError("Invalid rank")

    rule = get_rank_rule(rank)

    return str(
        rule.renewal_points
        if action == "renew"
        else rule.required_points
    )


def verify_confirmation(
    *,
    action,
    rank,
    confirmed_revision,
    confirmed_cost,
    current_revision,
):
    if not valid_revision(current_revision):
        raise RuntimeError("Invalid server revision")

    if not valid_revision(confirmed_revision):
        raise HTTPException(
            409,
            detail="confirmation_required",
        )

    if not valid_cost(confirmed_cost):
        raise HTTPException(
            409,
            detail="confirmation_required",
        )

    cost = expected_cost(action, rank)

    if confirmed_cost != cost:
        raise HTTPException(
            409,
            detail="price_changed",
        )

    if not compare_digest(
        confirmed_revision,
        current_revision,
    ):
        raise HTTPException(
            409,
            detail="stale_confirmation",
        )

    return cost
