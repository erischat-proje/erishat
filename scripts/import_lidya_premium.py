"""Publish only individually generated, validated Lydia artwork; never fabricate missing art."""
import json
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'frontend/shop-lydia-premium'
PLAN = ROOT / 'docs/lidya-premium-production.json'
LABELS = {'profile': 'Profil görünümü', 'frame': 'Çerçeve', 'bubble': 'Sohbet balonu', 'entrance': 'Oda girişi', 'title': 'Görev unvanı'}


def entrance_aperture(image):
    """Measure the actual enclosed alpha hole, not a guessed prompt location."""
    w,h=image.size
    alpha=image.getchannel('A');step=4
    cols,rows=(w+step-1)//step,(h+step-1)//step
    free={(x,y) for y in range(rows) for x in range(cols)
          if alpha.getpixel((min(w-1,x*step),min(h-1,y*step)))<16}
    holes=[]
    while free:
        start=free.pop();queue=deque([start]);points=[];edge=False
        while queue:
            x,y=queue.popleft();points.append((x,y))
            edge=edge or x in (0,cols-1) or y in (0,rows-1)
            for p in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if p in free:free.remove(p);queue.append(p)
        if not edge and len(points)>500:
            xs,ys=zip(*points);left,right=min(xs)*step,max(xs)*step;top,bottom=min(ys)*step,max(ys)*step
            center=(left+right)/2/w
            if .1<center<.4:holes.append((len(points),left,right,top,bottom))
    if not holes:raise ValueError('Room entry has no enclosed transparent avatar aperture')
    _,left,right,top,bottom=max(holes)
    return {'x':(left+right)/2/w,'y':(top+bottom)/2/h,
            'diameter':min(right-left,bottom-top)*.94/h}


def geometry(entry, image):
    w, h = image.size
    kind = entry['type']
    m = {'width': w, 'height': h, 'premium': True, 'name': entry['name']}
    if kind == 'profile':
        # Nine slicing paints only these four bands. The entire center is omitted,
        # including incidental generated shadows; real controls own that space.
        m.update(slice=[round(h*.18), round(w*.18), round(h*.18), round(w*.18)],
                 border_cap=[38, 26, 34, 26], fill=False)
    elif kind == 'bubble':
        # Keep the large left relief outside all runtime text, even on long messages.
        m.update(slice=[round(h*.37), round(w*.15), round(h*.40), round(w*.34)],
                 border_cap=[26, 16, 24, 42])
    elif kind == 'entrance':
        m.update(avatar=entrance_aperture(image),
                 name_box={'x': .40, 'y': .36, 'width': .42, 'height': .28})
    return m


def main():
    production = json.loads(PLAN.read_text())
    data_path = ROOT / 'backend/app/shop_expansion.json'
    data = json.loads(data_path.read_text())
    rows = {r['asset_key']: r for r in data['items']}
    metadata, aliases = {}, {}
    generated = []
    for entry in production['assets']:
        p = ART / entry['filename']
        if not p.is_file():
            continue
        with Image.open(p) as image:
            image.load()
            if image.mode != 'RGBA' or image.getchannel('A').getextrema()[0] != 0:
                raise ValueError(f'{p.name}: true transparency missing')
            if entry['type'] in ('profile', 'frame'):
                a = image.getchannel('A')
                w, h = image.size
                center = a.crop((int(w*.3), int(h*.3), int(w*.7), int(h*.7)))
                blocked = center.getextrema()[1] >= 128
                if entry['type'] == 'frame':
                    # Circular frames have sculpted outer corners, not a square aperture.
                    blocked = any(a.getpixel((x, y)) >= 128
                                  for y in range(int(h*.27), int(h*.73), 3)
                                  for x in range(int(w*.27), int(w*.73), 3)
                                  if ((x-w/2)/w)**2+((y-h/2)/h)**2 < .23**2)
                if blocked:
                    raise ValueError(f'{p.name}: center blocked')
            m = geometry(entry, image)
        entry['status'] = 'generated'
        kind, gender, n = entry['type'], entry['gender'], entry['index']
        key = f"shop-expansion/{entry['id']}.svg"
        url = f"shop-lydia-premium/{entry['filename']}"
        name = entry['name'] + ' · ' + LABELS[kind] + ' · ' + ('Kadın' if gender == 'female' else 'Erkek')
        if key not in rows:
            if kind not in ('profile', 'title'):
                raise ValueError(f'Existing catalog key missing: {key}')
            row = dict(type=kind, gender=gender, asset_key=key, name=name,
                       price=0 if kind == 'title' else 1500, vip=False, vip_level=0,
                       tier='task' if kind == 'title' else 'standard', expansion=True)
            if kind == 'title':
                row['task_only'] = True
            data['items'].append(row)
            rows[key] = row
        row = rows[key]
        row.update(name=name, asset_url=url)
        if kind == 'title':
            q = next(q for q in data['quests'] if q['id'] == f'title-{n:02d}')
            q.setdefault('gender_rewards', {})[gender] = dict(row)
        metadata[url] = m
        for alias in (key, f"shop-lydia/{entry['id']}.svg", f"shop-premium-v2/{entry['id']}.webp"):
            aliases[alias] = url
            metadata[alias] = m
        generated.append(entry['id'])
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    PLAN.write_text(json.dumps(production, ensure_ascii=False, indent=2)+'\n')
    config = json.dumps({'aliases': aliases, 'layouts': metadata}, ensure_ascii=False, separators=(',', ':'))
    source = """/* Individually produced Lydia artwork. Unknown assets retain their current appearance. */
(() => {
  'use strict';
  const data = CONFIG;
  function clean(value) {
    try { return decodeURIComponent(new URL(value, document.baseURI).pathname).replace(/^.*?(?=(?:shop-expansion|shop-lydia-premium|shop-lydia|shop-premium-v2)\\/)/, ''); }
    catch { return String(value || '').split(/[?#]/)[0].replace(/^\\.\\//, ''); }
  }
  window.ErisLidyaPremium = {
    resolve: value => data.aliases[clean(value)] || null,
    describe: value => data.layouts[clean(value)] || null,
    version: 'lidya-premium-20261011'
  };
})();
""".replace('CONFIG', config)
    (ROOT / 'frontend/lidya-premium.js').write_text(source)
    report = {'target': 800, 'generated': len(generated), 'remaining': 800-len(generated), 'ids': generated}
    (ROOT / 'docs/lidya-premium-progress.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({k: report[k] for k in ('target', 'generated', 'remaining')}))


if __name__ == '__main__':
    main()
