from __future__ import annotations

from pathlib import Path
from typing import Any

PRICE = 1000
VIP_PRICE = 5000
COSMETIC_TYPES = {"avatar", "frame", "wallpaper", "bubble", "entrance", "title", "profile"}


def _asset_root() -> Path:
    base = Path(__file__).resolve().parents[1]
    return (base if (base / "Gereken_icerikler").is_dir() else base.parent) / "Gereken_icerikler"


def _new_asset_root() -> Path:
    """Repository root locally, /app in the API container."""
    base = Path(__file__).resolve().parents[1]
    return base if (base / "avatarveduvarkağıdı").is_dir() else base.parent


def _safe_key(value: str) -> str:
    value = (value or "").strip().replace("\\", "/")
    if not value or value.startswith("/") or ".." in value.split("/"):
        raise ValueError("Geçersiz görünüm anahtarı")
    return value


def _collect(result: list[dict[str, Any]], root: Path, folder: str, kind: str, gender: str | None, vip: bool) -> None:
    directory = root / folder
    if not directory.exists():
        return
    paths = [path for path in directory.rglob("*") if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif"}]

    def natural_key(path: Path):
        import re
        parts = re.split(r"(\d+)", path.name.lower())
        return [int(part) if part.isdigit() else part for part in parts]

    paths.sort(key=natural_key)
    for index, path in enumerate(paths, start=1):
        key = path.relative_to(root).as_posix()
        result.append({
            "type": kind,
            "gender": gender,
            "asset_key": key,
            "price": VIP_PRICE if vip else PRICE,
            "vip": vip,
            "tier": "vip" if vip else "standard",
            # Each VIP asset set contains 12 entries; one entry unlocks per VIP level.
            "vip_level": index if vip else None,
        })


def catalog() -> list[dict[str, Any]]:
    root = _asset_root()
    result: list[dict[str, Any]] = []

    # Standard catalog: the repository uses these exact folder names.
    new_root = _new_asset_root()
    _collect(result, new_root, "avatarveduvarkağıdı/BİTMİŞ AVATAR/STANDART KADIN AVATAR", "avatar", "female", False)
    _collect(result, new_root, "avatarveduvarkağıdı/BİTMİŞ AVATAR/STANDART ERKEK AVATAR", "avatar", "male", False)
    result.extend(frame_catalog())

    # VIP catalog: these are unlock rewards, not normal Lidya purchases.
    from .vip_presentation import THEMES
    for gender, folder in (("female", "KADIN VİP"), ("male", "ERKEK VİP")):
        for level in range(1, 13):
            result.append({"type": "avatar", "gender": gender,
                "asset_key": f"avatarveduvarkağıdı/BİTMİŞ AVATAR/{folder}/VİP{level}.png",
                "asset_url": f"vip-designs/lydia/avatar-{gender}-{level}.webp",
                "price": 0, "vip": True, "tier": "vip", "vip_level": level,
                "name": f"VIP {level} · {THEMES[level-1]}"})

    from .shop_expansion import data
    result.extend(data()["items"])
    return result


def find_asset(asset_key: str, cosmetic_type: str) -> dict[str, Any] | None:
    key = _safe_key(asset_key)
    if cosmetic_type not in COSMETIC_TYPES:
        return None
    choices = catalog()
    return next((item for item in choices if item['asset_key']==key and item['type']==cosmetic_type),None)


def frame_catalog():
    from .vip_presentation import THEMES
    return [{"type": "frame", "gender": gender, "asset_key": f"vip-designs/avatar-frame-{gender}-{n if n else 'standard'}.svg",
             "asset_url": f"vip-designs/lydia/frame-{gender}-{n}.webp" if n else f"vip-designs/avatar-frame-{gender}-standard.svg",
             "price": 0, "free": n == 0, "vip": n > 0, "tier": "vip" if n else "standard",
             "vip_level": n, "name": (f"VIP {n} · {THEMES[n-1]}" if n else "Standart") + (" · Erkek çerçevesi" if gender == "male" else " · Kadın çerçevesi")}
            for gender in ("male", "female") for n in range(13)]
