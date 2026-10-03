from __future__ import annotations

from pathlib import Path
from typing import Any

PRICE = 1000
VIP_PRICE = 5000
COSMETIC_TYPES = {"avatar", "frame", "wallpaper"}


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
    _collect(result, root, "cercevesistemi/standart", "frame", None, False)

    # VIP catalog: these are unlock rewards, not normal Lidya purchases.
    _collect(result, new_root, "avatarveduvarkağıdı/BİTMİŞ AVATAR/KADIN VİP", "avatar", "female", True)
    _collect(result, new_root, "avatarveduvarkağıdı/BİTMİŞ AVATAR/ERKEK VİP", "avatar", "male", True)
    _collect(result, root, "cercevesistemi/vip", "frame", None, True)

    return result


def find_asset(asset_key: str, cosmetic_type: str) -> dict[str, Any] | None:
    key = _safe_key(asset_key)
    if cosmetic_type not in COSMETIC_TYPES:
        return None
    return next((item for item in catalog() if item["asset_key"] == key and item["type"] == cosmetic_type), None)
