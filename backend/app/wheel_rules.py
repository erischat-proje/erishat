"""Lidya wheel v4. Integer weights; multipliers describe total wallet credits."""
import secrets
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

VERSION = 4
STAKES = (10, 100, 1_000, 10_000, 100_000)
SYMBOLS = ('rose', 'heart', 'star', 'diamond', 'crown', 'fire', 'gem', 'jackpot')
MULTIPLIERS = dict(zip(SYMBOLS, (5, 5, 5, 5, 15, 25, 45, 60)))
WEIGHTS = dict(zip(SYMBOLS, (2200, 2200, 2200, 2200, 700, 300, 150, 50)))
LEGACY_MULTIPLIERS = dict(rose=1.5, heart=2, star=2.5, diamond=3, crown=3.5, gift=4, fire=4.5, gem=5, jackpot=6)
LEGACY_WEIGHTS = dict(rose=24, heart=20, star=16, diamond=12, crown=9, gift=7, fire=5, gem=4, jackpot=3)
LEGACY_STAKES = (10,25,50,75,100,250,500,1000)
PERIODS = ('hour', 'day', 'week', 'month')
LOCAL = ZoneInfo('Europe/Istanbul')


def choose(weights=WEIGHTS, randbelow=secrets.randbelow):
    roll = randbelow(sum(weights.values()))
    for key, weight in weights.items():
        if roll < weight:
            return key
        roll -= weight
    raise ValueError('Invalid random draw')


def payout(choice, result, amount, multipliers=MULTIPLIERS):
    if choice != result:
        return 0
    # Legacy half multipliers are exact halves, not fractional wallet mutations.
    return int(amount * multipliers.get(result, 0))


def period_bounds(period, now=None):
    if period not in PERIODS:
        raise ValueError('Unknown ranking period')
    local = (now or datetime.now(timezone.utc)).astimezone(LOCAL)
    if period == 'hour':
        start = local.replace(minute=0, second=0, microsecond=0)
        end = start + timedelta(hours=1)
    elif period == 'day':
        start = local.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
    elif period == 'week':
        start = local.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=local.weekday())
        end = start + timedelta(days=7)
    else:
        start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = start.replace(year=start.year+1, month=1) if start.month == 12 else start.replace(month=start.month+1)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)
