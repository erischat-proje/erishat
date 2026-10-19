"""Single source of truth for DM and room gift payouts."""
import secrets

def gift_payout(gross: int) -> int:
    """25% withheld, 75% basis, randomized 0..200% of gross.

    Gifts below 10 Lidya never pay out. The distribution is uniform
    in integer Lidya over the allowed range, including bonus payouts.
    """
    if type(gross) is not int or gross < 0:
        raise ValueError("Invalid gift amount")
    if gross < 10:
        return 0
    base = gross - gross // 4
    bonus_headroom = 2 * gross - base
    return secrets.randbelow(base + bonus_headroom + 1)
