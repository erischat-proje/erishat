"""Build 800 additive catalog entries and native artwork; retain all prior assets."""
import json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'frontend/shop-expansion';ART.mkdir(exist_ok=True)
P=[('Buz','#8ddcff','#e8f8ff'),('Zümrüt','#42dbaa','#b5f6d6'),('Yakut','#ed527c','#ffd6db'),('Ametist','#b185ff','#eadcff'),('Kehribar','#edb94e','#ffedba'),('Safir','#548cff','#d1e0ff'),('Turkuaz','#38d1dc','#c0f8f6'),('Gül','#ed8dcc','#ffe0f3'),('Platin','#aebbd8','#f0f4ff'),('Altın','#d7ac57','#ffedc4')]
F=['Yörünge','Prizma','Dalgalar','Defne','Kutup','Mozaik','Kanatlar','Takımyıldız']
M=['moon','prism','comet','laurel','crystal','imperial','phoenix','eclipse']
CAT=[];WALL=[];JOBS=[];QUESTS=[];ENTRIES={}
def gem(x,y,c,m,r=12):return f'<path d="M{x} {y-r}L{x+r} {y}L{x} {y+r}L{x-r} {y}Z" fill="{c}" stroke="{m}" stroke-width="2"/><path d="M{x-r} {y}H{x+r}M{x} {y-r}V{y+r}" stroke="{m}" opacity=".5"/>'
def svg(w,h,body,c,m):return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs><linearGradient id="metal" x2="1" y2="1"><stop stop-color="{m}"/><stop offset=".3" stop-color="{c}"/><stop offset=".55" stop-color="{m}"/><stop offset="1" stop-color="{c}"/></linearGradient><linearGradient id="well" x2="0" y2="1"><stop stop-color="#1c2033"/><stop offset="1" stop-color="#090e19"/></linearGradient></defs>{body}</svg>'
def motif(f,x,y,c,m,female=False):
 if f==1:
  accent=f'<ellipse cx="{x}" cy="{y}" rx="20" ry="13" fill="none" stroke="{c}" stroke-width="2"/>' if female else f'<path d="M{x-20} {y-20}L{x+20} {y+20}M{x+20} {y-20}L{x-20} {y+20}" stroke="{c}" stroke-width="2"/>'
  return accent+gem(x,y,c,m,13)
 if f==4:
  branch=''
  for k in range(6):
   a=k*60;branch+=f'<g transform="translate({x} {y}) rotate({a})"><path d="M0 -21V-4M-5 -15L0 -10L5 -15" fill="none" stroke="{m}" stroke-width="2" stroke-linecap="{"round" if female else "square"}"/></g>'
  return branch+(f'<circle cx="{x}" cy="{y}" r="6" fill="{c}"/>' if female else gem(x,y,c,m,6))
 if f==7:
  outline=f'<path d="M{x-21} {y+13}L{x} {y-6}L{x+18} {y+15}" fill="none" stroke="{c}" stroke-width="2"/>'
  ends=f'<circle cx="{x-21}" cy="{y+13}" r="3" fill="{m}"/><circle cx="{x+18}" cy="{y+15}" r="3" fill="{m}"/>' if female else f'<rect x="{x-24}" y="{y+10}" width="6" height="6" fill="{m}"/><rect x="{x+15}" y="{y+12}" width="6" height="6" fill="{m}"/>'
  return outline+ends+gem(x,y-6,c,m,9)
 if f==3:
  d=f'M{x} {y-18}Q{x+24} {y-3} {x} {y+18}Q{x-24} {y-3} {x} {y-18}Z' if female else f'M{x} {y-20}L{x+12} {y-7}L{x} {y+20}L{x-12} {y+7}Z'
  return f'<path d="{d}" fill="{c}" stroke="{m}" stroke-width="2"/><path d="M{x} {y-12}V{y+12}" stroke="{m}" stroke-width="2"/>'
 if f==6:
  d=f'M{x} {y}Q{x-26} {y-25} {x-23} {y+8}Q{x-9} {y+21} {x} {y}Q{x+26} {y-25} {x+23} {y+8}Q{x+9} {y+21} {x} {y}Z' if female else f'M{x} {y}L{x-24} {y-20}L{x-18} {y+12}L{x} {y+4}L{x+18} {y+12}L{x+24} {y-20}Z'
  return f'<path d="{d}" fill="{c}" stroke="{m}" stroke-width="2"/>'+gem(x,y,c,m,5)
 if f==5:return f'<rect x="{x-10}" y="{y-10}" width="20" height="20" rx="{7 if female else 1}" fill="{c}" stroke="{m}" stroke-width="2"/>'
 if f==2:
  d=f'M{x-14} {y-9}Q{x} {y-23} {x+14} {y-9}Q{x} {y+5} {x-14} {y+9}Q{x} {y+23} {x+14} {y+9}' if female else f'M{x-15} {y-16}L{x} {y-7}L{x+15} {y-16}M{x-15} {y}L{x} {y+9}L{x+15} {y}M{x-15} {y+16}L{x} {y+25}L{x+15} {y+16}'
  return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="3"/>'
 return f'<ellipse cx="{x}" cy="{y}" rx="18" ry="9" fill="none" stroke="{m}" stroke-width="3"/>'+ (f'<ellipse cx="{x}" cy="{y}" rx="9" ry="18" fill="none" stroke="{c}" stroke-width="2"/>' if female else gem(x,y,c,m,7))
