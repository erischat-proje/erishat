"""Server-authorized nobility banner policy."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from .nobility_policy import active_rank

RULES = {
    "gift_banner": 1,
    "activation_banner": 1,
    "daily_banner": 3,
    "room_welcome": 3,
}

RANK_NAMES = {
    1: "Şövalye",
    2: "Kont",
    3: "Dük",
    4: "Kral",
}

WELCOME_COOLDOWN_SECONDS = 1800
LOCAL_TIMEZONE = ZoneInfo("Europe/Istanbul")


def banner_scope(rank, kind):
    if type(rank) is not int or rank not in RANK_NAMES:
        return None

    if not isinstance(kind, str):
        return None

    minimum = RULES.get(kind)

    if minimum is None or rank < minimum:
        return None

    if kind == "room_welcome":
        return "room"

    if kind == "activation_banner":
        return "global" if rank >= 3 else "room"

    return "global"


def daily_key(at=None):
    now = at or datetime.now(timezone.utc)

    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("Timezone required")

    return now.astimezone(LOCAL_TIMEZONE).date().isoformat()


def authorized_banner(db, user_id, kind, *, ghost, at=None):
    if ghost is not False or not user_id:
        return None

    rank = active_rank(db, user_id, at)
    scope = banner_scope(rank, kind)

    if scope is None:
        return None

    return {
        "type": "nobility_banner",
        "kind": kind,
        "rank": rank,
        "rank_name": RANK_NAMES[rank],
        "scope": scope,
    }
