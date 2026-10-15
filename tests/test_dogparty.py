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
    package=types.ModuleType('dogparty_test_app');package.__path__=[];sys.modules['dogparty_test_app']=package
    e=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(e);sessions=sessionmaker(bind=e,autoflush=False)
    def get_db():
        with sessions() as s:yield s
    for name,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
        m=types.ModuleType('dogparty_test_app.'+name);m.__dict__.update(attrs);sys.modules[m.__name__]=m
    module('dogparty_test_app.slot_bonus_buy',ROOT/'backend/app/slot_bonus_buy.py')
    eng=module('dogparty_test_app.dogparty_engine',ROOT/'backend/app/dogparty_engine.py');routes=module('dogparty_test_app.dogparty_routes',ROOT/'backend/app/dogparty_routes.py')
    with sessions() as s:s.add_all([User(id='a',lidya=100000),User(id='b',lidya=5000)]);s.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):
        u=db.get(User,identity['id'])
        if identity.get('stale'):u.lidya=123456789
        return u
    app=FastAPI();app.include_router(routes.register_auth(auth));client=TestClient(app)
    yield client,sessions,routes,eng,identity
    e.dispose()

def post(c,**kw):return c.post('/v1/games/dogparty/spin',json={'request_id':str(uuid4()),'stake':20,**kw})

def trigger(r,e):
 native=e.spin
 def fake(**kw):
  if kw.get('bonus'):return native(**kw)
  b=[{'s':i%11} for i in range(15)]
  for i in [0,2,4]:b[i]={'s':11}
  return native(forced_board=b,rng=__import__('random').Random(3).random)
 r.spin=fake

def test_rules_and_validation(fixture):
 c,*_=fixture;rules=c.get('/v1/games/dogparty/rules').json();assert len(rules['lines'])==20 and len({tuple(x) for x in rules['lines']})==20
 for kw in [{'stake':0},{'stake':True},{'stake':20.0},{'stake':-1},{'action':'invalid'},{'ante':True},{'payout':999},{'sequence':False},{'request_id':'invalid'}]:assert post(c,**kw).status_code==422

def test_additive_wilds_not_product(fixture):
 e=fixture[3];b=[{'s':i%11} for i in range(15)];b[5:10]=[{'s':0},{'s':12,'m':2},{'s':12,'m':3},{'s':0},{'s':1}]
 pay,wins=e.evaluate(b);w=next(w for w in wins if w['line']==1)
 assert w['count']==4 and w['multiplier']==5 and w['payHundredths']==e.PAY[0][1]*5
 b[7]={'s':2};b[8]={'s':12,'m':3};assert not any(w['line']==1 for w in e.evaluate(b)[1])
 b[7]={'s':0};b[8]={'s':1};b[9]={'s':12,'m':3}
 w=next(w for w in e.evaluate(b)[1] if w['line']==1);assert w['count']==3 and w['multiplier']==2

def test_symbols_confined_to_reels(fixture):
 import random
 e=fixture[3]
 for seed in range(300):
  r=e.spin(rng=random.Random(seed).random)
  assert all(i%5 in (0,2,4) for i,c in enumerate(r['board']) if c['s']==11)
  assert all(i%5 in (1,2,3) and c['m'] in (2,3) for i,c in enumerate(r['board']) if c['s']==12)
  assert r['sticky']=={}
  for col in range(5):assert r['reelWindows'][col][-3:]==r['board'][col::5]

def test_sticky_preserves_value_and_position(fixture):
 import random
 e=fixture[3];sticky={'1':2,'7':3,'13':2}
 for seed in range(50):
  r=e.spin(bonus=True,sticky=sticky,rng=random.Random(seed).random)
  for i,v in sticky.items():assert r['board'][int(i)]=={'s':12,'m':v} and r['sticky'][i]==v
  assert not set(map(int,sticky))&set(r['newSticky'])
  sticky=r['sticky'];assert not r['wheel'] and not r['bonusSpins']

