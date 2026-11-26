"""Server-authorized nobility collection preferences."""

import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select

from .nobility_models import (
    NobilityMembership,
    NobilityVisualPreference,
    NobilityAuditLog,
)
from .nobility_policy import (
    active_rank,
    RANK_NAMES,
    PRIVILEGES,
    utc,
)
from . import staff_identity

RANK_KEYS = {
    1: "knight",
    2: "count",
    3: "duke",
    4: "king",
}

VISUAL_ITEMS = {
    "badge": (
        "nobility_badge",
        "Asalet Rozeti",
        "badge.png",
    ),
    "frame": (
        "frame",
        "Profil Çerçevesi",
        "frame.png",
    ),
    "entrance": (
        "entrance",
        "Oda Giriş Efekti",
        "entrance-thumb.png",
    ),
    "gift_banner": (
        "nobility_banner",
        "Özel Hediye Afişi",
        "gift-banner.png",
    ),
    "region_background": (
        "profile",
        "Bölge Arka Planı",
        "region-background.png",
    ),
    "room_frame": (
        "nobility_room_frame",
        "Oda Kartı Çerçevesi",
        "room-frame.png",
    ),
    "super_avatar": (
        "avatar",
        "Süper Avatar",
        "super-avatar.png",
    ),
}

STAFF_PROTECTED = {"frame", "super_avatar"}


def disabled_privileges(db, user_id, rank):
    if rank not in RANK_KEYS:
        return set()

    return set(db.scalars(
        select(NobilityVisualPreference.privilege)
        .where(
            NobilityVisualPreference.user_id == user_id,
            NobilityVisualPreference.rank == rank,
            NobilityVisualPreference.enabled.is_(False),
        )
    ).all())


def visual_enabled(db, user_id, rank, privilege):
    if (
        rank not in RANK_KEYS
        or privilege not in VISUAL_ITEMS
        or rank < PRIVILEGES[privilege]
    ):
        return False

    return privilege not in disabled_privileges(
        db, user_id, rank
    )


def earned_ranks(db, user_id, member):
    result = {}

    rows = db.scalars(
        select(NobilityAuditLog)
        .where(
            NobilityAuditLog.user_id == user_id,
            NobilityAuditLog.action.in_((
                "rank_activation",
                "rank_upgrade",
                "rank_renewal",
            )),
        )
        .order_by(
            NobilityAuditLog.created_at,
            NobilityAuditLog.id,
        )
    ).all()

    for row in rows:
        try:
            state = json.loads(row.after_state)

            if not isinstance(state, dict):
                continue

            rank = state.get("rank")

            if type(rank) is not int:
                continue

            if rank not in RANK_KEYS:
                continue

            expires = utc(datetime.fromisoformat(
                state["expires_at"]
            ))

            previous = result.get(rank)

            if previous is None or expires > previous:
                result[rank] = expires

        except (
            ValueError,
            TypeError,
            KeyError,
            OverflowError,
        ):
            continue

    if member is not None:
        rank = member.rank

        if rank in RANK_KEYS:
            result[rank] = utc(member.expires_at)

    return result


def inventory(db, user):
    member = db.get(
        NobilityMembership,
        user.id,
        populate_existing=True,
    )

    ranks = earned_ranks(
        db, user.id, member
    )

    if not ranks:
        return []

    authorized = active_rank(db, user.id)

    preferences = disabled_privileges_batch(
        db, [user.id]
    )

    staff = bool(
        staff_identity.role_for(user)
    )

    now = datetime.now(timezone.utc)

    result = []

    for rank in sorted(ranks, reverse=True):
        expires = ranks[rank]

        disabled = preferences.get(
            (user.id, rank), set()
        )

        expired = bool(
            expires and expires <= now
        )

        usable = (
            authorized == rank
            and not expired
        )

        for privilege, item in VISUAL_ITEMS.items():
            if rank < PRIVILEGES[privilege]:
                continue

            if staff and privilege in STAFF_PROTECTED:
                continue

            kind, name, filename = item

            asset = (
                "assets/lidya-nobility/"
                + RANK_KEYS[rank]
                + "/"
                + filename
            )

            key = f"nobility:{rank}:{privilege}"

            result.append({
                "type": kind,
                "name": RANK_NAMES[rank] + " " + name,
                "asset": asset,
                "asset_key": key,
                "equip_key": key,
                "source": "nobility",
                "level": 0,
                "nobility_rank": rank,
                "nobility_privilege": privilege,
                "equipped": (
                    usable
                    and privilege not in disabled
                ),
                "locked": not usable,
                "expired": expired,
                "expires_at": (
                    expires.isoformat()
                    if expires else None
                ),
            })

    return result


def set_preference(db, user, rank, privilege, enabled):
    if type(rank) is not int or rank not in RANK_KEYS:
        raise HTTPException(400, "invalid_nobility_rank")

    if (
        type(privilege) is not str
        or privilege not in VISUAL_ITEMS
    ):
        raise HTTPException(400, "invalid_nobility_item")

    if type(enabled) is not bool:
        raise HTTPException(400, "invalid_preference")

    if (
        privilege in STAFF_PROTECTED
        and staff_identity.role_for(user)
    ):
        raise HTTPException(403, "management_locked")

    member = db.scalar(
        select(NobilityMembership)
        .where(NobilityMembership.user_id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if (
        member is None
        or active_rank(db, user.id) != rank
        or rank < PRIVILEGES[privilege]
    ):
        raise HTTPException(403, "nobility_item_unavailable")

    row = db.get(
        NobilityVisualPreference,
        (user.id, rank, privilege),
        populate_existing=True,
    )

    if row is None:
        row = NobilityVisualPreference(
            user_id=user.id,
            rank=rank,
            privilege=privilege,
            enabled=enabled,
        )
        db.add(row)
    else:
        row.enabled = enabled

    db.commit()

    return {
        "ok": True,
        "rank": rank,
        "privilege": privilege,
        "enabled": enabled,
    }


def disabled_privileges_batch(db, user_ids):
    ids = list(dict.fromkeys(user_ids))

    if not ids:
        return {}

    rows = db.execute(
        select(
            NobilityVisualPreference.user_id,
            NobilityVisualPreference.rank,
            NobilityVisualPreference.privilege,
        ).where(
            NobilityVisualPreference.user_id.in_(ids),
            NobilityVisualPreference.enabled.is_(False),
        )
    ).all()

    result = {}

    for user_id, rank, privilege in rows:
        result.setdefault(
            (user_id, rank), set()
        ).add(privilege)

    return result


def visual_disabled_expression(member, privilege):
    preference = NobilityVisualPreference

    return select(preference.user_id).where(
        preference.user_id == member.user_id,
        preference.rank == member.rank,
        preference.privilege == privilege,
        preference.enabled.is_(False),
    ).correlate(member).exists()
