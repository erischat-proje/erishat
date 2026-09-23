from pathlib import Path
from datetime import datetime
from PIL import Image, ImageChops

ROOT = Path("Gereken_icerikler")
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")
BACKUP = Path(f"Gereken_icerikler_BACKUP_{STAMP}")

EXTS = {".png", ".jpg", ".jpeg", ".webp"}

def category(p):
    s = str(p).lower()
    if "duvarkagidi" in s:
        return "wallpaper"
    if "cerceve" in s:
        return "frame"
    if "avatar" in s:
        return "avatar"
    return "other"

def trim_transparent(im):
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    alpha = im.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        return im.crop(bbox)
    return im

def trim_near_white(im, threshold=248):
    rgb = im.convert("RGB")
    px = rgb.load()
    w, h = rgb.size

    def white(x, y):
        r, g, b = px[x, y]
        return r >= threshold and g >= threshold and b >= threshold

    left, right, top, bottom = 0, w - 1, 0, h - 1

    # Kenarlarda gerçekten beyaz olan boşlukları kaldır.
    # İçerideki beyaz alanlara dokunma.
    while left < right and all(white(left, y) for y in range(h)):
        left += 1
    while right > left and all(white(right, y) for y in range(h)):
        right -= 1
    while top < bottom and all(white(x, top) for x in range(w)):
        top += 1
    while bottom > top and all(white(x, bottom) for x in range(w)):
        bottom -= 1

    return rgb.crop((left, top, right + 1, bottom + 1))

def square_canvas(im, size=512, transparent=False):
    if transparent:
        bg = (0, 0, 0, 0)
        canvas = Image.new("RGBA", (size, size), bg)
    else:
        bg = (255, 255, 255)
        canvas = Image.new("RGB", (size, size), bg)

    im.thumbnail((size, size), Image.Resampling.LANCZOS)

    x = (size - im.width) // 2
    y = (size - im.height) // 2
    canvas.paste(im, (x, y), im if im.mode == "RGBA" else None)
    return canvas

def save_correct(im, path, kind):
    suffix = path.suffix.lower()

    # Gerçek PNG olması gerekenler
    if kind == "frame":
        out = path.with_suffix(".png")
        im = im.convert("RGBA")
        im.save(out, "PNG", optimize=True)

        if out != path and path.exists():
            path.unlink()
        return

    # Avatarları standart kare PNG/JPG olarak koru:
    # mevcut uzantıyı bozma; fakat yanlış .png + JPEG kombinasyonunu düzelt.
    if kind == "avatar":
        if suffix == ".png":
            # PNG uzantılı JPEG -> gerçek PNG
            im.convert("RGB").save(path, "PNG", optimize=True)
        elif suffix in {".jpg", ".jpeg"}:
            im.convert("RGB").save(path, "JPEG", quality=92, optimize=True)
        else:
            im.convert("RGB").save(path, "PNG", optimize=True)
        return

    if kind == "wallpaper":
        if suffix == ".jpg" or suffix == ".jpeg":
            im.convert("RGB").save(path, "JPEG", quality=90, optimize=True)
        elif suffix == ".webp":
            im.convert("RGB").save(path, "WEBP", quality=90, method=6)
        elif suffix == ".png":
            im.convert("RGB").save(path, "PNG", optimize=True)
        return

def main():
    if not ROOT.exists():
        raise SystemExit("Gereken_icerikler bulunamadı.")

    files = sorted(
        p for p in ROOT.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTS
    )

    BACKUP.mkdir(parents=True)

    print(f"Toplam: {len(files)}")
    print(f"Yedek: {BACKUP}")

    ok = 0
    errors = 0

    for src in files:
        try:
            rel = src.relative_to(ROOT)
            backup = BACKUP / rel
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_bytes(src.read_bytes())

            kind = category(src)

            with Image.open(src) as original:
                im = original.copy()

            if kind == "frame":
                im = trim_transparent(im)
                im = square_canvas(im, 512, transparent=True)

            elif kind == "avatar":
                # Avatarlarda kenardaki saf beyaz boşluğu temizle.
                im = trim_near_white(im)
                im = square_canvas(im, 512, transparent=False)

            elif kind == "wallpaper":
                # Oranı kesinlikle bozma.
                im = im.convert("RGB")

            else:
                continue

            save_correct(im, src, kind)

            ok += 1
            print(f"[OK] {kind:10} {src}")

        except Exception as e:
            errors += 1
            print(f"[HATA] {src} -> {e}")

    print()
    print("=" * 60)
    print(f"İşlenen : {ok}")
    print(f"Hata    : {errors}")
    print(f"Yedek   : {BACKUP}")
    print("=" * 60)

if __name__ == "__main__":
    main()