def test_wheel_scatter_and_bonus_boundary(fixture):
 import random
 e=fixture[3];b=[{'s':i%11} for i in range(15)]
 for i in [0,2,4]:b[i]={'s':11}
 for seed in range(20):
  r=e.spin(forced_board=b,rng=random.Random(seed).random)
  assert r['scatterHundredths']==500 and len(r['wheel'])==9 and all(1<=v<=3 for v in r['wheel'])
  assert r['bonusSpins']==sum(r['wheel']) and 9<=r['bonusSpins']<=27
 assert e.spin(forced_board=b,rng=lambda:0)['bonusSpins']==9
 assert e.spin(forced_board=b,rng=lambda:.999999)['bonusSpins']==27
 with pytest.raises(ValueError):e.spin(bonus=True,sticky={'0':2})
 with pytest.raises(ValueError):e.spin(bonus=True,sticky={'1':4})
 with pytest.raises(ValueError):e.spin(model_version='unknown')

def test_cap_exact(fixture):
 e=fixture[3];b=[{'s':10} if i%5 in (0,4) else {'s':12,'m':3} for i in range(15)]
 r=e.spin(bonus=True,forced_board=b,remaining_cap=123,rng=lambda:.5)
 assert r['payoutHundredths']==123 and r['capped'] and len(r['sticky'])==9
 assert sum(w['payHundredths'] for w in r['lineWins'])==675000

def test_charge_replay_and_late_replay(fixture):
 c,s,r,e,_=fixture;trigger(r,e);payload={'request_id':str(uuid4()),'stake':20}
 a=c.post('/v1/games/dogparty/spin',json=payload).json();again=c.post('/v1/games/dogparty/spin',json=payload).json();assert again['replayed'] and again['balance']==a['balance']
 state=a['state'];next=post(c,round_id=state['round_id'],sequence=state['sequence']).json()
 replay=c.post('/v1/games/dogparty/spin',json=payload).json();assert replay['replayed'] and replay['balance']==next['balance']
 with s() as db:assert len(list(db.scalars(select(GameBet))))==1 and len(list(db.scalars(select(GamePlay))))==2

def test_bonus_resume_owner_sequence_and_stake(fixture):
 c,s,r,e,identity=fixture;trigger(r,e);a=post(c).json();state=a['state'];assert 9<=state['remaining']<=27
 assert c.get('/v1/games/dogparty/active').json()['state']['wheel']==a['result']['wheel']
 assert post(c).status_code==409
 assert post(c,round_id=state['round_id'],sequence=0).status_code==409
 assert post(c,round_id=state['round_id'],sequence=state['sequence'],stake=50).status_code==409
 identity['id']='b';assert post(c,round_id=state['round_id'],sequence=state['sequence']).status_code==404;identity['id']='a'
 a=post(c,round_id=state['round_id'],sequence=state['sequence']).json();assert a['charge']==0 and a['state']['remaining']==state['remaining']-1

def test_insufficient_and_rng_rollback(fixture):
 c,s,r,e,_=fixture
 with s() as db:u=db.get(User,'a');u.lidya=0;db.commit()
 assert post(c).status_code==400
 with s() as db:u=db.get(User,'a');u.lidya=1000;db.commit()
 r.spin=lambda **kw:(_ for _ in ()).throw(RuntimeError('test RNG'))
 with pytest.raises(RuntimeError):post(c)
 with s() as db:assert db.get(User,'a').lidya==1000 and not list(db.scalars(select(GameBet)))

def test_fraction_and_shared_wallet(fixture):
 c,s,r,e,_=fixture;native=e.spin
 def fixed(**kw):
  x=native(**kw);x.update(payoutHundredths=25,bonusSpins=0,wheel=[]);return x
 r.spin=fixed
 a=post(c,stake=50).json();b=post(c,stake=50).json();assert a['payout']==12.5 and b['balance']==99925
 assert r.wallet_id('a')==str(__import__('uuid').uuid5(__import__('uuid').NAMESPACE_URL,'eris:dede:fraction:a'))
 with s() as db:assert db.get(User,'a').lidya==99925 and r.fraction(db,'a')==0

