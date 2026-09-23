from pathlib import Path
from PIL import Image

ROOT = Path("Gereken_icerikler")
EXTS = {".png", ".jpg", ".jpeg", ".webp"}

files = sorted(
    p for p in ROOT.rglob("*")
    if p.is_file() and p.suffix.lower() in EXTS
)

print(f"Toplam görsel: {len(files)}")
print("=" * 90)

stats = {}

for p in files:
    try:
        with Image.open(p) as im:
            w, h = im.size
            mode = im.mode
            fmt = im.format

            if w == h:
                oran = "KARE"
            elif abs((w / h) - (16 / 9)) < 0.02:
                oran = "16:9"
            else:
                oran = "DİĞER"

            key = (w, h, mode, fmt, oran)
            stats[key] = stats.get(key, 0) + 1

            print(f"{str(p):65} {w:5}x{h:<5} {mode:8} {fmt:5} {oran}")

    except Exception as e:
        print(f"HATA: {p} -> {e}")

print("\n" + "=" * 90)
print("ÖZET")
print("=" * 90)

for key, count in sorted(stats.items(), key=lambda x: (-x[1], x[0])):
    w, h, mode, fmt, oran = key
    print(f"{count:4} adet | {w}x{h} | {mode:8} | {fmt:5} | {oran}")
