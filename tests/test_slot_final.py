import importlib,json,sys,types
from datetime import datetime,timedelta,timezone
from pathlib import Path
from uuid import uuid4
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import Column,String,Table,create_engine,select,func
from sqlalchemy.orm import DeclarativeBase,Session
root=Path(__file__).resolve().parents[1]
pkg=types.ModuleType('_slot_test_app');pkg.__path__=[str(root/'backend/app')];sys.modules[pkg.__name__]=pkg
class Base(DeclarativeBase):pass
stub=types.ModuleType('_slot_test_app.db');stub.Base=Base;sys.modules[stub.__name__]=stub
models=importlib.import_module('_slot_test_app.models');platform=importlib.import_module('_slot_test_app.platform_models');service=importlib.import_module('_slot_test_app.slot_final')
User,GameRound,GameBet=models.User,platform.GameRound,platform.GameBet
rooms=Table('rooms',Base.metadata,Column('id',String(64),primary_key=True))
@pytest.fixture
def db():
 e=create_engine('sqlite:///:memory:');Base.metadata.create_all(e,tables=[User.__table__,rooms,GameRound.__table__,GameBet.__table__,service.SlotAccount.__table__,service.SlotReceipt.__table__])
 with Session(e,expire_on_commit=False) as s:yield s
 e.dispose()
def user(db,uid='viewer',balance=5000000):
 u=User(id=uid,public_id=uid,nickname=uid,lidya=balance);db.add(u);db.commit();return u
def req(n):return service.SlotRequest(amount=n,request_id=uuid4())
def win(monkeypatch):monkeypatch.setattr(service.engine,'play',lambda c,p,d:('cherry',{**d,'reels':['cherry']*3}))
@pytest.mark.parametrize('n',service.STAKES)
def test_real_wallet_and_retry_one_debit_one_payout(db,monkeypatch,n):
 win(monkeypatch);u=user(db);p=req(n);a=service.transact(db,u,p);db.commit();b=service.transact(db,u,p);db.commit()
 assert u.lidya==5000000+n*4 and a['payout']==n*5 and b['replayed'];assert db.scalar(select(func.count(GameBet.id)))==1
@pytest.mark.parametrize('n',[0,25,500,100001,-1])
def test_invalid_never_debits(db,n):
 u=user(db)
 with pytest.raises(HTTPException):service.transact(db,u,req(n))
 assert u.lidya==5000000
@pytest.mark.parametrize('n',[True,100.0,'100'])
def test_strict_schema(n):
 with pytest.raises(ValidationError):req(n)
def test_purchase_restore_locked_bonus_and_free_spins_exactly_once(db,monkeypatch):
 win(monkeypatch);u=user(db);p=req(100000);buy=service.transact(db,u,p,'bonus');db.commit();again=service.transact(db,u,p,'bonus');assert again['replayed'];assert u.lidya==4000000 and buy['remaining']==10
 assert service.state(db,u)['locked_stake']==100000
 with pytest.raises(HTTPException):service.transact(db,u,req(100),'bonus')
 with pytest.raises(HTTPException):service.transact(db,u,req(100))
 for i in range(10):
  p=req(100000);out=service.transact(db,u,p);db.commit();retry=service.transact(db,u,p);assert retry['remaining']==9-i and out['cost']==0
 assert u.lidya==9000000 and service.state(db,u)['remaining']==0
 assert db.scalar(select(func.count(GameBet.id)))==10

def test_low_balance_and_mismatched_retry(db,monkeypatch):
 win(monkeypatch);u=user(db,balance=9)
 with pytest.raises(HTTPException):service.transact(db,u,req(10))
 with pytest.raises(HTTPException):service.transact(db,u,req(10),'bonus')
 assert u.lidya==9;u.lidya=5000000;p=req(100);service.transact(db,u,p);db.commit();p.amount=1000
 with pytest.raises(HTTPException):service.transact(db,u,p)

def test_top50_only_paid_settled_current_period(db,monkeypatch):
 at=datetime(2026,10,14,17,30,tzinfo=timezone.utc);bounds=service.period_bounds;monkeypatch.setattr(service,'period_bounds',lambda p:bounds(p,at));viewer=user(db)
 for i in range(55):
  u=user(db,'u'+str(i));r=GameRound(id=str(uuid4()),user_id=u.id,game_type='slot',status='finished',result_key='cherry',started_at=at,ends_at=at);db.add(r);db.flush();db.add(GameBet(round_id=r.id,user_id=u.id,choice='auto',amount=100000,payout=500000+i))
 for status,end in [('open',at),('finished',at-timedelta(days=40))]:
  r=GameRound(id=str(uuid4()),user_id=viewer.id,game_type='slot',status=status,started_at=end,ends_at=end);db.add(r);db.flush();db.add(GameBet(round_id=r.id,user_id=viewer.id,choice='auto',amount=100,payout=9999999))
 db.commit()
 for p in ['hour','day','week','month']:
  out=service.leaderboard(db,viewer,p);assert len(out['items'])==50;assert out['items'][0]['winnings']==500054 and out['my_winnings']==0
