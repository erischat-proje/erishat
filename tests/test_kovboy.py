"""Isolated engine and transactional API tests; never touch a live wallet."""
import importlib.util,json,sys,types
from pathlib import Path
from uuid import uuid4
import pytest
from sqlalchemy import create_engine,select,Integer,String,Text,DateTime
from sqlalchemy.orm import DeclarativeBase,Mapped,mapped_column,sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI,HTTPException,Depends
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,file);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m
class Base(DeclarativeBase):pass
class User(Base):
    __tablename__='users'
    id:Mapped[str]=mapped_column(String,primary_key=True)
    lidya:Mapped[int]=mapped_column(Integer)
class GameRound(Base):
    __tablename__='game_rounds'
    id:Mapped[str]=mapped_column(String,primary_key=True)
    user_id:Mapped[str]=mapped_column(String)
    game_type:Mapped[str]=mapped_column(String)
    status:Mapped[str]=mapped_column(String)
    started_at:Mapped[object]=mapped_column(DateTime)
    ends_at:Mapped[object]=mapped_column(DateTime)
    result_key:Mapped[str|None]=mapped_column(String,nullable=True)
    state_data:Mapped[str]=mapped_column(Text)
class GameBet(Base):
    __tablename__='game_bets'
    id:Mapped[int]=mapped_column(Integer,primary_key=True)
    round_id:Mapped[str]=mapped_column(String)
    user_id:Mapped[str]=mapped_column(String)
    choice:Mapped[str]=mapped_column(String)
    amount:Mapped[int]=mapped_column(Integer)
    payout:Mapped[int]=mapped_column(Integer)
class GamePlay(Base):
    __tablename__='game_plays'
    id:Mapped[int]=mapped_column(Integer,primary_key=True)
    user_id:Mapped[str]=mapped_column(String)
    game_type:Mapped[str]=mapped_column(String)
    choice:Mapped[str]=mapped_column(String)
    result_key:Mapped[str]=mapped_column(String)
    result_data:Mapped[str]=mapped_column(Text)

@pytest.fixture
def fixture():
    package=types.ModuleType('kovboy_test_app');package.__path__=[];sys.modules['kovboy_test_app']=package
    e=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(e);sessions=sessionmaker(bind=e,autoflush=False)
    def get_db():
        with sessions() as s:yield s
    for name,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
        m=types.ModuleType('kovboy_test_app.'+name);m.__dict__.update(attrs);sys.modules[m.__name__]=m
    eng=module('kovboy_test_app.kovboy_engine',ROOT/'backend/app/kovboy_engine.py');routes=module('kovboy_test_app.kovboy_routes',ROOT/'backend/app/kovboy_routes.py')
    with sessions() as s:s.add_all([User(id='a',lidya=100000),User(id='b',lidya=5000)]);s.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):
        u=db.get(User,identity['id'])
        if identity.get('stale'):u.lidya=123456789
        return u
    app=FastAPI();app.include_router(routes.register_auth(auth));client=TestClient(app)
    yield client,sessions,routes,eng,identity
    e.dispose()

def post(c,**kw):return c.post('/v1/games/kovboy/spin',json={'request_id':str(uuid4()),'stake':20,**kw})


def test_rules_and_validation(fixture):
 c,s,r,e,_=fixture;rules=c.get('/v1/games/kovboy/rules').json()
 assert rules['bonus_floor']==10 and rules['buy_spins']==8 and rules['max_win']==10000
 assert len(rules['lines'])==40 and len(set(tuple(line) for line in rules['lines']))==40
 for kw in [{'stake':0},{'stake':True},{'stake':1000000001},{'stake':20.0},{'sequence':False},{'action':'bad'},{'ante':True},{'sticky':{'1':5}},{'payout':99999},{'request_id':'invalid'}]:assert post(c,**kw).status_code==422

def test_sticky_and_overlay_dont_replace_wild(fixture):
 *_,eng,_=fixture
 board=[{'s':i%10} for i in range(20)];board[1]={'s':10,'m':5}
 result=eng.spin(bonus=True,forced_board=board,forced_overlays=[1,2,3,4,5],rng=lambda:.99)
 assert result['sticky']=={'1':5} and result['newSticky']==[1] and result['extraSpins']==20
 assert result['board'][1]=={'s':10,'m':5} and len(result['board'])==20
 later=eng.spin(bonus=True,sticky=result['sticky'],forced_board=[{'s':i%10} for i in range(20)],forced_overlays=[1,9],rng=lambda:.99)
 assert later['board'][1]=={'s':10,'m':5} and not later['newSticky'] and later['extraSpins']==4
 base=eng.spin(sticky={'1':5},forced_board=[{'s':i%10} for i in range(20)],rng=lambda:.99)
 assert not base['sticky'] and base['board'][1]['s']==1

@pytest.mark.parametrize('count,extra',[(0,0),(1,0),(2,4),(3,8),(4,12),(5,20)])
def test_overlay_awards(fixture,count,extra):
 *_,eng,_=fixture
 assert eng.spin(bonus=True,forced_board=[{'s':i%10} for i in range(20)],forced_overlays=list(range(count)),rng=lambda:.99)['extraSpins']==extra

