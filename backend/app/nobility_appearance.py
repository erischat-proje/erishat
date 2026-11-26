"""Server-authorized public nobility appearance."""

from .nobility_policy import active_rank, privileges_for_rank

VISUAL_PRIVILEGES = (
    "badge",
    "frame",
    "entrance",
    "region_background",
    "room_frame",
    "super_avatar",
)


def public_appearance(db, user_id, at=None):
    from datetime import datetime, timezone
    from .nobility_avatar import active_avatar
    from .admin_models import AdminRole

    at = at or datetime.now(timezone.utc)
    rank = active_rank(db, user_id, at) if user_id else 0

    if rank not in (1, 2, 3, 4):
        return {"rank": 0, "privileges": []}

    from .nobility_collection import disabled_privileges

    disabled = disabled_privileges(db, user_id, rank)

    allowed = tuple(
        key for key in privileges_for_rank(rank)
        if key not in disabled
    )

    result = {
        "rank": rank,
        "privileges": [
            key for key in VISUAL_PRIVILEGES
            if key in allowed
        ],
    }

    if (
        rank == 4
        and "super_avatar" in allowed
        and not db.get(AdminRole, user_id)
    ):
        avatar = active_avatar(db, user_id, at)

        if avatar is not None:
            result["animated_avatar"] = {
                "asset_id": avatar.asset_id,
                "expires_at": avatar.expires_at.isoformat(),
            }

    return result