def test_locked_wallet_and_game_isolation(fixture):
 c,s,r,e,identity=fixture;identity['stale']=True;a=post(c).json();assert a['balance']==100000-20+a['payout']
 with s() as db:
  from datetime import datetime
  db.add(GameRound(id='hasan-round',user_id='a',game_type='balikci',status='open',started_at=datetime.now(),ends_at=datetime.now(),state_data='{}'));db.commit()
 assert post(c,round_id='hasan-round',sequence=1).status_code==404

def test_total_cap_ends_remaining_bonus(fixture):
 c,s,r,e,_=fixture;trigger(r,e);a=post(c).json();state=a['state'];native=e.spin
 def cap(**kw):
  x=native(**kw);x.update(payoutHundredths=kw['remaining_cap'],capped=True);return x
 r.spin=cap
 a=post(c,round_id=state['round_id'],sequence=state['sequence']).json();assert a['state']['finished'] and a['state']['remaining']==0 and a['state']['total_payout']==20*6750
 assert c.get('/v1/games/dogparty/active').json()['state'] is None

def test_evaluator_matches_independent_reference(fixture):
 import random
 e=fixture[3];rng=random.Random(7143)
 for _ in range(500):
  board=[{'s':rng.randrange(11)} for _ in range(15)]
  for i in range(15):
   if i%5 in (1,2,3) and rng.random()<.4:board[i]={'s':12,'m':rng.choice([2,3])}
   elif i%5 in (0,2,4) and rng.random()<.08:board[i]={'s':11}
  total=0
  for line in e.LINES:
   cells=[board[row*5+col] for col,row in enumerate(line)];s=cells[0]['s']
   if s>=11:continue
   prefix=[]
   for cell in cells:
    if cell['s']!=s and cell['s']!=12:break
    prefix.append(cell)
   if len(prefix)>=3:total+=e.PAY[s][len(prefix)-3]*max(1,sum(c['m'] for c in prefix if c['s']==12))
  assert e.evaluate(board)[0]==total


def test_bonus_buy_exact_charge_and_resume(fixture):
 c,s,r,e,identity=fixture
 path='/v1/games/dogparty/spin';payload={'request_id':str(uuid4()),'stake':50,'action':'buy'}
 first=c.post(path,json=payload);assert first.status_code==200,first.text
 a=first.json();assert a['charge']==5000 and a['payout']==0 and a['balance']==95000 and not a['state']['finished']
 assert c.post(path,json=payload).json()['replayed']
 with s() as db:assert db.get(User,'a').lidya==95000 and db.scalar(select(GameBet)).choice=='buy'
 assert post(c,action='buy').status_code==409
 assert post(c,action='buy',round_id=a['state']['round_id'],sequence=a['state']['sequence'],stake=50).status_code==409
 resumed=post(c,round_id=a['state']['round_id'],sequence=a['state']['sequence'],stake=50).json();assert resumed['charge']==0
 replay=c.post(path,json=payload).json();assert replay['replayed'] and replay['balance']==resumed['balance']
 if 'collected' in a['state']:assert a['state']['remaining']==10 and a['state']['collected']==0 and a['state']['multiplier']==1
 else:
  assert len(a['result']['wheel'])==9 and a['state']['remaining']==sum(a['result']['wheel']) and a['state']['sticky']=={}
  assert r.purchase('dogparty',rng=lambda:0)[0]==9 and r.purchase('dogparty',rng=lambda:.999999)[0]==27

def test_buy_insufficient_balance_and_payload_injection(fixture):
 c,s,r,e,_=fixture
 with s() as db:u=db.get(User,'a');u.lidya=200;db.commit()
 assert post(c,action='buy').status_code==400
 with s() as db:assert db.get(User,'a').lidya==200 and not list(db.scalars(select(GameBet)))
 for override in [{'price':1},{'free_spins':27},{'buy_profile':'hack'}]:assert post(c,action='buy',**override).status_code==422

def test_buy_rng_failure_rollback(fixture):
 c,s,r,e,_=fixture;r.purchase=lambda *_:(_ for _ in ()).throw(RuntimeError('purchase test'))
 with pytest.raises(RuntimeError):post(c,action='buy')
 with s() as db:assert db.get(User,'a').lidya==100000 and not list(db.scalars(select(GameBet)))