def border(f,c,m,g,entrance=False):
 w,h=(1000,500) if entrance else (800,400);r=28 if g=='male' else 58
 b=f'<rect x="16" y="16" width="{w-32}" height="{h-32}" rx="{r}" fill="url(#well)" stroke="url(#metal)" stroke-width="12"/><rect x="55" y="55" width="{w-110}" height="{h-110}" rx="{r/2}" fill="none" stroke="{m}" stroke-width="2" opacity=".7"/>'
 for x in (36,w-36):
  for k in range(5):b+=motif(f,x,65+k*(h-130)/4,c,m,g=='female')
 b+=gem(w/2,34,c,m,21)+gem(w/2,h-34,c,m,15)
 return svg(w,h,b,c,m)
def frame(f,c,m,g):
 b=f'<circle cx="256" cy="256" r="206" fill="none" stroke="url(#metal)" stroke-width="24"/><circle cx="256" cy="256" r="184" fill="none" stroke="{m}" stroke-width="3"/>'
 for k in range([12,8,20,24,6,16,10,14][f]):
  a=k/[12,8,20,24,6,16,10,14][f]*math.tau-math.pi/2;x,y=256+211*math.cos(a),256+211*math.sin(a)
  b+=f'<g transform="translate({x} {y}) rotate({a*180/math.pi+90})">{motif(f,0,0,c,m,g=="female")}</g>'
 b+=gem(256,37,c,m,27)+gem(256,475,c,m,21)
 return svg(512,512,b,c,m)
def write(key,body):(ROOT/'frontend'/key).write_text(body,encoding='utf-8')
PORTRAITS=['urban architect in a tailored jacket','mountain explorer in a weatherproof expedition coat','astronomer in a high-collar observatory uniform','ocean navigator in a closed naval coat','royal strategist in engraved ceremonial armor','forest guardian in a fully covered embroidered cloak','modern musician in a closed designer jacket','night detective in a tailored trench coat']
for g in ('female','male'):
 for kind in ('avatar','bubble','entrance','frame'):
  for i in range(80):
   f,p=divmod(i,10);name,c,m=P[p];key=f'shop-expansion/{kind}-{g}-{i+1:02d}.'+('png' if kind=='avatar' else 'svg');label=f'{F[f]} · {name} · '+('Kadın' if g=='female' else 'Erkek')
   CAT.append(dict(type=kind,gender=g,asset_key=key,name=label,price=1500 if kind=='bubble' else 1000,vip=False,vip_level=0,tier='standard',expansion=True))
   if kind=='avatar':
    JOBS.append(dict(key=key,transparent=False,prompt=f'Use case: stylized-concept. One premium square avatar portrait for ErisChat. An original adult {"woman" if g=="female" else "man"}, age {26+i%15}, {PORTRAITS[f]}, distinct facial features, {name} accent palette ({c}). Cinematic realistic 3D character portrait, natural face proportions, sophisticated fabric, refined metallic details, dramatic readable eyes, soft photographic key light. Head and upper shoulders centered, entire face and hair inside a central circular crop with generous margins. All clothing closed, high neckline, fully covered. Dark elegant defocused environment. One finished portrait, no collage, no UI, no frame, no text, no watermark. Square aspect ratio.'))
   elif kind=='frame':write(key,frame(f,c,m,g))
   else:
    write(key,border(f,c,m,g,kind=='entrance'))
    if kind=='entrance':ENTRIES[key]=dict(level=0,name=label,color=c,metal=m,motion=M[f],duration=4200,entryFrame=key)
SCENES=['a moonlit marble courtyard with a luminous fountain and distant mountains','a tranquil ocean palace terrace with carved columns and a starry horizon','a mystical forest sanctuary with luminous leaves and ancient arches','a futuristic elevated city garden with elegant architecture and distant lights','a serene mountain observatory with a reflecting pool and aurora sky','a royal desert oasis with patterned sandstone and palm silhouettes','a lakeside glass pavilion among cherry trees and a distant moon','an enchanted waterfall valley with tiny lanterns and stone bridges']
for i in range(80):
 f,p=divmod(i,10);name,c,m=P[p];key=f'shop-expansion/wallpaper-{i+1:02d}.png'
 WALL.append(dict(key=f'wallpaper_expansion_{i+1:02d}',tier='normal',vip_level=0,gender=None,price=1500,name=f'{F[f]} · {name}',asset=key,room_only=True,expansion=True))
 JOBS.append(dict(key=key,transparent=False,prompt=f'Use case: stylized-concept. One premium tall mobile room wallpaper. Original cinematic fantasy environment: {SCENES[f]}, palette {name} ({c}) and {m}. Portrait 9:16 composition, luminous detailed architecture and nature along outer margins and bottom third; central 60 percent remains dark, spacious, quietly textured for readable white chat text and transparent seating overlays. Realistic materials, beautiful depth, controlled highlights, soft atmospheric lighting. Full canvas artwork without an enclosing frame. No people, text, numbers, watermark, UI, logos or collage.'))
