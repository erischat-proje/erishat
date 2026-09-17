from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "Gereken_icerikler"

FOLDERS = {
    "standard_avatar_female": "kadınavatar",
    "standard_avatar_male": "erkekavatar",
    "standard_frame": "standartcerceve",
    "vip_avatar_female": "vipkadınavatar",
    "vip_avatar_male": "viperkekavatar",
    "vip_frame": "vipcerceve",
}

EXPECTED = {
    "standard_avatar": 40,
    "standard_frame": 40,
    "vip_avatar": 12,
    "vip_frame": 12,
}

EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}

def files(folder: str) -> list[Path]:
    path = ROOT / folder
    if not path.exists():
        return []
    return sorted(
        p for p in path.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTENSIONS and p.stat().st_size > 0
    )


def main() -> int:
    counts: dict[str, int] = {}
    for label, folder in FOLDERS.items():
        items = files(folder)
        counts[label] = len(items)
        print(f"{label}: {len(items)}")
        for item in items:
            print(f"  - {item.relative_to(ROOT).as_posix()}")

    standard_avatar = counts["standard_avatar_female"] + counts["standard_avatar_male"]
    vip_avatar = counts["vip_avatar_female"] + counts["vip_avatar_male"]
    standard_frame = counts["standard_frame"]
    vip_frame = counts["vip_frame"]

    actual = {
        "standard_avatar": standard_avatar,
        "standard_frame": standard_frame,
        "vip_avatar": vip_avatar,
        "vip_frame": vip_frame,
    }

    print("\nTOTALS")
    failed = False
    for key, expected in EXPECTED.items():
        value = actual[key]
        state = "OK" if value == expected else "MISMATCH"
        print(f"{key}: {value}/{expected} [{state}]")
        failed |= value != expected

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
