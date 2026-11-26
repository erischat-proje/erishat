"""Single source of truth for normal DM and room gift payouts."""

import secrets
from datetime import datetime, timezone
from types import MappingProxyType

MINIMUM_PERCENT = MappingProxyType({
    0: 0,
    1: 0,
    2: 66,
    3: 67,
    4: 70,
})


def gift_payout(gross: int, *, rank: int = 0) -> int:
    """Uniform integer payout within the authorized rank range."""

    if type(gross) is not int or gross < 0:
        raise ValueError("Invalid gift amount")

    if type(rank) is not int or rank not in MINIMUM_PERCENT:
        raise ValueError("Invalid nobility rank")

    if gross < 10:
        return 0

    percent = MINIMUM_PERCENT[rank]

    # Ceiling division guarantees the minimum percentage.
    minimum = (gross * percent + 99) // 100

    return minimum + secrets.randbelow(
        gross - minimum + 1
    )


def recipient_gift_payout(db, recipient_id, gross, *, at=None):
    """Resolve the recipient entitlement inside the gift transaction."""

    from .nobility_policy import active_rank

    if type(gross) is not int or gross < 0:
        raise ValueError("Invalid gift amount")

    if gross < 10:
        return 0

    at = at if at is not None else datetime.now(timezone.utc)

    if at.tzinfo is None or at.utcoffset() is None:
        raise ValueError("Timezone required")

    rank = active_rank(db, recipient_id, at)

    return gift_payout(gross, rank=rank)
