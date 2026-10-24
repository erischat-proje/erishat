import unittest
from datetime import datetime,timezone,timedelta
from fastapi import Depends,Header,HTTPException
from sqlalchemy import select,delete
from sqlalchemy.orm import Session
import test_explore_workspace as w
from backend.app import privacy_center as pc
from backend.app.db import get_db
from backend.app.models import User
from backend.app.platform_models import UserPrivacy,UserSocialPrivacy,PrivateProfileSetting,UserBlock
class PrivacyTest(unittest.TestCase):
 def setUp(self):
  self.base=w.ExploreWorkspace();self.base.setUp();self.addCleanup(self.base.doCleanups);self.engine=self.base.engine;self.client=self.base.client
  for model in [UserPrivacy,UserSocialPrivacy,PrivateProfileSetting]:model.__table__.create(self.engine,checkfirst=True)
  def auth(db=Depends(get_db),x_user:str=Header('viewer')):
   u=db.get(User,x_user)
   if not u:raise HTTPException(401)
   return u
  self.base.app.include_router(pc.register_auth(auth))
 def tearDown(self):self.base.tearDown()
 def call(self,m,path='',**kw):return self.client.request(m,'/v1/privacy-center'+path,**kw)
 def save(self,c,e=None):return self.call('PATCH',json={'changes':c,'expected':e or {k:False for k in c}})
 def add(self,n=1):
  with Session(self.engine) as db:
   rows=[]
   for i in range(n):
    u=User(id='t'+str(i),public_id=str(2000000000+i),nickname='Name %_ '+str(i));db.add(u);db.flush();b=UserBlock(blocker_id='viewer',blocked_id=u.id,created_at=datetime.now(timezone.utc));db.add(b);db.flush();rows.append({'id':b.id,'created_at':b.created_at.isoformat()})
   db.commit();return rows
 def unblock(self,items,confirm=True):return self.call('POST','/blocks/unblock',json={'items':items,'confirm':confirm})
 def test_defaults_and_headers(self):
  r=self.call('GET');self.assertEqual(len(r.json()),10);self.assertFalse(any(r.json().values()));self.assertIn('no-store',r.headers['cache-control']);self.assertEqual(self.call('GET',headers={'x-user':'missing'}).status_code,401)
 def test_save_and_atomic_conflict(self):
  self.assertEqual(self.save({'hide_fans':True}).status_code,200);r=self.save({'hide_fans':False,'is_private':True,'hide_notifications':True});self.assertEqual(r.status_code,409);s=self.call('GET').json();self.assertTrue(s['hide_fans']);self.assertFalse(s['is_private']);self.assertFalse(s['hide_notifications'])
 def test_tables_and_unrelated_fields(self):
  with Session(self.engine) as db:db.get(User,'viewer').lidya=321;db.commit()
  self.assertEqual(self.save({'is_private':True,'hide_location':True,'hide_notifications':True}).status_code,200)
  self.assertEqual(self.save({'hide_fans':True}).status_code,200)
  with Session(self.engine) as db:self.assertTrue(db.get(PrivateProfileSetting,'viewer').is_private);self.assertFalse(db.get(User,'viewer').notifications_enabled);self.assertEqual(db.get(User,'viewer').lidya,321)
 def test_strict_and_vip_bundle(self):
  for changes in [{'lidya':True},{'hide_fans':'true'},{'hide_vip':True}]:self.assertEqual(self.save(changes).status_code,422)
  bundle={k:True for k in ('hide_vip',*pc.VIP)};self.assertEqual(self.save(bundle).status_code,200);self.assertEqual(self.save({'hide_vip_badge':False},{'hide_vip_badge':True}).status_code,422)
 def test_pagination_search_and_owner(self):
  items=self.add(105);p=self.call('GET','/blocks').json();ids=[r['id'] for r in p['items']];cursor=p['next_cursor'];self.assertEqual(self.call('GET','/blocks',params={'cursor':cursor},headers={'x-user':'author'}).status_code,422)
  while cursor:
   p=self.call('GET','/blocks',params={'cursor':cursor}).json();ids.extend(r['id'] for r in p['items']);cursor=p['next_cursor']
  self.assertEqual(ids,[r['id'] for r in reversed(items)]);self.assertEqual(len(self.call('GET','/blocks',params={'q':'%_','limit':50}).json()['items']),50)
 def test_unblock_limits_confirmation_and_success(self):
  items=self.add(21);self.assertEqual(self.unblock(items).status_code,422);self.assertEqual(self.unblock(items[:1],False).status_code,422);self.assertEqual(self.unblock(items[:1]*2).status_code,422);r=self.unblock(items[:20]);self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['count'],20)
 def test_stale_and_other_account_atomic(self):
  items=self.add(2)
  with Session(self.engine) as db:db.get(UserBlock,items[-1]['id']).created_at=datetime.now(timezone.utc)+timedelta(seconds=10);db.commit()
  self.assertEqual(self.unblock(items).status_code,409);self.assertEqual(len(self.call('GET','/blocks').json()['items']),2)
  self.assertEqual(self.call('POST','/blocks/unblock',headers={'x-user':'author'},json={'items':items,'confirm':True}).status_code,409)
 def test_real_visibility_and_cursor_validation(self):
  with Session(self.engine) as db:db.add(UserBlock(blocker_id='viewer',blocked_id='author'));db.commit()
  self.assertNotIn(1,self.base.ids(mode='recent'));r=next(r for r in self.call('GET','/blocks').json()['items'] if r['user_id']=='author');self.assertEqual(self.unblock([{'id':r['id'],'created_at':r['created_at']}]).status_code,200);self.assertIn(1,self.base.ids(mode='recent'))
  for params in [{'cursor':'!'},{'limit':51},{'q':'x'*101}]:self.assertEqual(self.call('GET','/blocks',params=params).status_code,422)
