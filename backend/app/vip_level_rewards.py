"""One original, gender-specific additional reward at EVERY VIP tier."""

PREFIX = "assets/vip-level-rewards-v2"
REWARDS = [
    (1, "crest", "Sardis Altın Arması", "crest", "profile"),
    (2, "status", "Kehribar Durum İşlemesi", "status_frame", "profile"),
    (3, "sardis", "Sardis Şafak Kapağı", "cover", "profile"),
    (4, "entry", "Safir Karşılama Kartı", "entry_frame", "entry"),
    (5, "gift", "Zümrüt Hediye Mührü", "gift_seal", "gifts"),
    (6, "paktolos", "Paktolos Hanedan Kapağı", "cover", "profile"),
    (7, "room", "Safir Avlu Oda Dekoru", "room_decor", "rooms"),
    (8, "home", "Hanedan Saray Bahçesi", "home_decor", "profile"),
    (9, "seal", "Yakut Kraliyet Mührü", "gift_seal", "gifts"),
    (10, "throne", "Hükümdar Taht Sahnesi", "scene", "profile"),
    (11, "imperial", "İmparatorluk Profil İşlemesi", "profile_frame", "profile"),
    (12, "palace", "Lidya Kraliyet Sarayı", "scene", "profile"),
]
BY_ID = {
    f"vip-level-{n:02}": (n, key, name, slot, category)
    for n, key, name, slot, category in REWARDS
}
SLOTS = {f"level_{r[3]}" for r in REWARDS}


def gender(user):
    return "male" if user.gender == "male" else "female"


def asset(key, style):
    return f"{PREFIX}/{style}/{key}.png"


def catalog(user, level, selections):
    return [
        {
            "id": item_id,
            "level": r[0],
            "name": r[2],
            "slot": "level_" + r[3],
            "category": r[4],
            "unlocked": level >= r[0],
            "equipped": selections.get("level_" + r[3]) == item_id and level >= r[0],
            "gender": gender(user),
            "asset": asset(r[1], gender(user)),
            "variants": {style: asset(r[1], style) for style in ("female", "male")},
            "thumbnails": {
                style: asset(r[1] + "-thumb", style) for style in ("female", "male")
            },
            "help": f"VIP {r[0]} seviyesinde otomatik açılır. Puan, ücret veya ayrıca satın alma gerekmez. Seviye bu eşiğin altına düşerse kullanım kapanır.",
        }
        for item_id, r in BY_ID.items()
    ]


def resolve(user, level, selections):
    result = {}
    for slot in SLOTS:
        item_id = selections.get(slot)
        r = BY_ID.get(item_id)
        if r and slot == "level_" + r[3] and level >= r[0]:
            result[slot] = {
                "id": item_id,
                "level": r[0],
                "name": r[2],
                "asset": asset(r[1], gender(user)),
                "gender": gender(user),
            }
    return result
