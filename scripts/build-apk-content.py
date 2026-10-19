"""Build install-time media without changing public artwork or web/API code."""
import argparse
import base64
import re
import concurrent.futures
import hashlib
import io
import json
import mimetypes
import shutil
from pathlib import Path

MEDIA = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.wav', '.mp3', '.ogg', '.woff2', '.ttf'}
EXTRA = ('Gereken_icerikler', 'hediyesistemi', 'avatarveduvarkağıdı')

def sources(root):
    found = {}
    for base, prefix in [(root/'frontend', '')] + [(root/name, name+'/') for name in EXTRA]:
        if not base.exists():
            continue
        for path in sorted(base.rglob('*')):
            if path.is_file() and not path.is_symlink() and path.suffix.lower() in MEDIA:
                found[prefix+path.relative_to(base).as_posix()] = path
    return sorted(found.items())

def mime(path):
    return {'.svg':'image/svg+xml', '.wav':'audio/wav', '.woff2':'font/woff2'}.get(path.suffix.lower(), mimetypes.guess_type(path.name)[0] or 'application/octet-stream')

def pack_one(item, output):
    from PIL import Image, ImageOps
    name, path = item
    original = path.read_bytes()
    digest = hashlib.sha256(original).hexdigest()
    data, kind, extension = original, mime(path), path.suffix.lower()
    if extension in {'.png', '.jpg', '.jpeg', '.webp'}:
        with Image.open(io.BytesIO(original)) as image:
            if not getattr(image, 'is_animated', False):
                image = ImageOps.exif_transpose(image)
                # Atlases need extra resolution; each sheet keeps its aspect ratio.
                edge = 2048 if any(s in name.lower() for s in ('atlas','sprites','symbols','sheet')) else 1024
                image.thumbnail((edge, edge), Image.Resampling.LANCZOS)
                image = image.convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB')
                buf = io.BytesIO()
                image.save(buf, format='WEBP', quality=86, method=4, exact=True)
                # A smaller original below the size limit needs no recompression.
                if len(buf.getvalue()) < len(original) or max(Image.open(io.BytesIO(original)).size) > edge:
                    data, kind, extension = buf.getvalue(), 'image/webp', '.webp'
    if extension == '.svg':
        # Some legacy SVGs contain multi-megabyte base64 PNGs. Keep vector/text
        # layers intact, and only optimize those embedded raster payloads.
        def embedded(match):
            payload = base64.b64decode(match.group(1))
            with Image.open(io.BytesIO(payload)) as image:
                if getattr(image, 'is_animated', False):
                    return match.group(0)
                image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                image = image.convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB')
                buf = io.BytesIO()
                image.save(buf, format='WEBP', quality=86, method=4, exact=True)
                if len(buf.getvalue()) >= len(payload):
                    return match.group(0)
                return b'data:image/webp;base64,'+base64.b64encode(buf.getvalue())
        data = re.sub(rb'data:image/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)', embedded, original)
    asset = 'media/'+hashlib.sha256(data).hexdigest()+extension
    target = output/asset
    # Identical source copies can share an install-time asset.
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(data)
    return name, {'sha256':digest, 'asset':asset, 'mime':kind}, len(original)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path)
    parser.add_argument('--web-index', type=Path)
    parser.add_argument('--workers', type=int, default=2)
    args = parser.parse_args()
    items = sources(args.root)
    if args.web_index:
        files = {name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in items}
        args.web_index.parent.mkdir(parents=True, exist_ok=True)
        args.web_index.write_text(json.dumps({'schema':1,'files':files},ensure_ascii=False,separators=(',',':'))+'\n')
        print('Web content index:', len(files), flush=True)
    if not args.output:
        return
    if args.output.exists():
        shutil.rmtree(args.output)
    args.output.mkdir(parents=True)
    entries, original = {}, 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for n, (name, entry, length) in enumerate(pool.map(lambda item:pack_one(item,args.output), items), 1):
            entries[name] = entry
            original += length
            if n%200 == 0:
                print('Packed',n,'/',len(items),flush=True)
    (args.output/'index.json').write_text(json.dumps({'schema':1,'files':entries},ensure_ascii=False,separators=(',',':'))+'\n')
    packed = sum(p.stat().st_size for p in args.output.rglob('*') if p.is_file())
    assert packed < 900*1024*1024, 'Install-time media exceeded the 900 MiB budget'
    print(json.dumps({'files':len(entries),'source_bytes':original,'pack_bytes':packed}),flush=True)

if __name__ == '__main__':
    main()
