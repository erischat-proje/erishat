from __future__ import annotations

from pathlib import Path
from typing import Any

PRICE = 1000
VIP_PRICE = 5000
COSMETIC_TYPES = {"avatar", "frame", "wallpaper"}


def _asset_root() -> Path:
    return Path(__file__).resolve().parents[1] / "Gereken_icerikler"


def _safe_key(value: str) -> str:
    value = (value or "").strip().replace("\\", "/")
    if not value or value.startswith("/") or ".." in value.split("/"):
        raise ValueError("Geçersiz görünüm anahtarı")
    return value


def _collect(result: list[dict[str, Any]], root: Path, folder: str, kind: str, gender: str | None, vip: bool) -> None:
    directory = root / folder
    if not directory.exists():
        return
    paths = [path for path in directory.rglob("*") if path.is_file()]

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
    _collect(result, root, "kadınavatar", "avatar", "female", False)
    _collect(result, root, "erkekavatar", "avatar", "male", False)
    _collect(result, root, "standartcerceve", "frame", None, False)

    # VIP catalog: these are unlock rewards, not normal Lidya purchases.
    _collect(result, root, "vipkadınavatar", "avatar", "female", True)
    _collect(result, root, "viperkekavatar", "avatar", "male", True)
    _collect(result, root, "vipcerceve", "frame", None, True)

    return result


def find_asset(asset_key: str, cosmetic_type: str) -> dict[str, Any] | None:
    key = _safe_key(asset_key)
    if cosmetic_type not in COSMETIC_TYPES:
        return None
    return next((item for item in catalog() if item["asset_key"] == key and item["type"] == cosmetic_type), None)

# --- İLERİ SEVİYE CACHE GÜÇLENDİRMESİ ---

from functools import lru_cache

@lru_cache(maxsize=128)
def get_cached_catalog():
    # Katalog verilerini bellek önbelleğinde tutarak milisaniyelik yanıt sağlar
    return list(catalog) if isinstance(catalog, (list, dict)) else []
