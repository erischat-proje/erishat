"""Server-side LidyaChat nobility authorization."""

import os
from datetime import datetime, timezone
from types import MappingProxyType

from .nobility_config import get_rank_rule
from .nobility_models import (
    NobilityMembership,
    NobilityRankConfig,
)

RANK_NAMES = MappingProxyType({
    0: "Asaletsiz",
    1: "Şövalye",
    2: "Kont",
    3: "Dük",
    4: "Kral",
})

PRIVILEGES = MappingProxyType({
    "badge": 1,
    "frame": 1,
    "entrance": 1,
    "online_priority": 1,
    "gift_banner": 1,
    "activation_banner": 1,

    "kick_protection": 2,
    "gift_bonus": 2,

    "region_background": 3,
    "daily_banner": 3,
    "room_welcome": 3,

    "room_frame": 4,
    "super_avatar": 4,
    "animated_avatar": 4,
    "couple_repair": 4,
    "super_kick": 4,
})


def enabled():
    return os.getenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    ).strip().lower() == "true"


def paid_points_enabled():
    return enabled() and os.getenv(
        "LIDYACHAT_NOBILITY_PAID_POINTS_ENABLED",
        "false",
    ).strip().lower() == "true"


def utc(value):
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def effective_rank(member, at=None):
    if member is None:
        return 0

    rank = int(member.rank or 0)

    if rank not in (1, 2, 3, 4):
        return 0

    started = utc(member.started_at)
    expires = utc(member.expires_at)
    at = utc(at) or datetime.now(timezone.utc)

    if not started or not expires:
        return 0

    if expires <= started:
        return 0

    if not started <= at < expires:
        return 0

    return rank


def privileges_for_rank(rank):
    if rank not in (1, 2, 3, 4):
        return ()

    return tuple(
        key for key, required in PRIVILEGES.items()
        if rank >= required
    )


def authorized_rank_for_member(
    db,
    member,
    *,
    system_enabled,
    at=None,
):
    if not system_enabled:
        return 0

    rank = effective_rank(member, at)

    if not rank:
        return 0

    config = db.get(NobilityRankConfig, rank, populate_existing=True)

    if config is None or not config.enabled:
        return 0

    rule = get_rank_rule(rank)

    if (
        config.required_points != rule.required_points
        or config.renewal_points != rule.renewal_points
        or config.duration_days != rule.duration_days
    ):
        return 0

    return rank


def active_rank(db, user_id, at=None):
    system_enabled = enabled()

    if not system_enabled:
        return 0

    member = db.get(
        NobilityMembership,
        user_id,
        populate_existing=True,
    )

    return authorized_rank_for_member(
        db,
        member,
        system_enabled=system_enabled,
        at=at,
    )


def has_privilege(db, user_id, privilege, at=None):
    required = PRIVILEGES.get(privilege)

    if required is None:
        return False

    return active_rank(db, user_id, at) >= required
