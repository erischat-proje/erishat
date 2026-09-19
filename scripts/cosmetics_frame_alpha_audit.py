from __future__ import annotations

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "Gereken_icerikler"
FRAME_FOLDERS = ("standartcerceve", "vipcerceve")


def main() -> None:
    transparent = []
    opaque = []
    non_png = []

    for folder in FRAME_FOLDERS:
        directory = ASSET_ROOT / folder
        for path in sorted(directory.rglob("*")):
            if not path.is_file():
                continue
            if path.suffix.lower() != ".png":
                non_png.append(path.relative_to(ROOT).as_posix())
                continue
            with Image.open(path) as image:
                rgba = image.convert("RGBA")
                alpha = rgba.getchannel("A")
                extrema = alpha.getextrema()
                key = path.relative_to(ROOT).as_posix()
                if extrema[0] < 255:
                    transparent.append(key)
                else:
                    opaque.append(key)

    print(f"Frame alpha audit: {len(transparent)} transparent-capable; {len(opaque)} fully opaque; {len(non_png)} non-PNG")
    if non_png:
        print("Non-PNG frames:")
        for item in non_png:
            print(f"  - {item}")
    if opaque:
        print("Fully opaque frames:")
        for item in opaque:
            print(f"  - {item}")

    # This is intentionally diagnostic-only: visual suitability is a product/design
    # decision and is not reduced to a binary CI pass/fail yet.
    assert len(transparent) + len(opaque) + len(non_png) > 0, "no frame assets found"


if __name__ == "__main__":
    main()
