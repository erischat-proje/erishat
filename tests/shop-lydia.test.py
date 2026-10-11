import ast,json,sys,types,unittest,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class ShopLydia(unittest.TestCase):
 def module(self):
  pkg=types.ModuleType('shoptest');pkg.__path__=[];sys.modules['shoptest']=pkg
  for name in ['vip_presentation','shop_expansion']:
   m=types.ModuleType('shoptest.'+name);sys.modules[m.__name__]=m
   if name=='vip_presentation':m.THEMES=[str(i) for i in range(12)]
   else:m.data=lambda:{'items':[]}
  p=ROOT/'backend/app/cosmetics.py';m=types.ModuleType('shoptest.cosmetics');m.__file__=str(p);m.__package__='shoptest';exec(compile(p.read_text(),str(p),'exec'),m.__dict__)
  q=ROOT/'backend/app/shop_lydia.py';a=types.ModuleType('shoptest.shop_lydia');exec(compile(q.read_text(),str(q),'exec'),a.__dict__);sys.modules[a.__name__]=a
  return m
 def test_vip_rewards_identical(self):
  fixture=json.loads((ROOT/'tests/shop-vip-preservation-fixture.json').read_text());m=self.module()
  self.assertEqual([x for x in m.catalog() if x.get('vip')],fixture['vip'])
  values=[ast.dump(n.value) for n in ast.parse((ROOT/'backend/app/wallpapers.py').read_text()).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='GENDER_VIP' for t in n.targets)]
  self.assertEqual([__import__('re').sub(r', [a-z_]+=\[\]', '', v) for v in values],[__import__('re').sub(r', [a-z_]+=\[\]', '', fixture['walls'])])
 def test_legacy_avatar_key_and_price(self):
  m=self.module()
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);folder='avatarveduvarkağıdı/BİTMİŞ AVATAR/STANDART KADIN AVATAR';(root/folder).mkdir(parents=True);(root/folder/'Eski 02.png').write_bytes(b'example');result=[];m._collect(result,root,folder,'avatar','female',False);row=result[0]
   self.assertEqual(row['asset_key'],folder+'/Eski 02.png');self.assertEqual(row['price'],1000);n=sum(map(ord,'Eski 02.png'))%80+1;self.assertEqual(row['asset_url'],f'shop-lydia/avatar-female-{n:02d}.webp')
 def test_paid_prices_keys_and_quests(self):
  old=json.loads((ROOT/'tests/shop-original-fixture.json').read_text());new=json.loads((ROOT/'backend/app/shop_expansion.json').read_text())
  for group,key in [('items','asset_key'),('wallpapers','key')]:
   baseline={r[key]:r for r in old[group]};rows={r[key]:r for r in new[group]};self.assertEqual(baseline.keys(),rows.keys())
   for k,row in rows.items():
    for field in ['type','price','gender','free','vip','vip_level','tier','room_only','task_only']:self.assertEqual(row.get(field),baseline[k].get(field),(k,field))
    self.assertTrue((row.get('asset_url') or row.get('asset')).startswith('shop-lydia/'))
  previous={q['id']:q for q in old['quests']};items={r['asset_key']:r for r in new['items']}
  for q in new['quests']:
   for f in ['target','metric']:self.assertEqual(q[f],previous[q['id']][f])
   self.assertEqual(q['reward']['asset_key'],previous[q['id']]['reward']['asset_key']);self.assertEqual(q['reward'],items[q['reward']['asset_key']])
 def test_assets_exist(self):
  data=json.loads((ROOT/'backend/app/shop_expansion.json').read_text());files=[r['asset_url'] for r in data['items']]+[r['asset'] for r in data['wallpapers']]
  for f in files:self.assertTrue((ROOT/'frontend'/f).is_file(),f)
  self.assertEqual(len(list((ROOT/'frontend/shop-lydia').glob('*.svg'))),573);self.assertEqual(len(list((ROOT/'frontend/shop-lydia').glob('*.webp'))),240)
if __name__=='__main__':unittest.main()
