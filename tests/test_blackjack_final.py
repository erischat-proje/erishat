"""Real SQLAlchemy rankings plus production blackjack engine and route handlers."""
import ast,importlib,json,sys,types
from datetime import datetime,timedelta,timezone
from pathlib import Path
from uuid import uuid4
import pytest
from fastapi import HTTPException
from sqlalchemy import Column,String,Table,create_engine,func,select
from sqlalchemy.orm import DeclarativeBase,Session
root=Path(__file__).resolve().parents[1]
pkg=types.ModuleType('_bj_test_app');pkg.__path__=[str(root/'backend/app')];sys.modules[pkg.__name__]=pkg
class Base(DeclarativeBase):pass
stub=types.ModuleType('_bj_test_app.db');stub.Base=Base;sys.modules[stub.__name__]=stub
models=importlib.import_module('_bj_test_app.models');platform=importlib.import_module('_bj_test_app.platform_models');service=importlib.import_module('_bj_test_app.blackjack_final')
engine=importlib.import_module('_bj_test_app.oyunlar.blackjack')
User,GameBet,GameRound=models.User,platform.GameBet,platform.GameRound
rooms=Table('rooms',Base.metadata,Column('id',String(64),primary_key=True))
@pytest.fixture
def db():
 e=create_engine('sqlite:///:memory:');Base.metadata.create_all(e,tables=[User.__table__,rooms,GameRound.__table__,GameBet.__table__])
 with Session(e,expire_on_commit=False) as s:yield s
 e.dispose()
def user(db,uid='viewer',balance=500000):
 u=User(id=uid,public_id=uid,nickname=uid,lidya=balance);db.add(u);db.commit();return u
@pytest.mark.parametrize('stake',service.STAKES+(200000,300000,858993460,2000000000,1000000000000))
def test_five_stakes(stake):assert service.validate_stake(stake)==stake
@pytest.mark.parametrize('stake',[0,-1,25,99999,100001,True,100.0,'100'])
def test_invalid_stakes(stake):
 with pytest.raises(HTTPException):service.validate_stake(stake)
def test_paid_rankings_top50_exclude_refunds_open_and_old(db,monkeypatch):
 now=datetime(2026,10,14,17,30,tzinfo=timezone.utc);bounds=service.period_bounds;monkeypatch.setattr(service,'period_bounds',lambda p:bounds(p,now));u=user(db)
 for i in range(55):
  x=user(db,'u'+str(i));r=GameRound(id=str(uuid4()),user_id=x.id,game_type='blackjack',status='finished',result_key='win',started_at=now-timedelta(days=2),ends_at=now);db.add(r);db.flush();db.add(GameBet(round_id=r.id,user_id=x.id,choice="auto",amount=100000,payout=200000+i))
 for result,status,at in [('push','finished',now),('win','open',now),('win','finished',now-timedelta(days=40))]:
  r=GameRound(id=str(uuid4()),user_id=u.id,game_type='blackjack',status=status,result_key=result,started_at=at,ends_at=at);db.add(r);db.flush();db.add(GameBet(round_id=r.id,user_id=u.id,choice="auto",amount=100000,payout=999999))
 db.commit()
 for period in ['hour','day','week','month']:
  data=service.leaderboard(db,u,period);assert len(data['items'])==50;assert data['items'][0]['winnings']==200054;assert data['my_winnings']==0

def production_action(db):
 tree=ast.parse((root/'backend/app/platform_routes.py').read_text());nodes={n.name:n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef)}
 n=nodes['blackjack_action'];n.decorator_list=[]
 # Remove only dependency annotations/defaults, retaining actual production handler logic.
 n.returns=None
 for a in n.args.args:a.annotation=None
 n.args.defaults=[]
 ns=dict(select=select,User=User,GameRound=GameRound,GameBet=GameBet,HTTPException=HTTPException,json=json,GAME_ENGINES={'blackjack':engine},datetime=datetime,timezone=timezone,display_state=engine.display_state,available_actions=engine.available_actions)
 pay=nodes['game_payout'];pay.decorator_list=[]
 exec(compile(ast.fix_missing_locations(ast.Module(body=[pay,n],type_ignores=[])),'production','exec'),ns)
 return ns['blackjack_action']