NAMES=[['İlk Işık','Yeni Gün','Gün Dostu','Düzenli Ziyaretçi','Sabah Yıldızı','Takvim Yolcusu','Zamanın İzi','Sadık Ruh','Günlerin Efendisi','Sonsuz Işık'],['İlk Selam','Söz Ustası','Sohbet Dostu','Ses Veren','Sohbet Rüzgârı','Sözün Gücü','Salon Yıldızı','Sohbet Bilgesi','Sözlerin Efendisi','Efsane Anlatıcı'],['İlk Mektup','Mesaj Dostu','Kalem İzleri','Sözcük Yolcusu','Mektup Ustası','Dostluk Sesi','Söz Elçisi','Bağ Kurucu','İletişim Ustası','Sonsuz Bağ'],['İlk Keşif','Oda Yolcusu','Meraklı Gezgin','Salon Kaşifi','Yeni Ufuk','Rota Ustası','Diyar Gezgini','Sınır Ötesi','Keşif Lideri','Dünya Yolcusu'],['İlk Dost','Dost Çemberi','Bağların İzinde','Sosyal Yolcu','Çevre Ustası','Dostluk Köprüsü','Büyük Çember','Bağların Gücü','Sosyal Yıldız','Dostluk Efsanesi'],['Oda Dostu','Salon Takipçisi','Mekân Yolcusu','Topluluk İzleri','Salon Rehberi','Mekân Ustası','Topluluk Sesi','Oda Elçisi','Salon Bilgesi','Topluluk Efsanesi'],['İlk Paylaşım','İlham Kıvılcımı','Yaratıcı Ruh','Paylaşım Dostu','Fikir Bahçesi','İlham Veren','Anlatım Ustası','Üretken Yıldız','İlham Elçisi','Yaratıcılık Efsanesi'],['İlk Hikâye','Anı Avcısı','Hikâye Dostu','Anların İzinde','Anı Yolcusu','Hikâye Ustası','Hatıra Bahçesi','Anların Sesi','Hikâye Elçisi','Anıların Efsanesi']]
METRICS=['days','room_messages','messages','rooms','follows','room_follows','posts','stories']
for f in range(8):
 targets=[1,3,7,14,30,45,60,90,180,365] if f==0 else [1,10,25,50,100,250,500,1000,2500,5000] if f in (1,2) else [1,2,3,5,8,12,20,30,50,80]
 for p in range(10):
  name=NAMES[f][p];_,c,m=P[p];key=f'shop-expansion/title-{f*10+p+1:02d}.svg'
  write(key,svg(800,180,f'<rect x="12" y="12" width="776" height="156" rx="48" fill="#101421" stroke="{m}" stroke-width="7"/><rect x="25" y="25" width="750" height="130" rx="38" fill="none" stroke="{c}" stroke-width="3"/>{gem(66,90,c,m,22)}{gem(734,90,c,m,22)}<text x="400" y="106" text-anchor="middle" font-family="system-ui,sans-serif" font-size="40" font-weight="700" fill="{m}">{name}</text>',c,m))
  item=dict(type='title',gender=None,asset_key=key,name=name,price=0,vip=False,vip_level=0,tier='task',task_only=True,expansion=True);CAT.append(item);QUESTS.append(dict(id=f'title-{f*10+p+1:02d}',metric=METRICS[f],target=targets[p],reward=item))
(ROOT/'backend/app/shop_expansion.json').write_text(json.dumps(dict(items=CAT,wallpapers=WALL,quests=QUESTS),ensure_ascii=False,indent=2))
(ART/'entrances.json').write_text(json.dumps(ENTRIES,ensure_ascii=False,indent=2))
(ROOT/'scripts/expansion_image_jobs.json').write_text(json.dumps(JOBS,ensure_ascii=False,indent=2))
manifest=json.loads((ROOT/'frontend/visual-layout.json').read_text())
for item in CAT:
 if item['type']=='bubble':manifest['assets'][item['asset_key']]=dict(width=800,height=400,slice=[70,85,70,85],name=None)
(ROOT/'frontend/visual-layout.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
print(json.dumps(dict(total=len(CAT)+len(WALL),native=560,raster_jobs=len(JOBS))))
