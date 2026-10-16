"""Compress original generated PNGs without changing a single RGBA pixel."""
import argparse,hashlib,json,re,os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];ART=ROOT/'frontend/shop-premium-v2'
def encode(p):
 dest=p.with_suffix('.webp')
 with Image.open(p) as im:
  assert im.mode=='RGBA',p.name
  original=im.tobytes();w,h=im.size
  ratio=1 if p.stem.startswith('frame-') else 2/3 if p.stem.startswith('profile-') else 3 if p.stem.startswith('title-') else 2
  assert abs(w/h-ratio)<.035,(p.name,w,h)
  assert im.getpixel((0,0))[3]<16,(p.name,'opaque exterior')
  if not dest.is_file():
   temporary=dest.with_suffix('.writing.webp');im.save(temporary,format='WEBP',lossless=True,exact=True,method=4,quality=80)
   with Image.open(temporary) as check:assert check.convert('RGBA').tobytes()==original,(p.name,'pixel fidelity')
   os.replace(temporary,dest)
  else:
   with Image.open(dest) as check:assert check.convert('RGBA').tobytes()==original,(p.name,'stale webp')
 return {'key':p.name,'width':w,'height':h,'png_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'webp_sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'rgba_sha256':hashlib.sha256(original).hexdigest(),'png_bytes':p.stat().st_size,'webp_bytes':dest.stat().st_size}
if __name__=='__main__':
 files=[p for p in ART.glob('*.png') if re.fullmatch(r'(?:frame|bubble|entrance|profile)-(?:female|male)-\d{2}|title-\d{2}',p.stem)]
 with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(encode,files))
 (ART/'pixel-fidelity.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
 print(json.dumps({'verified':len(results),'source_bytes':sum(x['png_bytes'] for x in results),'lossless_bytes':sum(x['webp_bytes'] for x in results)}))