@pytest.mark.parametrize('action,cards,expected,payout',[('stand',['10H','9S'],'win',200000),('hit',['10H','9S'],'loss',0)])
def test_real_action_cashout_once_and_hidden_dealer(db,action,cards,expected,payout):
 u=user(db,balance=400000)
 state={'phase':'player','player_hand':cards,'dealer_hand':['10C','7D'],'deck':['5S'],'result':'pending'}
 # Use actual engine state structure from start, then force deterministic cards/deck.
 _,data=engine.start({'round_id':'r'});state=data['state'];state['dealer_hand']=['10C','7D'];state['player_hand']=cards;state['player_total']=19;state['deck']=['5S'];state['phase']='player';state['result']='pending'
 r=GameRound(id='r',user_id=u.id,game_type='blackjack',status='open',state_data=json.dumps(state),started_at=datetime.now(timezone.utc),ends_at=datetime.now(timezone.utc));db.add(r);db.flush();db.add(GameBet(round_id='r',user_id=u.id,choice="auto",amount=100000,payout=0));db.commit()
 public=engine.display_state(state);assert 'deck' not in public
 f=production_action(db);out=f('r',types.SimpleNamespace(action=action),db,u);assert out['result']==expected;assert out['payout']==payout;assert out['balance']==400000+payout
 with pytest.raises(HTTPException):f('r',types.SimpleNamespace(action=action),db,u)
 assert u.lidya==400000+payout

def production_play():
 tree=ast.parse((root/'backend/app/platform_routes.py').read_text());nodes={n.name:n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef)}
 n=nodes['play_game'];n.decorator_list=[];n.returns=None;n.args.defaults=[]
 for a in n.args.args:a.annotation=None
 def save(db,u,game,choice,result,data):
  db.commit();return dict(result=result,data=data)
 ns=dict(select=select,User=User,GameRound=GameRound,GameBet=GameBet,HTTPException=HTTPException,json=json,GAME_ENGINES={'blackjack':engine},datetime=datetime,timezone=timezone,display_state=engine.display_state,uuid4=uuid4,GAME_TYPES={'blackjack'},blackjack_final=service,_save_game_play=save)
 exec(compile(ast.fix_missing_locations(ast.Module(body=[nodes['game_payout'],n],type_ignores=[])),'production','exec'),ns)
 return ns['play_game']

@pytest.mark.parametrize('stake',service.STAKES+(200000,300000,858993460,2000000000,1000000000000))
def test_actual_start_debits_stake_and_pays_natural(db,monkeypatch,stake):
 u=user(db,balance=max(500000,stake*2));before=u.lidya;monkeypatch.setattr(engine.random,'shuffle',lambda deck:None)
 out=production_play()('blackjack',{'stake':stake},db,u)
 assert out['result']=='blackjack' and out['payout']==stake*5//2
 assert u.lidya==before-stake+stake*5//2
 assert db.scalar(select(GameBet.amount))==stake
 assert 'deck' not in out['data']['state']

def test_actual_start_rejects_low_balance_and_open_hand(db):
 u=user(db,balance=9);f=production_play()
 with pytest.raises(HTTPException) as e:f('blackjack',{'stake':10},db,u)
 assert e.value.status_code==400 and u.lidya==9
 u.lidya=500000;db.add(GameRound(id='old',user_id=u.id,game_type='blackjack',status='open',started_at=datetime.now(timezone.utc),ends_at=datetime.now(timezone.utc)));db.commit()
 with pytest.raises(HTTPException) as e:f('blackjack',{'stake':100000},db,u)
 assert e.value.status_code==409 and u.lidya==500000
