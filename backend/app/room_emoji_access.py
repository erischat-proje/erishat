"""Cumulative room emoji access uses earned VIP status, independent of profile visibility."""

VIP_EMOJI_LEVELS = {f"vip_{level}": level for level in range(1, 13)}


def earned_level(row):
    return max(0, min(12, int(getattr(row, "level", 0) or 0)))


def can_use(reaction_id, level):
    return int(level) >= VIP_EMOJI_LEVELS.get(reaction_id, 0)


def entitlement(row):
    level = earned_level(row)
    return {"level": level, "unlocked_ids": [key for key, required in VIP_EMOJI_LEVELS.items() if level >= required]}
