"""Exclusive welcome cosmetics registry."""
from datetime import datetime, timezone

DURATIONS = {
    "bronze": 7,
    "silver": 15,
    "gold": 30,
}

REWARDS = {
    "bronze": ("frame", "bubble"),
    "silver": ("frame", "bubble", "profile", "entrance"),
    "gold": (
        "frame", "bubble", "profile", "entrance", "title"
    ),
}

COLLECTIONS = {
    "male": {
        "bronze": "Bronz Savaşçı",
        "silver": "Gümüş Hükümdar",
        "gold": "Altın İmparator",
    },
    "female": {
        "bronze": "Bronz Zarafet",
        "silver": "Gümüş Prenses",
        "gold": "Altın Kraliçe",
    },
}

LABELS = {
    "frame": "Avatar çerçevesi",
    "bubble": "Sohbet balonu",
    "profile": "Profil kartı",
    "entrance": "Oda giriş efekti",
    "title": "Özel ünvan",
}


def rewards_for(gender, tier):
    if gender not in COLLECTIONS or tier not in REWARDS:
        return []

    result = []

    for kind in REWARDS[tier]:
        key = f"welcome_{gender}_{tier}_{kind}_v1"

        result.append({
            "type": kind,
            "asset_key": key,
            "gender": gender,
            "tier": tier,
            "name": COLLECTIONS[gender][tier] + " · " + LABELS[kind],
            "duration_days": DURATIONS[tier],
            "source": "welcome_package",
            "exclusive": True,
            "shop_available": False,
            "permanent": False,
            "artwork_ready": False,
            "preview_ready": True,
            "preview_asset": f"welcome-premium-v3/{key}.svg",
            "animated": tier == "gold" and kind == "frame",
        })

    return result


def catalog():
    return [
        reward
        for gender in COLLECTIONS
        for tier in REWARDS
        for reward in rewards_for(gender, tier)
    ]


def find_reward(asset_key, kind):
    return next(
        (
            item for item in catalog()
            if item["asset_key"] == asset_key
            and item["type"] == kind
        ),
        None,
    )


def utc(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def entitlement_valid(user, lease, now=None):
    if not lease or not getattr(user, "is_active", False):
        return False

    item = find_reward(
        lease.asset_key,
        lease.cosmetic_type,
    )

    if not item:
        return False

    if lease.user_id != user.id:
        return False

    if item["gender"] != getattr(user, "gender", None):
        return False

    if lease.expires_at is None:
        return False

    now = utc(now or datetime.now(timezone.utc))
    return utc(lease.expires_at) > now
