"""Ownership, prices, rewards and room lease regression coverage."""
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from datetime import datetime,timedelta,timezone
from sqlalchemy import select,BigInteger,Integer
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.db import Base,engine
from app.models import User,UserCosmetic
from app import shop_expansion as shop
from app.schemas import CosmeticPurchase,CosmeticApply
from app.cosmetic_routes import purchase_cosmetic,apply_cosmetic,appearance_inventory,equip_vip_entrance,reset_cosmetic

class ShopExpansionTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.logdir=tempfile.TemporaryDirectory()
  cls.logpatch=patch('app.system_logs.ROOT',Path(cls.logdir.name));cls.logpatch.start()
  cls.addClassCleanup(cls.logpatch.stop);cls.addClassCleanup(cls.logdir.cleanup)
  from app import room_routes,main
  import app.relationship_models
  for table in Base.metadata.tables.values():
   for col in table.columns:
    if col.primary_key and isinstance(col.type,BigInteger) and 'sqlite' not in col.type._variant_mapping:col.type=col.type.with_variant(Integer(),'sqlite')
  Base.metadata.create_all(engine)
  room_routes.register_room_auth(lambda:None)
  cls.buy=staticmethod(next(r.endpoint for r in room_routes.router.routes if r.path.endswith('/{room_id}/wallpaper') and 'POST' in r.methods))
  cls.apply_wall=staticmethod(next(r.endpoint for r in room_routes.router.routes if r.path.endswith('/{room_id}/wallpaper/apply')))
 def user(self,db,gender='female',balance=50000):
  uid=uuid4().hex;u=User(id=uid,public_id=uid[:20],nickname='Test',gender=gender,lidya=balance);db.add(u);db.commit();return u
 def buy_asset(self,db,u,kind,n=1):
  key=f'shop-expansion/{kind}-{u.gender}-{n:02d}.'+('png' if kind=='avatar' else 'svg')
  result=purchase_cosmetic(CosmeticPurchase(cosmetic_type=kind,asset_key=key),u,db);return key,result
 def test_catalog_is_additive_and_exact_counts(self):
  from app.cosmetics import catalog
  items=shop.data()['items'];self.assertEqual(len(items),731)
  for kind in ('avatar','frame','bubble','entrance','profile'):
   for g in ('female','male'):self.assertEqual(sum(i['type']==kind and i['gender']==g for i in items), (6 if g=='female' else 5) if kind=='profile' else 80)
  self.assertEqual(sum(i['type']=='title' for i in items),80);self.assertEqual(len(shop.data()['wallpapers']),80)
  self.assertTrue(all(i['price']==1500 for i in items if i['type']=='bubble'))
  old=[i for i in catalog() if not i.get('expansion')];self.assertGreaterEqual(len(old),146)
  self.assertEqual(len({i['asset_key'] for i in items}),731);self.assertEqual(len({q['reward']['name'] for q in shop.data()['quests']}),80)
 def test_purchase_charges_once_and_selection_persists(self):
  with Session(engine) as db:
   u=self.user(db);key,result=self.buy_asset(db,u,'bubble');self.assertEqual(result['spent'],1500);self.assertEqual(u.lidya,48500)
   with self.assertRaises(HTTPException) as ctx:purchase_cosmetic(CosmeticPurchase(cosmetic_type='bubble',asset_key=key),u,db)
   self.assertEqual(ctx.exception.status_code,409);db.rollback();self.assertEqual(db.get(User,u.id).lidya,48500)
   apply_cosmetic(CosmeticApply(cosmetic_type='bubble',asset_key=key),u,db);self.assertEqual(u.bubble_asset,key)
   reset_cosmetic({'cosmetic_type':'bubble'},u,db);self.assertIsNone(u.bubble_asset);self.assertTrue(shop.owns(db,u.id,key,'bubble'))
 def test_paid_profile_purchase_apply_inventory_and_reset(self):
  for gender in ('female','male'):
   with Session(engine) as db:
    u=self.user(db,gender=gender);key=f'shop-expansion/profile-{gender}-01.svg'
    payload=CosmeticApply(cosmetic_type='profile',asset_key=key)
    with self.assertRaises(HTTPException):apply_cosmetic(payload,u,db)
    purchase_cosmetic(CosmeticPurchase(cosmetic_type='profile',asset_key=key),u,db)
    self.assertEqual(u.lidya,48500);apply_cosmetic(payload,u,db);self.assertEqual(u.profile_asset,key)
    inv=appearance_inventory(u,db);self.assertTrue(any(x['type']=='profile' and x['asset_key']==key and x['equipped'] for x in inv['items']))
    other='male' if gender=='female' else 'female'
    with self.assertRaises(HTTPException):purchase_cosmetic(CosmeticPurchase(cosmetic_type='profile',asset_key=f'shop-expansion/profile-{other}-01.svg'),u,db)
    reset_cosmetic({'cosmetic_type':'profile'},u,db);self.assertIsNone(u.profile_asset);self.assertTrue(shop.owns(db,u.id,key,'profile'))
 def test_gender_balance_and_ownership_enforced(self):
  with Session(engine) as db:
   u=self.user(db,balance=500);key='shop-expansion/avatar-female-01.png'
   for payload in [CosmeticPurchase(cosmetic_type='avatar',asset_key=key),CosmeticPurchase(cosmetic_type='frame',asset_key='shop-expansion/frame-male-01.svg')]:
    with self.assertRaises(HTTPException):purchase_cosmetic(payload,u,db)
   with self.assertRaises(HTTPException):apply_cosmetic(CosmeticApply(cosmetic_type='avatar',asset_key=key),u,db)
   self.assertEqual(u.lidya,500);self.assertFalse(shop.owns(db,u.id,key,'avatar'))
 def test_unfinished_profile_is_not_sold(self):
  from app.cosmetics import catalog
  key='shop-expansion/profile-female-80.svg'
  self.assertFalse(any(i['asset_key']==key for i in catalog()))
  with Session(engine) as db:
   u=self.user(db)
   with self.assertRaises(HTTPException) as ctx:purchase_cosmetic(CosmeticPurchase(cosmetic_type='profile',asset_key=key),u,db)
   self.assertEqual(ctx.exception.status_code,404);self.assertEqual(u.lidya,50000)
 def test_task_reward_cannot_be_bought_or_claimed_early(self):
  with Session(engine) as db:
   u=self.user(db)
   with self.assertRaises(HTTPException):purchase_cosmetic(CosmeticPurchase(cosmetic_type='title',asset_key='shop-expansion/title-01.svg'),u,db)
   with self.assertRaises(HTTPException):shop.claim_task('title-01',u,db)
   self.assertEqual(u.lidya,50000)
 def test_daily_progress_and_claim_are_idempotent(self):
  with Session(engine) as db:
   u=self.user(db);rows=shop.list_tasks(u,db)['items'];self.assertTrue(rows[0]['complete']);shop.list_tasks(u,db)
   self.assertEqual(shop.progress(db,u.id)['days'],1)
   first=shop.claim_task('title-01',u,db);second=shop.claim_task('title-01',u,db);self.assertFalse(first['already_claimed']);self.assertTrue(second['already_claimed'])
   key=first['asset_key'];apply_cosmetic(CosmeticApply(cosmetic_type='title',asset_key=key),u,db)
   self.assertEqual(u.title_asset,key);self.assertEqual(u.lidya,50000);self.assertEqual(len([i for i in appearance_inventory(u,db)['items'] if i['asset_key']==key]),1)
 def test_system_messages_do_not_advance_chat_tasks(self):
  from app.room_models import Room,RoomChatMessage
  from app.seat_workflow import RoomSystemEntry
  with Session(engine) as db:
   u=self.user(db);room=Room(id=uuid4().hex,public_id=uuid4().hex[:12],owner_id=u.id,name='Test');db.add(room);db.flush()
   auto=RoomChatMessage(room_id=room.id,user_id=u.id,text='Odaya katıldı');real=RoomChatMessage(room_id=room.id,user_id=u.id,text='Merhaba');empty=RoomChatMessage(room_id=room.id,user_id=u.id,text='   ')
   db.add_all([auto,real,empty]);db.flush();db.add(RoomSystemEntry(message_id=auto.id));db.commit();self.assertEqual(shop.progress(db,u.id)['room_messages'],1)
 def test_room_visit_is_distinct_and_story_progress_survives_deletion(self):
  from app.platform_models import SocialStory
  with Session(engine) as db:
   u=self.user(db);shop.record_event(db,u.id,'rooms','room-1');db.flush();shop.record_event(db,u.id,'rooms','room-1');db.commit();self.assertEqual(shop.progress(db,u.id)['rooms'],1)
   story=SocialStory(user_id=u.id,caption='Anı',mime_type='image/png',expires_at=datetime.now(timezone.utc)+timedelta(days=1));db.add(story);db.flush();shop.record_event(db,u.id,'stories',story.id);db.commit();db.delete(story);db.commit();self.assertEqual(shop.progress(db,u.id)['stories'],1)
 def test_entry_owned_selection_and_normal_fallback(self):
  from app.vip_presentation import entry_selection
  with Session(engine) as db:
   u=self.user(db)
   with self.assertRaises(HTTPException):equip_vip_entrance({'asset_key':'shop-expansion/entrance-female-01.svg'},u,db)
   key,_=self.buy_asset(db,u,'entrance');equip_vip_entrance({'asset_key':key},u,db);self.assertEqual(shop.selected_entry(db,u),key);self.assertEqual(entry_selection(db,u.id),('shop',0))
   self.assertEqual(len([i for i in appearance_inventory(u,db)['items'] if i['asset_key']==key]),1);equip_vip_entrance({'asset_key':'normal'},u,db);self.assertIsNone(shop.selected_entry(db,u))
 def test_room_leases_preserve_each_other_and_renew_expiry(self):
  from app.room_models import Room
  from app.room_routes import RoomWallpaperUpdate
  with Session(engine) as db:
   u=self.user(db,balance=100000);room=Room(id=uuid4().hex,public_id=uuid4().hex[:12],owner_id=u.id,name='Test');db.add(room);db.commit()
   first=self.buy(room.id,RoomWallpaperUpdate(asset_key='wallpaper_expansion_01',days=7),db,u);self.assertEqual(first['spent'],7500)
   self.buy(room.id,RoomWallpaperUpdate(asset_key='wallpaper_expansion_02',days=1),db,u);self.assertEqual(len(shop.room_inventory(db,u)),2)
   applied=self.apply_wall(room.id,db,u,{'asset_key':'wallpaper_expansion_01'});self.assertEqual(applied['asset_key'],'wallpaper_expansion_01');self.assertEqual(u.lidya,91000)
   renewed=self.buy(room.id,RoomWallpaperUpdate(asset_key='wallpaper_expansion_01',days=1),db,u);self.assertAlmostEqual((shop.utc(renewed['paid_until'])-shop.utc(first['paid_until'])).total_seconds(),86400,delta=1)
 def test_expired_and_other_room_leases_rejected(self):
  from app.room_models import Room
  with Session(engine) as db:
   u=self.user(db);room=Room(id=uuid4().hex,public_id=uuid4().hex[:12],owner_id=u.id,name='Test');db.add(room);db.flush();db.add(shop.RoomAppearanceLease(room_id=room.id,asset_key='wallpaper_expansion_01',paid_until=datetime.now(timezone.utc)-timedelta(days=1)));db.commit()
   with self.assertRaises(HTTPException):self.apply_wall(room.id,db,u,{'asset_key':'wallpaper_expansion_01'})
   self.assertTrue(shop.room_inventory(db,u)[0]['expired'])
 def test_live_room_message_uses_current_appearance_without_rejoin(self):
  from app.room_models import Room,RoomMember
  from app.main import _room_socket_chat
  with Session(engine) as db:
   u=self.user(db);uid=u.id;room=Room(id=uuid4().hex,public_id=uuid4().hex[:12],owner_id=uid,name='Live');db.add(room);db.flush();db.add(RoomMember(room_id=room.id,user_id=uid));db.commit();room_id=room.id
   db.refresh(u);db.expunge(u);stale=u
  with Session(engine) as db:
   current=db.get(User,uid);key,_=self.buy_asset(db,current,'bubble');apply_cosmetic(CosmeticApply(cosmetic_type='bubble',asset_key=key),current,db)
  self.assertIsNone(stale.bubble_asset)
  payload=_room_socket_chat(room_id,room_id,stale,'Yeni görünüm')['payload'];self.assertEqual(payload['bubble_asset'],key)
 def test_retirement_migration_keeps_new_purchases(self):
  from app.appearance_refresh import refresh_user,replacement
  with Session(engine) as db:
   u=self.user(db);key,_=self.buy_asset(db,u,'frame');apply_cosmetic(CosmeticApply(cosmetic_type='frame',asset_key=key),u,db);refresh_user(db,u);self.assertEqual(u.frame_asset,key)
   self.assertEqual(replacement('wallpaper_expansion_01','female',0,'wallpaper'),'wallpaper_expansion_01')

if __name__=='__main__':unittest.main()
