"""Validate all shop files and measure transparent frame apertures without changing artwork."""
from pathlib import Path
import argparse,json,re,collections
from PIL import Image
import numpy as np
from scipy.ndimage import distance_transform_edt

parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,default=Path('frontend'));parser.add_argument('--report',type=Path,required=True);parser.add_argument('--fit',type=Path,required=True);args=parser.parse_args()
source=Path('frontend/lidya-premium.js').read_text();data=json.loads(re.search(r'const data = (.*);\n',source)[1]);fits={};issues=[];counts=collections.Counter();resolved=set()
catalog=json.loads(Path('backend/app/shop_expansion.json').read_text())
for item in catalog['items']+catalog['wallpapers']:
 key=item.get('asset_url') or item.get('asset') or item.get('asset_key');target=data['aliases'].get(key,key)
 if target.startswith('shop-expansion/'):
  target=target.replace('shop-expansion/','shop-lydia/');target=re.sub(r'avatar-(.*)\.png$',r'avatar-\1.webp',target)
 resolved.add(target);counts[item.get('type','wallpaper')]+=1
for key in sorted(resolved):
 path=args.assets/key
 if not path.is_file():issues.append({'key':key,'issue':'missing'});continue
 with Image.open(path) if path.suffix!='.svg' else open(path) as file:
  if path.suffix=='.svg':
   if '<svg' not in file.read():issues.append({'key':key,'issue':'invalid svg'})
   continue
  file.verify()
 if not key.startswith('shop-lydia-premium/'):continue
 with Image.open(path) as file:
  im=file.convert('RGBA');m=data['layouts'][key]
  if im.size!=(m['width'],m['height']):issues.append({'key':key,'issue':'dimensions differ','actual':im.size})
  if '/frame-' in key:
   alpha=np.asarray(im.getchannel('A').resize((256,256)))
   distances=distance_transform_edt(alpha<40)
   central=np.zeros_like(distances);central[64:192,64:192]=distances[64:192,64:192]
   y,x=np.unravel_index(central.argmax(),central.shape);radius=float(central[y,x]);diameter=2*radius/256
   if not .3<diameter<.95:issues.append({'key':key,'issue':'unexpected frame aperture','diameter':diameter})
   fits[key]={'aperture':{'x':round((x+.5)/256,5),'y':round((y+.5)/256,5),'diameter':round(diameter*.985,5)}}
  if '/entrance-' in key:
   # Find a dark, opaque rectangle actually inside the name plate.
   small=im.copy();small.thumbnail((512,512));rgb=np.asarray(small);h,w=rgb.shape[:2]
   mask=(rgb[:,:,3]>200)&(rgb[:,:,:3].max(axis=2)<112)
   edge=m['avatar']['x']+m['avatar']['diameter']*m['height']/m['width']/2
   mask[:,:int(max(.36,edge+.025)*w)]=False;mask[:,int(.9*w):]=False
   mask[:int(.22*h),:]=False;mask[int(.78*h):,:]=False
   heights=[0]*w;best=(0,None)
   for y in range(h):
    stack=[]
    for x in range(w+1):
     if x<w:heights[x]=heights[x]+1 if mask[y,x] else 0
     value=heights[x] if x<w else 0;left=x
     while stack and stack[-1][1]>value:
      start,height=stack.pop();left=start;rw=x-start
      if height>=h*.13 and rw>=w*.18 and height*rw>best[0]:best=(height*rw,(start,y-height+1,rw,height))
     if not stack or stack[-1][1]<value:stack.append((left,value))
   if best[1]:
    x,y,rw,rh=best[1];pad=2
    fits[key]={'name_box':{'x':round((x+pad)/w,5),'y':round((y+pad)/h,5),'width':round((rw-pad*2)/w,5),'height':round((rh-pad*2)/h,5)}}
   else:issues.append({'key':key,'issue':'name plate could not be measured'})
  if '/bubble-' in key:
   rgba=im.getpixel((im.width//2,im.height//2));luminance=sum(a*b for a,b in zip(rgba[:3],[.2126,.7152,.0722]))
   fits[key]={'ink':'#fff8e9' if luminance<150 else '#251c12','fill':rgba[3]>200}
args.fit.write_text(json.dumps(fits,ensure_ascii=False,separators=(',',':')))
report={'catalog_entries':sum(counts.values()),'categories':dict(counts),'resolved_files':len(resolved),'premium_artworks':sum(k.startswith('shop-lydia-premium/') for k in resolved),'measured_frames':sum('aperture' in m for m in fits.values()),'measured_name_plates':sum('name_box' in m for m in fits.values()),'issues':issues}
args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
if issues:raise SystemExit(1)
