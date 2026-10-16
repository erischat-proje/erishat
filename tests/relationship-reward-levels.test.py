"""Real SQLite inventory checks and the production equip handler with isolated dependencies."""
import ast
import importlib
from pathlib import Path
import sys
import types
import unittest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import DeclarativeBase, sessionmaker

ROOT = Path(__file__).resolve().parents[1]
APP = types.ModuleType('reward_test_app'); APP.__path__ = [str(ROOT / 'backend/app')]
sys.modules[APP.__name__] = APP
DB = types.ModuleType('reward_test_app.db')
class Base(DeclarativeBase): pass
DB.Base = Base; sys.modules[DB.__name__] = DB
models = importlib.import_module('reward_test_app.models')
couples = importlib.import_module('reward_test_app.relationship_models')
rewards = importlib.import_module('reward_test_app.relationship_rewards')
platform = importlib.import_module('reward_test_app.platform_models')

class HTTPException(Exception):
    def __init__(self, status_code, detail): self.status_code = status_code; super().__init__(detail)

class RewardLevels(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        classes = [models.User, models.UserCosmetic, couples.Couple, couples.CoupleMember,
                   couples.CoupleRewardSelection, couples.CoupleRing, platform.VipStatus]
        Base.metadata.create_all(self.engine, tables=[c.__table__ for c in classes])
        self.db = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)()
        self.male = models.User(id='m', public_id='000000000001', nickname='Kaan', gender='male', lidya=999)
        self.female = models.User(id='f', public_id='000000000002', nickname='Filiz', gender='female', lidya=888)
        self.house = couples.Couple(id='h', male_id='m', female_id='f', active=True, level=1)
        self.db.add_all([self.male, self.female]); self.db.flush(); self.db.add(self.house); self.db.flush()
        self.db.add_all([couples.CoupleMember(user_id='m', couple_id='h'), couples.CoupleMember(user_id='f', couple_id='h')]); self.db.commit()
        node = next(n for n in ast.parse((ROOT/'backend/app/relationship_routes.py').read_text()).body if isinstance(n, ast.FunctionDef) and n.name == 'equip_reward')
        node.decorator_list=[]; node.args.defaults=[]
        for arg in node.args.args: arg.annotation=None
        node.returns=None
        scope={'rewards':rewards, 'CoupleRewardSelection':couples.CoupleRewardSelection,
               'HTTPException':HTTPException, 'owned_house':lambda db,uid,lock=True:rewards.house_for(db,uid), '__package__':APP.__name__}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[node],type_ignores=[])),'production-equip','exec'),scope)
        self.equip=scope['equip_reward']

    def tearDown(self): self.db.close(); self.engine.dispose()

    def test_all_levels_grant_both_variants_once(self):
        for level in range(1,13):
            self.house.level=level; rewards.ensure_rewards(self.db,self.house); self.db.commit()
            rewards.ensure_rewards(self.db,self.house); self.db.commit()
            for user in (self.male,self.female):
                personal=[r for r in rewards.items(user.gender) if r['type']!='ring']
                self.assertEqual(len(personal),24)
                self.assertTrue(all(r['gender']==user.gender for r in personal))
                for n in range(1,13): self.assertEqual(sum(r['level']==n for r in personal),2)
                inventory=list(self.db.scalars(select(models.UserCosmetic).where(models.UserCosmetic.user_id==user.id)))
                owned={row.asset_key for row in inventory}
                self.assertEqual(len([r for r in personal if r['asset_key'] in owned]),level*2)
                self.assertFalse(any(r['level']>level and r['asset_key'] in owned for r in personal))
                self.assertEqual(len(inventory),len(owned))
            self.assertEqual(len(list(self.db.scalars(select(couples.CoupleRing)))),(level>=6)+(level>=12))
        self.assertEqual((self.male.lidya,self.female.lidya),(999,888))

    def test_equip_rejects_locked_wrong_gender_and_legacy(self):
        self.house.level=3; rewards.ensure_rewards(self.db,self.house); self.db.commit()
        chosen=next(r for r in rewards.items('male') if r['type']=='frame' and r['level']==3)
        self.equip(types.SimpleNamespace(kind='frame',asset_key=chosen['asset_key']),self.db,self.male)
        self.assertEqual(self.male.frame_asset,chosen['asset_key'])
        self.assertEqual(rewards.selected(self.db,'m','frame'),chosen['asset_key'])
        for key in [chosen['asset_key'].replace('-male-','-female-'), rewards.PREFIX+'cerceve-male-l11.png', rewards.PREFIX+'cerceve-male-1.png']:
            with self.assertRaises(HTTPException) as error:self.equip(types.SimpleNamespace(kind='frame',asset_key=key),self.db,self.male)
            self.assertEqual(error.exception.status_code,403)
        self.equip(types.SimpleNamespace(kind='frame',asset_key=None),self.db,self.male)
        self.assertIsNone(self.male.frame_asset)
        entrance=next(r for r in rewards.items('male') if r['type']=='entrance' and r['level']==2)
        self.equip(types.SimpleNamespace(kind='entrance',asset_key=entrance['asset_key']),self.db,self.male)
        self.assertEqual(self.db.get(platform.VipStatus,'m').entry_effect,'relationship')

    def test_legacy_selection_is_replaced_and_external_assets_preserved(self):
        self.house.level=8
        for kind,key in [('bubble','sohbet-male-1.png'),('title','unvan-1.png'),('frame','cerceve-male-1.png'),('entrance','entrance-male-1.png')]:
            asset=rewards.PREFIX+key
            self.db.add(models.UserCosmetic(user_id='m',cosmetic_type=kind,asset_key=asset))
            self.db.add(couples.CoupleRewardSelection(user_id='m',kind=kind,asset_key=asset))
            if kind=='frame':self.male.frame_asset=asset
        external='shop-premium-v2/frame-female-12.png';self.female.frame_asset=external
        self.db.add(models.UserCosmetic(user_id='f',cosmetic_type='frame',asset_key=external));self.db.commit()
        rewards.ensure_rewards(self.db,self.house);self.db.commit()
        for kind in ('bubble','title','frame','entrance'):
            key=self.db.get(couples.CoupleRewardSelection,('m',kind)).asset_key
            self.assertIn('-male-l',key);self.assertFalse(rewards.is_legacy_asset(key))
        self.assertIn('-male-l',self.male.frame_asset);self.assertEqual(self.female.frame_asset,external)
        owned=list(self.db.scalars(select(models.UserCosmetic)))
        self.assertFalse(any(rewards.is_legacy_asset(r.asset_key) for r in owned))
        rewards.revoke(self.db,self.house);self.db.commit()
        self.assertFalse(any(r.asset_key.startswith(rewards.PREFIX) for r in self.db.scalars(select(models.UserCosmetic))))
        self.assertEqual(self.female.frame_asset,external)
        self.assertEqual((self.male.lidya,self.female.lidya),(999,888))

if __name__=='__main__':unittest.main()
