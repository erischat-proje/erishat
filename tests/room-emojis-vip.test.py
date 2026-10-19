"""Run actual reaction handler in an isolated DB harness; no production services."""
import ast
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace as NS
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('room_emoji_access',ROOT/'backend/app/room_emoji_access.py')
access=importlib.util.module_from_spec(spec);spec.loader.exec_module(access)
class Field:
    def __eq__(self,other):return self
    def __le__(self,other):return self
class Model(Field):
    def __getattr__(self,name):return self
class Query:
    def __init__(self,result=None):self.result=result
    def filter(self,*args):return self
    def first(self):return self.result
    def where(self,*args):return self
class DB:
    def __init__(self,level):self.level=level;self.ghost=False;self.banned=False;self.muted=False;self.seated=True
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def get(self,model,key):
        if model is models['User']:return NS(is_active=True)
        if model is models['Room']:return NS(chat_enabled=True,seat_count=16)
        if model is models['VipStatus']:return NS(level=self.level) if self.level else None
        return None
    def query(self,model):
        return Query(NS(ghost=self.ghost)) if model is models['RoomMember'] else Query(NS() if self.banned else None)
    def scalar(self,q):
        if q.result is models['RoomSeat']:return NS(seat_number=1) if self.seated else None
        if q.result is models['RoomChatMute']:return 1 if self.muted else None
        return None
models={name:Model() for name in ['User','Room','RoomMember','RoomSeat','VipStatus','AdminRole','RoomBan','RoomChatMute','UserBlock']}
source=ast.parse((ROOT/'backend/app/main.py').read_text())
chosen=[]
for n in source.body:
    if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'ROOM_REACTION_IDS','ROOM_INTERACTION_IDS'} for t in n.targets):chosen.append(n)
    if isinstance(n,ast.FunctionDef) and n.name=='_room_socket_reaction':chosen.append(n)
ctx={**models,'room_emoji_access':access,'datetime':datetime,'timedelta':timedelta,'timezone':timezone,'uuid4':uuid4,'engine':None,'select':lambda m:Query(m),'or_':lambda *x:None,'and_':lambda *x:None,'active_ban':lambda *a,**k:None,'active_room_user_ban':lambda *a:None}
exec(compile(ast.Module(body=chosen,type_ignores=[]),'reaction-handler','exec'),ctx)
class AccessTests(unittest.TestCase):
    def test_each_level_and_legacy(self):
        for level in range(13):
            db=DB(level);ctx['Session']=lambda *a:db
            for required in range(1,13):
                result=ctx['_room_socket_reaction']('r','R','u',f'vip_{required}')
                self.assertEqual('payload' in result,level>=required,(level,required,result))
                if level>=required:self.assertEqual(result['payload']['reaction_id'],f'vip_{required}')
            self.assertIn('payload',ctx['_room_socket_reaction']('r','R','u','laugh'))
            ctx['vip_privileges']=NS(active=lambda *args:{'stickers':'enabled'})
            for n in range(1,13):
                result=ctx['_room_socket_reaction']('r','R','u',f'lidya_sticker_{n}')
                self.assertEqual('payload' in result,level>=(1 if n<=6 else 2))
            ctx['vip_privileges']=NS(active=lambda *args:{})
            self.assertIn('error',ctx['_room_socket_reaction']('r','R','u','lidya_sticker_1'))
            self.assertEqual(access.entitlement(NS(level=level))['unlocked_ids'],[f'vip_{n}' for n in range(1,level+1)]+[f'lidya_sticker_{n}' for n in range(1,13) if level >= (1 if n<=6 else 2)])
    def test_restrictions_remain(self):
        for key in ['ghost','banned','muted']:
            db=DB(12);setattr(db,key,True);ctx['Session']=lambda *a:db
            self.assertIn('error',ctx['_room_socket_reaction']('r','R','u','vip_12'),key)
        db=DB(12);db.seated=False;ctx['Session']=lambda *a:db
        self.assertIn('error',ctx['_room_socket_reaction']('r','R','u','vip_12'))
        db.seated=True
        for reaction,target in [('vip_13',None),('vip_12','other'),('send_heart','u'),(None,None),([],None)]:
            self.assertIn('error',ctx['_room_socket_reaction']('r','R','u',reaction,target))
    def test_missing_row_and_catalog_parity(self):
        self.assertEqual(access.entitlement(None),{'level':0,'unlocked_ids':[]})
        js=(ROOT/'frontend/room-emojis.js').read_text();catalog=json.loads(js.split('const catalog = ',1)[1].split(';',1)[0])
        self.assertEqual({x['id']:x['level'] for x in catalog if x['level']},access.VIP_EMOJI_LEVELS)
        self.assertEqual(len(catalog),52)
        for item in catalog:self.assertTrue((ROOT/'frontend'/item['asset'].removeprefix('./')).is_file(),item['id'])
if __name__=='__main__':unittest.main()
