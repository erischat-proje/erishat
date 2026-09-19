"""ErisChat wallpaper catalog: standard and VIP design collections."""

NORMAL = [
    {"key": f"wallpaper_{i:02d}", "tier": "normal", "vip_level": 0,
     "asset": f"Gereken_icerikler/duvarkagidi/normal/wallpaper_{i:02d}_{name}.svg",
     "price": 1500}
    for i, name in enumerate([
        "midnight-city","aurora-dusk","rose-night","ocean-glass","violet-dream","emerald-night",
        "sunset-cloud","lavender-sky","moonlit-lake","cherry-noir","teal-neon","royal-night"
    ], 1)
]
VIP = [
    {"key": f"vip_wallpaper_{i:02d}", "tier": "vip", "vip_level": i,
     "asset": f"Gereken_icerikler/duvarkagidi/vip/wallpaper_{i:02d}_{name}.svg",
     "price": 0}
    for i, name in enumerate([
        "obsidian-crown","royal-amethyst","cosmic-gold","crimson-royal","diamond-night","emerald-throne",
        "sapphire-luxe","ruby-velvet","celestial-violet","black-rose","aurora-crown","imperial-dusk"
    ], 1)
]

def catalog():
    return NORMAL + VIP

def find(key):
    return next((item for item in catalog() if item["key"] == key), None)
