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

EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}


def files(folder: str) -> list[Path]:
    path = ROOT / folder
    if not path.exists():
        return []
    return sorted(
        p
        for p in path.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTENSIONS and p.stat().st_size > 0
    )


def main() -> int:
    if not ROOT.exists():
        print(f"ERROR: cosmetic root missing: {ROOT}")
        return 1

    counts: dict[str, int] = {}
    asset_keys: set[str] = set()
    failed = False

    print("ACTIVE COSMETIC INVENTORY")
    print("All valid assets inside the six catalog folders are treated as active.")

    for label, folder in FOLDERS.items():
        directory = ROOT / folder
        if not directory.exists():
            print(f"ERROR: required catalog folder missing: {folder}")
            failed = True
            counts[label] = 0
            continue

        items = files(folder)
        counts[label] = len(items)
        print(f"{label}: {len(items)}")

        for item in items:
            key = item.relative_to(ROOT).as_posix()
            if key in asset_keys:
                print(f"ERROR: duplicate asset key: {key}")
                failed = True
            asset_keys.add(key)
            print(f"  - {key}")

    standard_avatar = counts["standard_avatar_female"] + counts["standard_avatar_male"]
    vip_avatar = counts["vip_avatar_female"] + counts["vip_avatar_male"]
    standard_frame = counts["standard_frame"]
    vip_frame = counts["vip_frame"]

    print("\nTOTALS")
    print(f"standard_avatar: {standard_avatar}")
    print(f"standard_frame: {standard_frame}")
    print(f"vip_avatar: {vip_avatar}")
    print(f"vip_frame: {vip_frame}")
    print(f"all_active_cosmetics: {len(asset_keys)}")

    if failed:
        print("\nINVENTORY CHECK: FAILED")
        return 1

    print("\nINVENTORY CHECK: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
