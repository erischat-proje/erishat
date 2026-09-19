"""ErisChat wallpaper catalog using the uploaded PNG collections."""

NORMAL = [
    {
        "key": f"wallpaper_{i:02d}",
        "tier": "normal",
        "vip_level": 0,
        "asset": f"Gereken_icerikler/duvarkagidi/normal/{i}.png",
        "price": 1500,
    }
    for i in range(1, 20)
]

VIP = [
    {
        "key": f"vip_wallpaper_{i:02d}",
        "tier": "vip",
        "vip_level": i,
        "asset": f"Gereken_icerikler/duvarkagidi/vip/vip{i}.png",
        "price": 0,
    }
    for i in range(1, 13)
]


def catalog():
    return NORMAL + VIP


def find(key):
    return next((item for item in catalog() if item["key"] == key), None)
