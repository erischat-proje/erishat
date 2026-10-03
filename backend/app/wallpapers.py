"""The illustrated wallpaper collection from avatarveduvarkağıdı."""

DEFAULT_ROOM_WALLPAPER = "avatarveduvarkağıdı/BİTMİŞ DUVAR KAĞIDI/ERİSCHAT STANDART DUVAR KAĞIDI.png"

NORMAL = [
    {
        "key": f"wallpaper_{i:02d}",
        "tier": "normal",
        "vip_level": 0,
        "asset": f"avatarveduvarkağıdı/BİTMİŞ DUVAR KAĞIDI/STANDART DUVAR KAĞIDI/{i}.png",
        "price": 1500,
    }
    for i in range(1, 41)
]

VIP = [
    {
        "key": f"vip_wallpaper_{i:02d}",
        "tier": "vip",
        "vip_level": i,
        "asset": f"avatarveduvarkağıdı/BİTMİŞ DUVAR KAĞIDI/VİP DUVAR KAĞIDI/VİP{i}.png",
        "price": 0,
    }
    for i in range(1, 13)
]


def catalog():
    return NORMAL + VIP + [{'key':f'relationship_wallpaper_{i}','tier':'relationship','vip_level':0,'asset':f'relationship-assets/rewards/wallpaper-{i}.png','price':0} for i in (1,2)]


def find(key):
    return next((item for item in catalog() if item["key"] == key), None)