def test_wild_sum_only_matching_prefix(fixture):
 *_,eng,_=fixture
 board=[{'s':i%10} for i in range(20)];board[:5]=[{'s':0},{'s':10,'m':3},{'s':10,'m':5},{'s':1},{'s':0}]
 _,wins=eng.evaluate(board);line=next(w for w in wins if w['line']==1)
 assert line['count']==3 and line['multiplier']==8 and line['payHundredths']==160
 board[:5]=[{'s':0},{'s':0},{'s':0},{'s':1},{'s':0}];board[3]={'s':10,'m':5};board[4]={'s':1}
 _,wins=eng.evaluate(board);line=next(w for w in wins if w['line']==1)
 assert line['count']==4 and line['multiplier']==5 and line['payHundredths']==500
 # Wild after an earlier mismatch contributes no multiplier.
 board[:5]=[{'s':0},{'s':0},{'s':0},{'s':1},{'s':0}];board[8]={'s':10,'m':5}
 _,wins=eng.evaluate(board);line=next(w for w in wins if w['line']==1)
 assert line['count']==3 and line['multiplier']==1

def test_forbidden_positions(fixture):
 *_,eng,_=fixture
 for index,cell in [(0,{'s':10,'m':2}),(4,{'s':10,'m':3}),(1,{'s':11}),(1,{'s':10,'m':4})]:
  board=[{'s':i%10} for i in range(20)];board[index]=cell
  with pytest.raises(ValueError):eng.spin(forced_board=board)
 with pytest.raises(ValueError):eng.spin(bonus=True,sticky={'0':2})

def test_buy_charge_resume_late_replay(fixture):
 c,s,r,e,identity=fixture
 payload={'request_id':str(uuid4()),'stake':20,'action':'buy'}
 a=c.post('/v1/games/kovboy/spin',json=payload).json();state=a['state'];rid=state['round_id']
 assert a['charge']==2000 and a['payout']==0 and state['remaining']==8 and state['sticky']=={}
 assert c.get('/v1/games/kovboy/active').json()['state']['round_id']==rid
 assert post(c).status_code==409 and post(c,round_id=rid,sequence=0).status_code==409
 assert post(c,round_id=rid,sequence=1,stake=40).status_code==409
 identity['id']='b';assert post(c,round_id=rid,sequence=1).status_code==404;identity['id']='a'
 b=post(c,round_id=rid,sequence=1).json();replay=c.post('/v1/games/kovboy/spin',json=payload).json()
 assert b['charge']==0 and replay['replayed'] and replay['balance']==b['balance']
 with s() as db:assert len(list(db.scalars(select(GameBet))))==1

def fake_result(**kw):
 return {'board':[{'s':i%10} for i in range(20)],'payoutHundredths':0,'lineWins':[],'sticky':{},'newSticky':[],'overlays':[],'extraSpins':0,'scatters':0,'bonusSpins':0,'capped':False,'guaranteeHundredths':0,'reelWindows':[]}

def test_bonus_floor_once_and_excludes_trigger_win(fixture):
 c,s,r,e,_=fixture;counter=0
 def controlled(**kw):
  nonlocal counter
  result=fake_result()
  if not kw.get('bonus'):result.update(payoutHundredths=500,bonusSpins=8)
  else:
   counter+=1;result['payoutHundredths']=250 if counter==1 else 0
  return result
 r.spin=controlled
 result=post(c).json();state=result['state'];assert result['payout']==100
 for _ in range(8):
  payload={'request_id':str(uuid4()),'stake':20,'round_id':state['round_id'],'sequence':state['sequence']};result=c.post('/v1/games/kovboy/spin',json=payload).json();state=result['state']
 assert state['finished'] and state['bonus_payout']==200 and state['total_payout']==300
 assert result['result']['guaranteeHundredths']==750 and result['payout']==150
 replay=c.post('/v1/games/kovboy/spin',json=payload).json();assert replay['replayed'] and replay['balance']==result['balance']
 with s() as db:assert db.get(User,'a').lidya==100280 and db.scalar(select(GameBet)).payout==300

def test_buy_floor_and_retrigger(fixture):
 c,s,r,e,_=fixture;r.spin=fake_result
 result=post(c,action='buy').json();state=result['state']
 for _ in range(8):result=post(c,round_id=state['round_id'],sequence=state['sequence']).json();state=result['state']
 assert result['payout']==200 and state['finished'] and state['total_payout']==200 and result['balance']==98200
 result=post(c,action='buy').json();state=result['state']
 r.spin=lambda **kw:{**fake_result(),'extraSpins':20,'overlays':[0,1,2,3,4]}
 result=post(c,round_id=state['round_id'],sequence=1).json()
 assert result['state']['remaining']==27 and result['state']['awarded']==28

def test_cap_stops_all_and_no_extra_floor(fixture):
 c,s,r,e,_=fixture;a=post(c,action='buy').json();state=a['state']
 r.spin=lambda **kw:{**fake_result(),'payoutHundredths':1000000,'capped':True,'extraSpins':20}
 b=post(c,round_id=state['round_id'],sequence=1).json()
 assert b['state']['finished'] and b['state']['remaining']==0 and b['payout']==200000 and b['result']['guaranteeHundredths']==0

def test_rng_failure_and_insufficient(fixture):
 c,s,r,e,identity=fixture
 r.spin=lambda **kw:(_ for _ in ()).throw(RuntimeError('rng'))
 with pytest.raises(RuntimeError):post(c)
 with s() as db:assert db.get(User,'a').lidya==100000 and not list(db.scalars(select(GameRound)))
 identity['id']='b';assert post(c,stake=100,action='buy').status_code==400

def test_fractional_wallet_shared(fixture):
 c,s,r,e,_=fixture
 from datetime import datetime
 with s() as db:
  db.add(GameRound(id=r.wallet_id('a'),user_id='a',game_type='dede_wallet',status='ledger',started_at=datetime.now(),ends_at=datetime.now(),result_key='fraction',state_data='{"remainder":75}'));db.commit()
 r.spin=lambda **kw:{**fake_result(),'payoutHundredths':25}
 a=post(c,stake=1).json();assert a['payout']==.25 and a['balance']==100000 and a['charge']==1
