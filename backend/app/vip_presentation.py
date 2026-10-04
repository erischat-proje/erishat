"""Level benefits. No inventory grants or client-supplied level is trusted."""
from .platform_models import UserPrivacy, VipStatus

THEMES = (
    "Buz Gümüş", "Aytaşı", "Zümrüt", "Kehribar", "Gül Kuvars", "Ametist",
    "Safir", "Yakut", "Güneş Altını", "Elmas", "Gece İmparatoru", "Lidya İmparatorluğu",
)


def presentation_rewards(level: int) -> list[dict]:
    if not 1 <= level <= 12:
        return []
    return [
        {"type": "profile_window", "key": f"vip-profile-{level}",
         "name": THEMES[level - 1], "asset_url": f"vip-designs/profile-{level}.png",
         "automatic": True},
        {"type": "vip_entrance", "key": f"vip-entrance-{level}",
         "name": f"{THEMES[level - 1]} oda girişi", "automatic": True},
    ]


def visible_entry_level(db, user_id) -> int:
    privacy = db.get(UserPrivacy, user_id)
    if privacy and (privacy.hide_vip or privacy.hide_vip_entry):
        return 0
    status = db.get(VipStatus, user_id)
    return max(0, min(12, int(status.level or 0))) if status else 0
