"""Crash production handlers and receipts under real SQLAlchemy/FastAPI with isolated SQLite."""
import ast,importlib,json,sys,types
from datetime import datetime,timedelta,timezone
from pathlib import Path
from uuid import uuid4
import pytest
from fastapi import APIRouter,Depends,FastAPI,HTTPException,Query
from fastapi.testclient import TestClient
from sqlalchemy import Column,String,Table,create_engine,func,select,text
from sqlalchemy.orm import DeclarativeBase,Session
from sqlalchemy.pool import StaticPool

root=Path(__file__).resolve().parents[1]
pkg=types.ModuleType('_crash_test_app');pkg.__path__=[str(root/'backend/app')];sys.modules[pkg.__name__]=pkg
class Base(DeclarativeBase):pass
stub=types.ModuleType('_crash_test_app.db');stub.Base=Base;sys.modules[stub.__name__]=stub
models=importlib.import_module('_crash_test_app.models');platform=importlib.import_module('_crash_test_app.platform_models');service=importlib.import_module('_crash_test_app.crash_final')
User,GameBet,GameRound=models.User,platform.GameBet,platform.GameRound
rooms=Table('rooms',Base.metadata,Column('id',String(64),primary_key=True))
@pytest.fixture
def db():
 engine=create_engine('sqlite:///:memory:',poolclass=StaticPool,connect_args={'check_same_thread':False})
 Base.metadata.create_all(engine,tables=[User.__table__,rooms,GameBet.__table__,GameRound.__table__,service.CrashBetReceipt.__table__,service.CrashPayoutTime.__table__])
 with Session(engine,expire_on_commit=False) as db:yield db
 engine.dispose()
def user(db,uid='viewer',balance=500000):
 u=User(id=uid,public_id='ID'+uid,nickname='Oyuncu '+uid,lidya=balance);db.add(u);db.commit();return u
def round(db,status='open'):
 at=datetime.now(timezone.utc);r=GameRound(id=str(uuid4()),game_type='crash_live',status=status,started_at=at,ends_at=at+timedelta(seconds=60),state_data=json.dumps(dict(crash_at=3.0,flight_seconds=100)))
 db.add(r);db.commit();return r
def req(r,amount=100):return service.CrashBetRequest(amount=amount,round_id=r.id,request_id=uuid4())
@pytest.mark.parametrize('amount',service.STAKES)
def test_five_stakes_one_debit_after_retry(db,amount):
 u=user(db);r=round(db);p=req(r,amount);a=service.place_bet(db,u,p,lambda db:r);db.commit();b=service.place_bet(db,u,p,lambda db:r);db.commit();assert not a['replayed'] and b['replayed'];assert u.lidya==500000-amount;assert db.scalar(select(func.count(GameBet.id)))==1
@pytest.mark.parametrize('amount',[1,25,50,500,100001,-10])
def test_other_stakes_rejected(db,amount):
 u=user(db);r=round(db)
 with pytest.raises(HTTPException) as e:service.place_bet(db,u,req(r,amount),lambda db:r)
 assert e.value.status_code==422 and u.lidya==500000
@pytest.mark.parametrize('amount',[True,'100',100.0])
def test_schema_strict_amount(amount):
 from pydantic import ValidationError
 with pytest.raises(ValidationError):service.CrashBetRequest(amount=amount,round_id='r',request_id=uuid4())
def test_stale_and_closed_never_debit(db):
 u=user(db);r=round(db);p=req(r);p.round_id='old'
 with pytest.raises(HTTPException):service.place_bet(db,u,p,lambda db:r)
 r.status='running'
 with pytest.raises(HTTPException):service.place_bet(db,u,req(r),lambda db:r)
 assert u.lidya==500000
def test_low_balance(db):
 u=user(db,balance=9);r=round(db)
 with pytest.raises(HTTPException):service.place_bet(db,u,req(r,10),lambda db:r)
 assert u.lidya==9
def test_changed_retry(db):
 u=user(db);r=round(db);p=req(r);service.place_bet(db,u,p,lambda db:r);db.commit();p.amount=1000
 with pytest.raises(HTTPException) as e:service.place_bet(db,u,p,lambda db:r)
 assert e.value.status_code==409 and u.lidya==499900
