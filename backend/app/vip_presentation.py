"""Level benefits. No inventory grants or client-supplied level is trusted."""
from .platform_models import UserPrivacy, VipStatus

THEMES = (
    "Buz Gümüş", "Aytaşı", "Zümrüt", "Kehribar", "Gül Kuvars", "Ametist",
    "Safir", "Yakut", "Güneş Altını", "Elmas", "Gece İmparatoru", "Lidya İmparatorluğu",
)


def entry_style(user) -> str:
    return "male" if getattr(user, "gender", None) == "male" else "female"


def entry_asset(level: int, style: str = "female") -> str:
    return f"vip-designs/entry-{'male-' if style == 'male' else ''}{level}.png"


def presentation_rewards(level: int, style: str = "female") -> list[dict]:
    if not 1 <= level <= 12:
        return []
    return [
        {"type": "profile_window", "key": f"vip-profile-{level}",
         "name": THEMES[level - 1], "asset_url": f"vip-designs/profile-{level}.png",
         "automatic": True},
        {"type": "vip_entrance", "key": f"vip-entrance-{level}",
         "name": f"{THEMES[level - 1]} oda girişi", "automatic": True,
         "asset_url": entry_asset(level, style)},
    ]


def entry_selection(db, user_id) -> tuple[str, int]:
    status = db.get(VipStatus, user_id)
    level = max(0, min(12, int(status.level or 0))) if status else 0
    key = status.entry_effect if status else None
    if key in ("normal", "relationship"):
        return key, 0
    if key and key.startswith("vip-entrance-"):
        try:
            selected = int(key.removeprefix("vip-entrance-"))
        except ValueError:
            selected = 0
        if 1 <= selected <= level:
            return "vip", selected
    return ("vip", level) if level else ("relationship", 0)


def visible_entry_level(db, user_id) -> int:
    privacy = db.get(UserPrivacy, user_id)
    if privacy and (privacy.hide_vip or privacy.hide_vip_entry):
        return 0
    return entry_selection(db, user_id)[1]


def entrance_inventory(db, user) -> list[dict]:
    status = db.get(VipStatus, user.id)
    level = max(0, min(12, int(status.level or 0))) if status else 0
    mode, selected = entry_selection(db, user.id)
    items = [{"type": "entrance", "asset_key": "normal", "equip_key": "normal",
              "asset": "vip-designs/entry-normal.svg", "name": "Normal oda girişi",
              "source": "standard", "level": 0, "entry_style": entry_style(user),
              "entry_selection": True, "equipped": mode == "normal"}]
    for n in range(1, level + 1):
        items.append({"type": "entrance", "asset_key": f"vip-entrance-{n}",
                      "equip_key": f"vip-entrance-{n}", "asset": entry_asset(n, entry_style(user)),
                      "name": THEMES[n - 1], "source": "vip", "level": n,
                      "entry_style": entry_style(user), "entry_selection": True,
                      "equipped": mode == "vip" and selected == n})
    return items
