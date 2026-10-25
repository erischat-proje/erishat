import os, unittest
os.environ.setdefault('DATABASE_URL','sqlite://')
from datetime import date
from types import SimpleNamespace
from fastapi import FastAPI, Header, Depends, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from backend.app.db import get_db
from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app.contact_aliases import register_auth,ContactAlias
from backend.app.profile_age import age_years,visible_age
class IdentityTest(unittest.TestCase):
 def setUp(self):
  self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
  User.__table__.create(self.engine);AdminRole.__table__.create(self.engine);ContactAlias.__table__.create(self.engine)
  with Session(self.engine) as db:
   db.add_all([User(id=x,public_id=x,nickname=x) for x in ['a','b','c']]);db.commit()
  def session():
   with Session(self.engine) as db:yield db
  def auth(db=Depends(get_db),x_user:str=Header('a')):
   u=db.get(User,x_user)
   if not u:raise HTTPException(401)
   return u
  app=FastAPI();app.dependency_overrides[get_db]=session;app.include_router(register_auth(auth));self.client=TestClient(app)
  self.addCleanup(self.client.close);self.addCleanup(self.engine.dispose)
 def test_alias_lifecycle_and_isolation(self):
  c=self.client;p='/v1/me/contact-aliases';self.assertEqual(c.put(p+'/b',json={'alias':' Dostum '}).status_code,200)
  self.assertEqual(c.get(p).json()['aliases'],{'b':'Dostum'})
  self.assertEqual(c.get(p,headers={'x-user':'c'}).json()['aliases'],{})
  with Session(self.engine) as db:db.get(User,'b').nickname='Yeni isim';db.commit()
  self.assertEqual(c.get(p).json()['aliases']['b'],'Dostum')
  c.put(p+'/b',json={'alias':'Kardeşim'});self.assertEqual(c.get(p).json()['aliases']['b'],'Kardeşim')
  c.delete(p+'/b',headers={'x-user':'c'});self.assertIn('b',c.get(p).json()['aliases'])
  c.delete(p+'/b');c.delete(p+'/b');self.assertEqual(c.get(p).json()['aliases'],{})
 def test_validation_auth_cache(self):
  c=self.client;p='/v1/me/contact-aliases'
  for a in ['', '  ', 'x'*65, 'a\nb']:self.assertEqual(c.put(p+'/b',json={'alias':a}).status_code,422)
  self.assertEqual(c.put(p+'/a',json={'alias':'Ben'}).status_code,400)
  self.assertEqual(c.put(p+'/missing',json={'alias':'Yok'}).status_code,404)
  self.assertEqual(c.get(p,headers={'x-user':'missing'}).status_code,401)
  self.assertIn('no-store',c.get(p).headers['cache-control'])
 def test_age_dates(self):
  self.assertEqual(age_years('2000-10-26',date(2026,10,25)),25)
  self.assertEqual(age_years('2000-10-26',date(2026,10,26)),26)
  self.assertEqual(age_years('2000-02-29',date(2025,2,28)),24)
  self.assertEqual(age_years('2000-02-29',date(2025,3,1)),25)
  for x in [None,'bad','3000-01-01','1800-01-01']:self.assertIsNone(age_years(x))
 def test_visibility(self):
  u=SimpleNamespace(id='b',birth_date='2000-01-01')
  for options in [{'private':True},{'blocked':True},{'staff':True}]:self.assertIsNone(visible_age(u,'a',**options))
  self.assertIsInstance(visible_age(u,'a',private=True,following=True),int)
  self.assertIsInstance(visible_age(u,'b',private=True),int)
if __name__=='__main__':unittest.main()
