import ast
from datetime import date, datetime, timezone
import importlib
from pathlib import Path
import sys
import types

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.pool import StaticPool

ROOT=Path(__file__).resolve().parents[1]
package=types.ModuleType('onboard_fixture');package.__path__=[str(ROOT/'backend/app')];sys.modules['onboard_fixture']=package
class Base(DeclarativeBase):pass
db_module=types.ModuleType('onboard_fixture.db');db_module.Base=Base;sys.modules['onboard_fixture.db']=db_module
models=importlib.import_module('onboard_fixture.models');schemas=importlib.import_module('onboard_fixture.schemas');policy=importlib.import_module('onboard_fixture.onboarding_policy')
CATALOG=[dict(type=kind,gender=gender,vip=vip,asset_key=f'{kind}-{gender}-{n}')for kind in ['avatar','frame']for gender in ['male','female']for vip,n in [(False,1),(False,2),(True,3)]]

@pytest.fixture
def setup():
 engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(engine)
 with Session(engine)as db:
  db.add(models.User(id='u',public_id='1234567',nickname='NewUser',lidya=0));db.commit()
 def get_db():
  with Session(engine,autoflush=False)as db:yield db
 def current_user(db=Depends(get_db)):return db.get(models.User,'u')
 env=dict(Depends=Depends,get_db=get_db,current_user=current_user,HTTPException=HTTPException,Session=Session,datetime=datetime,timezone=timezone,catalog=lambda:CATALOG,agreement=policy.agreement,eligible=policy.eligible,grant_cosmetic=policy.grant_cosmetic,OnboardingRequest=schemas.OnboardingRequest,**{name:getattr(models,name)for name in ['User','UserCosmetic','Conversation','ConversationMember','Message']})
 tree=ast.parse((ROOT/'backend/app/main.py').read_text());nodes=[]
 for node in tree.body:
  if isinstance(node,ast.FunctionDef)and node.name in ['complete_onboarding','claim_welcome_gift','get_user_agreement']:
   node.decorator_list=[];nodes.append(node)
 exec(compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),'actual_onboarding_routes','exec'),env)
 app=FastAPI();app.post('/onboarding',response_model=schemas.UserOut)(env['complete_onboarding']);app.post('/claim',response_model=schemas.UserOut)(env['claim_welcome_gift']);app.get('/terms')(env['get_user_agreement'])
 yield TestClient(app),engine
 engine.dispose()

def payload(**changes):
 terms=policy.agreement();data=dict(first_name='Kaan',last_name='Altay',birth_date='2000-01-01',gender='male',username='Kaan123',bio='',avatar_asset='avatar-male-2',frame_asset='frame-male-2',terms_accepted=True,terms_version=terms['version'],terms_digest=terms['sha256']);data.update(changes);return data

@pytest.mark.parametrize('change',[{'terms_accepted':False},{'terms_accepted':'true'},{'terms_accepted':1},{'terms_version':''},{'birth_date':'2015-01-01'},{'birth_date':'2028-01-01'},{'birth_date':'2000-02-30'},{'avatar_asset':''},{'frame_asset':None}])
def test_rejects_bad_registration(setup,change):
 client,engine=setup;assert client.post('/onboarding',json=payload(**change)).status_code==422
 with Session(engine)as db:assert not db.get(models.User,'u').profile_completed;assert db.query(models.UserCosmetic).count()==0

def test_missing_consent_and_stale_contract(setup):
 client,_=setup;data=payload();del data['terms_accepted'];assert client.post('/onboarding',json=data).status_code==422
 assert client.post('/onboarding',json=payload(terms_digest='0'*64)).status_code==409
 assert client.post('/onboarding',json=payload(terms_version='old')).json()['detail']['code']=='terms_changed'

@pytest.mark.parametrize('change',[{'avatar_asset':'avatar-male-3'},{'frame_asset':'frame-female-2'},{'frame_asset':'../frame-male-2'}])
def test_invalid_rewards_roll_back(setup,change):
 client,engine=setup;assert client.post('/onboarding',json=payload(**change)).status_code==400
 with Session(engine)as db:assert not db.get(models.User,'u').profile_completed;assert db.query(models.UserCosmetic).count()==0

def test_selected_rewards_owned_equipped_and_not_overwritten_or_duplicated(setup):
 client,engine=setup;assert client.get('/terms').json()['sha256']==policy.DIGEST
 assert client.post('/onboarding',json=payload()).status_code==200
 with Session(engine)as db:
  user=db.get(models.User,'u');assert user.avatar_asset=='avatar-male-2';assert user.frame_asset=='frame-male-2';assert user.terms_version==policy.DOCUMENT['version'];assert user.terms_digest==policy.DIGEST;assert user.terms_accepted_at;assert user.lidya==0;assert db.query(models.UserCosmetic).count()==2
 assert client.post('/onboarding',json=payload(avatar_asset='avatar-male-1')).status_code==200
 for _ in range(2):assert client.post('/claim').status_code==200
 with Session(engine)as db:
  user=db.get(models.User,'u');assert user.lidya==500;assert user.avatar_asset=='avatar-male-2';assert user.frame_asset=='frame-male-2';assert user.welcome_gift_claimed;assert db.query(models.UserCosmetic).count()==2;assert db.query(models.Message).count()==1

def test_exact_18_boundary_and_leap_day():
 assert policy.is_adult('2008-10-15',date(2026,10,15));assert not policy.is_adult('2008-10-16',date(2026,10,15))
 assert not policy.is_adult('2008-02-29',date(2026,2,28));assert policy.is_adult('2008-02-29',date(2026,3,1))


def test_reserved_username_still_rejected_with_valid_consent(setup):
 client,_=setup
 assert client.post('/onboarding',json=payload(username='ErisChat')).status_code==422