def test_ranking_counts_paid_running_round_top50_and_time(db,monkeypatch):
 at=datetime(2026,10,14,17,30,tzinfo=timezone.utc);bounds=service.period_bounds;monkeypatch.setattr(service,'period_bounds',lambda p:bounds(p,at));viewer=user(db);r=round(db,'running')
 for i in range(60):
  u=user(db,str(i));u.avatar_asset='avatar.png';u.frame_asset='frame.png';b=GameBet(round_id=r.id,user_id=u.id,choice='x2.00',amount=100,payout=(i+1)*100,created_at=at);db.add(b);db.flush();service.record_cashout(db,b,at)
 unpaid=GameBet(round_id=r.id,user_id=viewer.id,choice='cashout',amount=100000,payout=0,created_at=at);db.add(unpaid)
 old=GameBet(round_id=r.id,user_id=viewer.id,choice='x2.00',amount=100,payout=200,created_at=at);db.add(old);db.flush();service.record_cashout(db,old,at.replace(minute=0)-timedelta(seconds=1));db.commit()
 scores=service.leaderboard(db,viewer,'hour');assert len(scores['items'])==50 and scores['items'][0]['winnings']==6000;assert scores['items'][0]['frame_asset']=='frame.png';assert scores['my_winnings']==0;assert service.leaderboard(db,viewer,'day')['my_winnings']==200

def handlers(db,u):
 source=ast.parse((root/'backend/app/platform_routes.py').read_text());factory=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='register_platform_auth');names={'_crash_live_multiplier','_crash_live_now','_get_crash_live_round','crash_live_state','crash_live_bet','crash_live_cashout','crash_live_cashout_all','crash_leaderboard'};functions=[n for n in factory.body if isinstance(n,ast.FunctionDef) and n.name in names];assert len(functions)==8
 router=APIRouter(prefix='/v1');env=dict(router=router,Session=Session,User=User,GameBet=GameBet,GameRound=GameRound,Depends=Depends,Query=Query,HTTPException=HTTPException,get_db=lambda:db,current_user_dependency=lambda:u,crash_final=service,select=select,text=text,func=func,json=json,datetime=datetime,timedelta=timedelta,timezone=timezone,uuid4=uuid4,CRASH_LIVE_STAKES=service.STAKES,CRASH_LIVE_BET_SECONDS=10,CRASH_LIVE_RESULT_SECONDS=5)
 import secrets
 env['secrets']=secrets
 from pydantic import BaseModel
 class CrashCashoutCreate(BaseModel):bet_id:int
 env['CrashCashoutCreate']=CrashCashoutCreate
 exec(compile(ast.Module(body=functions,type_ignores=[]),str(root/'backend/app/platform_routes.py'),'exec'),env)
 app=FastAPI();app.include_router(router);return app,env

def test_real_routes_cashout_ranking_and_no_double_credit(db):
 u=user(db);app,env=handlers(db,u)
 with TestClient(app) as c:
  live=c.get('/v1/games/crash/live');assert live.status_code==200;data=live.json();p={'amount':100000,'round_id':data['round_id'],'request_id':str(uuid4())};bet=c.post('/v1/games/crash/live/bet',json=p);assert bet.status_code==200 and bet.json()['balance']==400000
  assert c.post('/v1/games/crash/live/bet',json=p).json()['replayed']
  state=c.get('/v1/games/crash/live');assert state.json()['my_total_bet']==100000
  r=db.get(GameRound,data['round_id']);at=datetime.now(timezone.utc);r.status='running';r.ends_at=at-timedelta(seconds=20);r.state_data=json.dumps(dict(crash_at=3,flight_seconds=100));db.commit()
  assert c.post('/v1/games/crash/live/cashout-all',json={'round_id':'stale'}).status_code==409
  assert u.lidya==400000
  paid=c.post('/v1/games/crash/live/cashout-all',json={'round_id':r.id});assert paid.status_code==200;assert paid.json()['payout']>100000;balance=u.lidya
  assert db.scalar(select(func.count(service.CrashPayoutTime.bet_id)))==1
  assert c.post('/v1/games/crash/live/cashout-all').status_code==409;assert u.lidya==balance
  rank=c.get('/v1/games/crash/leaderboard?period=hour');assert rank.status_code==200 and rank.json()['items'][0]['winnings']==paid.json()['payout']
  assert c.get('/v1/games/crash/leaderboard?period=bad').status_code==422
  for period in ['hour','day','week','month']:assert c.get('/v1/games/crash/leaderboard?period='+period).status_code==200

def test_individual_cashout_records_time(db):
 u=user(db);r=round(db,'running');r.ends_at=datetime.now(timezone.utc)-timedelta(seconds=10);r.state_data=json.dumps(dict(crash_at=3,flight_seconds=100));b=GameBet(round_id=r.id,user_id=u.id,choice='cashout',amount=100,payout=0);db.add(b);db.commit();app,env=handlers(db,u)
 with TestClient(app) as c:
  response=c.post('/v1/games/crash/live/cashout',json={'bet_id':b.id});assert response.status_code==200;assert db.get(service.CrashPayoutTime,b.id) is not None;before=u.lidya
  assert c.post('/v1/games/crash/live/cashout',json={'bet_id':b.id}).status_code==409;assert u.lidya==before
