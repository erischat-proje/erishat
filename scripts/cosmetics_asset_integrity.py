from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "Gereken_icerikler"
EXPECTED_FOLDERS = {
    "kadınavatar": ("avatar", "female", False),
    "erkekavatar": ("avatar", "male", False),
    "standartcerceve": ("frame", None, False),
    "vipkadınavatar": ("avatar", "female", True),
    "viperkekavatar": ("avatar", "male", True),
    "vipcerceve": ("frame", None, True),
}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}


def main() -> None:
    assert ASSET_ROOT.is_dir(), f"missing asset root: {ASSET_ROOT}"
    entries: list[tuple[str, str, str | None, bool]] = []

    for folder, metadata in EXPECTED_FOLDERS.items():
        directory = ASSET_ROOT / folder
        assert directory.is_dir(), f"missing cosmetic folder: {folder}"
        kind, gender, vip = metadata
        files = sorted(path for path in directory.rglob("*") if path.is_file())
        assert files, f"empty cosmetic folder: {folder}"
        for path in files:
            assert path.suffix.lower() in IMAGE_EXTENSIONS, f"unsupported asset type: {path.relative_to(ROOT)}"
            key = path.relative_to(ASSET_ROOT).as_posix()
            entries.append((key, kind, gender, vip))

    keys = [entry[0] for entry in entries]
    assert len(keys) == len(set(keys)), "duplicate cosmetic asset_key detected"
    assert len(entries) == 139, f"unexpected cosmetic asset count: {len(entries)} (expected 139)"

    by_type = {"avatar": 0, "frame": 0}
    by_tier = {False: 0, True: 0}
    for _, kind, _, vip in entries:
        by_type[kind] += 1
        by_tier[vip] += 1

    print(
        "Cosmetics assets OK: "
        f"{len(entries)} total; "
        f"{by_type['avatar']} avatars; {by_type['frame']} frames; "
        f"{by_tier[False]} standard; {by_tier[True]} VIP"
    )


if __name__ == "__main__":
    main()
