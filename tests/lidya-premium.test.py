"""Artwork, compatibility and gender-specific task reward regression checks."""
import ast
import copy
import hashlib
import json
import types
import unittest
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]


class Expr:
    def __getattr__(self,name):return self
    def __call__(self,*args,**kwargs):return self
    def __eq__(self,value):return self


class HTTPException(Exception):
    def __init__(self,status_code,detail):self.status_code=status_code;super().__init__(detail)


class RewardTests(unittest.TestCase):
    def logic(self,gender):
        data=json.loads((ROOT/'backend/app/shop_expansion.json').read_text())
        user=types.SimpleNamespace(id='user',gender=gender)
        expr=Expr()
        db=types.SimpleNamespace(keys=set(),commits=0,amount=0)
        db.scalars=lambda *args:list(db.keys)
        db.scalar=lambda *args:user
        db.add=lambda row:db.keys.add(row.asset_key)
        db.flush=lambda:None
        def commit():db.commits+=1
        db.commit=commit
        env={'data':lambda:data,'select':expr,'User':types.SimpleNamespace(id=expr),
             'UserCosmetic':type('Cosmetic',(),{'asset_key':expr,'user_id':expr,'cosmetic_type':expr,
                 '__init__':lambda self,**kw:self.__dict__.update(kw)}),
             'LABELS':{q['metric']:q['metric'] for q in data['quests']},
             'progress':lambda *_:{q['metric']:db.amount for q in data['quests']},
             'owns':lambda _,uid,key,kind:key in db.keys,'HTTPException':HTTPException,
             'backfill_content':lambda *_:None}
        tree=ast.parse((ROOT/'backend/app/shop_expansion.py').read_text())
        functions=[]
        for fn in tree.body:
            if isinstance(fn,ast.FunctionDef) and fn.name in ('reward_for_user','task_rows','claim_task'):
                fn=copy.deepcopy(fn);fn.decorator_list=[];fn.args.defaults=[];functions.append(fn)
        exec(compile(ast.Module(body=functions,type_ignores=[]),'shop-reward-logic','exec'),env)
        return env,db,user,data

    def test_gender_rewards_remain_free_and_unbuyable(self):
        for gender in ('female','male'):
            env,db,u,data=self.logic(gender)
            reward=env['reward_for_user'](data['quests'][0],u)
            self.assertEqual(reward['gender'],gender)
            self.assertEqual(reward['price'],0)
            self.assertTrue(reward['task_only'])
            self.assertIn(f'title-{gender}-01',reward['asset_key'])

    def test_unearned_gender_title_cannot_be_claimed(self):
        env,db,u,data=self.logic('female')
        with self.assertRaises(HTTPException) as ctx:env['claim_task']('title-01',u,db)
        self.assertEqual(ctx.exception.status_code,403)
        self.assertEqual(db.keys,set())

    def test_existing_earned_title_migrates_once_without_progress_requirement(self):
        for gender in ('female','male'):
            env,db,u,data=self.logic(gender)
            db.keys.add('shop-expansion/title-01.svg')
            first=env['claim_task']('title-01',u,db)
            self.assertTrue(first['already_claimed'])
            self.assertEqual(db.amount,0)
            second=env['claim_task']('title-01',u,db)
            self.assertEqual(first['asset_key'],second['asset_key'])
            self.assertEqual(len(db.keys),2)
            self.assertEqual(db.commits,1)

    def test_task_listing_preserves_earned_status_and_backfills_variant_once(self):
        env,db,u,data=self.logic('male')
        db.keys.add('shop-expansion/title-01.svg')
        first=env['task_rows'](db,u);second=env['task_rows'](db,u)
        self.assertTrue(first[0]['claimed']);self.assertTrue(second[0]['claimed'])
        self.assertEqual(first[0]['reward']['gender'],'male')
        self.assertEqual(len(db.keys),2)


class ArtworkTests(unittest.TestCase):
    def test_actual_artwork_is_unique_and_progress_is_honest(self):
        progress=json.loads((ROOT/'docs/lidya-premium-progress.json').read_text())
        plan=json.loads((ROOT/'docs/lidya-premium-production.json').read_text())
        files=list((ROOT/'frontend/shop-lydia-premium').glob('*.png'))
        self.assertEqual(len(files),progress['generated'])
        self.assertEqual(progress['remaining'],800-len(files))
        self.assertEqual(sum(a['status']=='generated' for a in plan['assets']),len(files))
        self.assertEqual(len({hashlib.sha256(p.read_bytes()).hexdigest() for p in files}),len(files))
        self.assertEqual(len(plan['assets']),800)
        for gender in ('female','male'):
            for kind in ('profile','frame','bubble','entrance','title'):
                self.assertEqual(sum(a['gender']==gender and a['type']==kind for a in plan['assets']),80)

    def test_profiles_keep_center_free_and_png_alpha_real(self):
        for p in (ROOT/'frontend/shop-lydia-premium').glob('*.png'):
            with Image.open(p) as im:
                self.assertEqual(im.mode,'RGBA',p.name)
                self.assertEqual(im.getchannel('A').getextrema()[0],0,p.name)
                if p.name.startswith('profile-'):
                    w,h=im.size
                    self.assertLess(im.getchannel('A').crop((int(w*.3),int(h*.3),int(w*.7),int(h*.7))).getextrema()[1],128,p.name)


if __name__=='__main__':unittest.main()
