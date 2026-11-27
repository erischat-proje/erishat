"""Cumulative room emoji access uses earned VIP status, independent of profile visibility."""

VIP_EMOJI_LEVELS = {f"vip_{level}": level for level in range(1, 13)}


VIP_EMOJI_LEVELS.update({f'lidya_sticker_{n}':1 if n<=6 else 2 for n in range(1,13)})


def earned_level(row):
    return max(0, min(12, int(getattr(row, "level", 0) or 0)))


def can_use(reaction_id, level):
    return int(level) >= VIP_EMOJI_LEVELS.get(reaction_id, 0)


def entitlement(row, stickers_enabled=False):
    level = earned_level(row)
    return {
        "level": level,
        "unlocked_ids": [
            key for key, required in VIP_EMOJI_LEVELS.items()
            if level >= required
            and (
                not key.startswith("lidya_sticker_")
                or stickers_enabled
            )
        ],
    }


def current_entitlement(db, uid):
    from . import vip_privileges

    level = vip_privileges.level(db, uid)
    enabled = (
        vip_privileges.values(db, uid).get("stickers") == "enabled"
    )
    from types import SimpleNamespace

    result = entitlement(
        SimpleNamespace(level=level),
        stickers_enabled=enabled,
    )
    db.commit()
    return result
