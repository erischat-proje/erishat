"""Install all 720 generated artworks under stable collection keys.

PNG pixels are preserved byte for byte. SVG wrappers add real text for titles;
other wrappers only place the original art. Refuse an incomplete release.
"""
import base64, json, html, argparse
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'frontend/shop-premium-v2'
data=json.loads((ROOT/'backend/app/shop_premium_plan.json').read_text())
parser=argparse.ArgumentParser();parser.add_argument('--titles-only',action='store_true');parser.add_argument('--ready-only',action='store_true');args=parser.parse_args()
items=[x for x in data['items'] if x['type'] in ('frame','bubble','entrance','profile','title')]
assert len(items)==720, 'The release must contain exactly 720 upgraded appearances'
if args.titles_only:items=[x for x in items if x['type']=='title']
if args.ready_only:
 ready=json.loads((ART/'ready.json').read_text());published={x['asset_key'] for x in ready['items']};items=[x for x in items if x['asset_key'] in published]
missing=[x['asset_key'] for x in items if not (ART/(Path(x['asset_key']).stem+'.webp')).is_file()]
if missing: raise SystemExit(f'Incomplete release: {len(missing)} artwork files missing')
manifest=json.loads((ROOT/'frontend/visual-layout.json').read_text())
entries=json.loads((ROOT/'frontend/shop-expansion/entrances.json').read_text())
for item in items:
 key=item['asset_key']; png=ART/(Path(key).stem+'.webp')
 with Image.open(png) as image:
  w,h=image.size
  assert image.mode=='RGBA', f'{key}: alpha transparency required'
  ratio={'frame':1,'bubble':2,'entrance':2,'profile':2/3,'title':3}[item['type']]
  assert abs(w/h-ratio)<.035, f'{key}: unexpected aspect ratio {w}/{h}'
  assert image.getchannel('A').getpixel((0,0))<16, f'{key}: opaque exterior'
 name=html.escape(item['name'])
 if item['type']=='title':
  encoded=base64.b64encode(png.read_bytes()).decode()
  font_size=min(h*.22,w*.53/max(1,len(item['name']))/.56)
  text=f'<text x="{w/2}" y="{h*.52}" dominant-baseline="middle" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-weight="700" font-size="{font_size}" fill="#ffe8ac" stroke="#15111b" stroke-width="{h*.008}" paint-order="stroke">{name}</text>'
  svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><title>{name}</title><image width="{w}" height="{h}" href="data:image/webp;base64,{encoded}"/>{text}</svg>'
  (ROOT/'frontend'/key).write_text(svg)
 m={'width':w,'height':h,'name':item['name'],'image':key if item['type']=='title' else 'shop-premium-v2/'+png.name}
 if item['type']=='bubble':
  m['slice']=[round(h*.30),round(w*.20),round(h*.30),round(w*.20)];m['border_cap']=[24,34,24,34]
 if item['type']=='profile':m['slice']=[round(h*.29),round(w*.18),round(h*.27),round(w*.18)]
 manifest['assets'][key]=m
 if item['type']=='entrance' and key in entries:entries[key]['aspect_ratio']=w/h
(ROOT/'frontend/visual-layout.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
(ROOT/'frontend/shop-expansion/entrances.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2))
print(f'Installed {len(items)} premium artworks; collection and task keys unchanged')
