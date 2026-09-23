from __future__ import annotations

from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "Gereken_icerikler"
FOLDERS = {
    "standard_female_avatar": ("kadınavatar", "avatar"),
    "standard_male_avatar": ("erkekavatar", "avatar"),
    "standard_frame": ("standartcerceve", "frame"),
    "vip_female_avatar": ("vipkadınavatar", "avatar"),
    "vip_male_avatar": ("viperkekavatar", "avatar"),
    "vip_frame": ("vipcerceve", "frame"),
}

EXPECTED_TOTALS = {
    "standard_avatar": 40,
    "standard_frame": 40,
    "vip_avatar": 12,
    "vip_frame": 12,
}

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}


def files_in(folder: str) -> list[Path]:
    path = ROOT / folder
    if not path.exists():
        return []
    return sorted(p for p in path.rglob("*") if p.is_file() and p.suffix.lower() in ALLOWED_EXTENSIONS)


def main() -> int:
    counts: Counter[str] = Counter()
    invalid: list[str] = []

    print("ErisChat cosmetic inventory")
    print(f"root={ROOT}")

    for label, (folder, kind) in FOLDERS.items():
        paths = files_in(folder)
        counts[label] = len(paths)
        print(f"{label}: {len(paths)}")
        for path in paths:
            if not path.stat().st_size:
                invalid.append(str(path.relative_to(ROOT)))

    totals = {
        "standard_avatar": counts["standard_female_avatar"] + counts["standard_male_avatar"],
        "standard_frame": counts["standard_frame"],
        "vip_avatar": counts["vip_female_avatar"] + counts["vip_male_avatar"],
        "vip_frame": counts["vip_frame"],
    }
    print("totals:")
    for key, actual in totals.items():
        expected = EXPECTED_TOTALS[key]
        status = "OK" if actual >= expected else "MISSING"
        print(f"  {key}: {actual}/{expected} {status}")

    if invalid:
        print("zero-byte assets:")
        for item in invalid:
            print(f"  {item}")

    # Inventory is diagnostic for now. It only fails on malformed/empty files;
    # the target counts remain visible without blocking development while the
    # final asset pack is still being assembled.
    return 1 if invalid else 0


if __name__ == "__main__":
    raise SystemExit(main())
