"""Internal welcome appearance selection and expiry enforcement."""
import os
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select

from .models import User
from .platform_models import VipStatus
from .welcome_inventory import inventory, is_welcome_key
from .welcome_cosmetics import find_reward
from . import staff_identity


COLUMNS = {
    "frame": "frame_asset",
    "bubble": "bubble_asset",
    "profile": "profile_asset",
    "title": "title_asset",
}


def enabled():
    return os.getenv(
        "LIDYACHAT_WELCOME_APPEARANCE_ENABLED",
        "false",
    ).strip().lower() == "true"


def locked_user(db, user_id):
    user = db.scalar(
        select(User)
        .where(User.id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if user is None:
        raise HTTPException(404, "Account not found")

    return user


def active_keys(db, user, now=None):
    if not enabled():
        return set()

    return {
        (item["type"], item["asset_key"])
        for item in inventory(db, user, now)
    }


def select_reward(db, user_id, kind, key, now=None):
    # Internal service only. Caller owns transaction.
    if not enabled():
        raise HTTPException(503, "Appearance disabled")

    if not find_reward(key, kind):
        raise HTTPException(404, "Reward not found")

    user = locked_user(db, user_id)

    if not user.is_active:
        raise HTTPException(403, "Inactive account")

    if staff_identity.role_for(user):
        raise HTTPException(403, "Management identity locked")

    if kind == "frame":
        from .dealer_routes import require_role_cosmetics_unlocked
        require_role_cosmetics_unlocked(db, user.id)

    if (kind, key) not in active_keys(db, user, now):
        raise HTTPException(403, "Reward not available")

    if kind == "entrance":
        status = db.get(VipStatus, user.id)

        if status is None:
            status = VipStatus(
                user_id=user.id,
                level=0,
                total_spent=0,
            )
            db.add(status)

        status.entry_effect = key

    else:
        setattr(user, COLUMNS[kind], key)

    db.flush()

    return {
        "ok": True,
        "cosmetic_type": kind,
        "asset_key": key,
    }


def clear_invalid(db, user_id, now=None):
    """Clear only invalid welcome selections; preserve other cosmetics."""
    now = now or datetime.now(timezone.utc)
    user = locked_user(db, user_id)

    allowed = active_keys(db, user, now)
    removed = []

    for kind, column in COLUMNS.items():
        if kind == "frame" and staff_identity.role_for(user):
            continue

        key = getattr(user, column, None)

        if (
            is_welcome_key(key)
            and (kind, key) not in allowed
        ):
            setattr(user, column, None)
            removed.append(kind)

    status = db.get(VipStatus, user.id)

    if status:
        key = status.entry_effect

        if (
            is_welcome_key(key)
            and ("entrance", key) not in allowed
        ):
            status.entry_effect = None
            removed.append("entrance")

    db.flush()

    return removed


def cleanup_if_selected(db, user, now=None):
    """Avoid entitlement queries for ordinary appearances."""

    has_selection = any(
        is_welcome_key(getattr(user, column, None))
        for column in COLUMNS.values()
    )

    if not has_selection:
        status = db.get(VipStatus, user.id)

        has_selection = bool(
            status and is_welcome_key(
                status.entry_effect
            )
        )

    if not has_selection:
        return []

    db.flush()

    return clear_invalid(db, user.id, now)
