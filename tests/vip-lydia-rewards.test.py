"""Real inventory, stable keys, gender/level checks and repeat-safe VIP claims."""
import ast,importlib,sys,types,unittest
from pathlib import Path
from sqlalchemy import create_engine,select,text
from sqlalchemy.orm import DeclarativeBase,sessionmaker
ROOT=Path(__file__).resolve().parents[1]
app=types.ModuleType('vip_test_app');app.__path__=[str(ROOT/'backend/app')];sys.modules[app.__name__]=app
base=types.ModuleType('vip_test_app.db')
class Base(DeclarativeBase):pass
base.Base=Base;sys.modules[base.__name__]=base
shop=types.ModuleType('vip_test_app.shop_expansion');shop.data=lambda:{'items':[],'wallpapers':[]};sys.modules[shop.__name__]=shop
models=importlib.import_module('vip_test_app.models');platform=importlib.import_module('vip_test_app.platform_models');cosmetics=importlib.import_module('vip_test_app.cosmetics');walls=importlib.import_module('vip_test_app.wallpapers');presentation=importlib.import_module('vip_test_app.vip_presentation')
class HTTPException(Exception):
 def __init__(self,status_code,detail):self.status_code=status_code;super().__init__(detail)
namespace={'catalog':cosmetics.catalog,'wallpaper_catalog':walls.catalog,'find_asset':cosmetics.find_asset,'find_wallpaper':walls.find,'entry_style':presentation.entry_style,'presentation_rewards':presentation.presentation_rewards,'VipStatus':platform.VipStatus,'VipRewardClaim':platform.VipRewardClaim,'UserCosmetic':models.UserCosmetic,'HTTPException':HTTPException,'text':text}
names=['vip_level','vip_level_rewards','claim_vip_level_rewards','apply_cosmetic','apply_wallpaper']
parsed=ast.parse((ROOT/'backend/app/cosmetic_routes.py').read_text())
for node in parsed.body:
 if isinstance(node,ast.FunctionDef) and node.name in names:
  node.decorator_list=[];node.returns=None;node.args.defaults=[]
  for arg in node.args.args:arg.annotation=None
  exec(compile(ast.fix_missing_locations(ast.Module(body=[node],type_ignores=[])),'production-handler','exec'),namespace)
class SQLiteSession:
 def __init__(self,db):self.db=db
 def __getattr__(self,k):return getattr(self.db,k)
 def execute(self,statement,*args,**kwargs):return self.db.execute(text(str(statement).replace(' FOR UPDATE','')),*args,**kwargs)
class VipLydia(unittest.TestCase):
 def setUp(self):
  engine=create_engine('sqlite:///:memory:');Base.metadata.create_all(engine,tables=[models.User.__table__,models.UserCosmetic.__table__,platform.VipStatus.__table__,platform.VipRewardClaim.__table__]);self.db=sessionmaker(bind=engine)();self.user=models.User(id='m',public_id='000000000001',nickname='Kaan',gender='male',lidya=500);self.db.add(self.user);self.db.flush();self.db.add(platform.VipStatus(user_id='m',level=6,total_spent=120000));self.db.commit();self.proxy=SQLiteSession(self.db)
 def tearDown(self):self.db.close()
 def test_catalog_and_gender(self):
  items=cosmetics.catalog();avatars=[i for i in items if i['vip'] and i['type']=='avatar'];self.assertEqual(len(avatars),24)
  for gender,folder in [('male','ERKEK VİP'),('female','KADIN VİP')]:
   self.user.gender=gender;rows=namespace['vip_level_rewards'](self.user);self.assertEqual(len(rows),12)
   for level,row in enumerate(rows,1):
    self.assertEqual({i['cosmetic_type'] for i in row['rewards']},{'avatar','frame','wallpaper'});self.assertEqual(len(row['rewards']),3)
    avatar=next(i for i in row['rewards'] if i['cosmetic_type']=='avatar');self.assertEqual(avatar['asset_key'],f'avatarveduvarkağıdı/BİTMİŞ AVATAR/{folder}/VİP{level}.png');self.assertIn(f'avatar-{gender}-{level}.webp',avatar['asset_url'])
    self.assertIn(f'profile-{gender}-{level}.webp',row['presentation_rewards'][0]['asset_url']);self.assertIn(f'entry-{gender}-{level}.webp',row['presentation_rewards'][1]['asset_url'])
 def test_repeat_claim_and_currency(self):
  handler=namespace['claim_vip_level_rewards'];handler(3,self.user,self.proxy);handler(3,self.user,self.proxy);self.assertEqual(len(list(self.db.scalars(select(models.UserCosmetic)))),3);self.assertEqual(self.user.lidya,500)
  with self.assertRaises(HTTPException) as e:handler(12,self.user,self.proxy)
  self.assertEqual(e.exception.status_code,403)
 def test_apply_gender_and_level(self):
  handler=namespace['apply_cosmetic'];payload=lambda k,key:types.SimpleNamespace(cosmetic_type=k,asset_key=key)
  key='vip-designs/avatar-frame-male-3.svg';handler(payload('frame',key),self.user,self.proxy);self.assertEqual(self.user.frame_asset,key)
  for key in ['vip-designs/avatar-frame-female-3.svg','vip-designs/avatar-frame-male-12.svg']:
   with self.assertRaises(HTTPException) as e:handler(payload('frame',key),self.user,self.proxy)
   self.assertEqual(e.exception.status_code,403)
if __name__=='__main__':unittest.main()
