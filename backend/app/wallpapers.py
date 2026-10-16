"""Lidya normal mağaza ve VIP duvar koleksiyonları."""

DEFAULT_ROOM_WALLPAPER = "shop-lydia/wallpaper-01.webp"

def default_wallpaper(user):
    gender = "male" if getattr(user, "gender", None) == "male" else "female"
    return "shop-lydia/wallpaper-" + ("02" if gender == "male" else "01") + ".webp"

GENDER_VIP = [{"key": f"vip_wallpaper_{gender}_{n:02d}", "tier": "vip",
               "vip_level": n, "gender": gender, "price": 0, "name": ("Erkek" if gender == "male" else "Kadın") + f" VIP {n} duvar kağıdı",
               "asset": f"vip-designs/lydia/wallpaper-{gender}-{n}.webp"}
              for gender in ("male", "female") for n in range(1, 13)]
GENDER_STANDARD = [{"key": f"wallpaper_{gender}_standard", "tier": "normal",
                   "vip_level": 0, "gender": gender, "price": 0, "free": True, "name": ("Erkek" if gender == "male" else "Kadın") + " standart duvar kağıdı",
                   "asset": "shop-lydia/wallpaper-" + ("02" if gender == "male" else "01") + ".webp"}
                  for gender in ("male", "female")]


def catalog(gender=None):
    from .shop_expansion import data
    variants = [i for i in GENDER_STANDARD + GENDER_VIP + data()['wallpapers'] if not gender or i['gender'] in (None, gender)]
    return variants


def find(key):
    return next((item for item in catalog() if item["key"] == key), None)
