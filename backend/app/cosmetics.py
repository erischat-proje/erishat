from __future__ import annotations

from pathlib import Path
from typing import Any

PRICE = 1000
COSMETIC_TYPES = {"avatar", "frame"}


def _asset_root() -> Path:
    return Path(__file__).resolve().parents[2] / "Gereken_icerikler"


def _safe_key(value: str) -> str:
    value = (value or "").strip().replace("\\", "/")
    if not value or value.startswith("/") or ".." in value.split("/"):
        raise ValueError("Geçersiz görünüm anahtarı")
    return value


def catalog() -> list[dict[str, Any]]:
    root = _asset_root()
    groups = {
        "female": ("kadınavatar", "avatar"),
        "male": ("erkekavatar", "avatar"),
        "frame": ("standart çerçeve", "frame"),
    }
    result: list[dict[str, Any]] = []
    for group, (folder, kind) in groups.items():
        directory = root / folder
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*")):
            if not path.is_file() or path.name.startswith("VIP") or "vip" in path.name.lower():
                continue
            key = path.relative_to(root).as_posix()
            result.append({"type": kind, "gender": None if kind == "frame" else group, "asset_key": key, "price": PRICE, "vip": False})
    return result


def find_asset(asset_key: str, cosmetic_type: str) -> dict[str, Any] | None:
    key = _safe_key(asset_key)
    return next((item for item in catalog() if item["asset_key"] == key and item["type"] == cosmetic_type), None)
