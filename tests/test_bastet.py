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
    package=types.ModuleType('bastet_test_app');package.__path__=[];sys.modules['bastet_test_app']=package
    e=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(e);sessions=sessionmaker(bind=e,autoflush=False)
    def get_db():
        with sessions() as s:yield s
    for name,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
        m=types.ModuleType('bastet_test_app.'+name);m.__dict__.update(attrs);sys.modules[m.__name__]=m
    eng=module('bastet_test_app.bastet_engine',ROOT/'backend/app/bastet_engine.py');routes=module('bastet_test_app.bastet_routes',ROOT/'backend/app/bastet_routes.py')
    with sessions() as s:s.add_all([User(id='a',lidya=100000),User(id='b',lidya=5000)]);s.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):
        u=db.get(User,identity['id'])
        if identity.get('stale'):u.lidya=123456789
        return u
    app=FastAPI();app.include_router(routes.register_auth(auth));client=TestClient(app)
    yield client,sessions,routes,eng,identity
    e.dispose()

def post(c,**kw):return c.post('/v1/games/bastet/spin',json={'request_id':str(uuid4()),'stake':20,**kw})


def test_rules_validation(fixture):
 c,_,_,_,_=fixture;r=c.get('/v1/games/bastet/rules').json()
 assert r['buy_spins']==8 and r['max_win']==5000
 assert len(set(map(tuple,r['lines'])))==40
 for kw in [{'stake':True},{'sequence':False},{'stake':0},{'stake':10001},{'action':'bad'},{'sticky':{}},{'payout':9999}]:assert post(c,**kw).status_code==422

def board():return [{'s':i%8} for i in range(20)]
def test_multiplicative_wilds(fixture):
 *_,e,_=fixture;b=board();b[:5]=[{'s':8},{'s':10,'m':2},{'s':10,'m':3},{'s':1},{'s':10,'m':3}]
 _,wins=e.evaluate(b);w=next(w for w in wins if w['line']==1)
 assert w['count']==3 and w['multiplier']==6

def test_sticky_and_stack_award_once(fixture):
 *_,e,_=fixture;b=board()
 for i in [0,5,10,15]:b[i]={'s':8}
 b[1]={'s':10,'m':2}
 a=e.spin(bonus=True,forced_board=b,rng=lambda:.99)
 assert a['extraSpins']==2 and a['respin'] and a['sticky']=={'1':2}
 b=board();b[2]={'s':8}
 x=e.spin(bonus=True,sticky=a['sticky'],locked=a['locked'],respin=True,forced_board=b,rng=lambda:.99)
 assert x['board'][1]=={'s':10,'m':2} and x['extraSpins']==0 and not x['respin']
 assert x['lineWins'] and not x['locked']

@pytest.mark.parametrize('scatters,award',[(3,8),(4,12),(5,16)])
def test_scatter_awards(fixture,scatters,award):
 *_,e,_=fixture;b=board()
 for i in range(scatters):b[i]={'s':11}
 assert e.spin(forced_board=b,rng=lambda:.99)['bonusSpins']==award

def test_buy_idempotency_ownership(fixture):
 c,s,r,e,identity=fixture;req={'request_id':str(uuid4()),'stake':20,'action':'buy'}
 a=c.post('/v1/games/bastet/spin',json=req).json();st=a['state']
 assert a['charge']==2000 and st['remaining']==8
 assert c.get('/v1/games/bastet/active').json()['state']['round_id']==st['round_id']
 assert post(c).status_code==409
 assert post(c,round_id=st['round_id'],sequence=0).status_code==409
 assert post(c,round_id=st['round_id'],sequence=1,stake=40).status_code==409
 identity['id']='b';assert post(c,round_id=st['round_id'],sequence=1).status_code==404;identity['id']='a'
 b=post(c,round_id=st['round_id'],sequence=1).json()
 replay=c.post('/v1/games/bastet/spin',json=req).json()
 assert b['charge']==0 and replay['replayed'] and replay['balance']==b['balance']

def fake(**kw):
 return {'board':board(),'payoutHundredths':0,'lineWins':[],'sticky':{},'newSticky':[],'extraSpins':0,'bonusSpins':0,'respin':False,'respinBonus':kw.get('bonus',False),'locked':{},'capped':False}

def test_respin_no_charge_and_resume(fixture):
 c,s,r,e,_=fixture
 b=board()
 for i in [0,5,10,15]:b[i]={'s':9}
 r.spin=lambda **kw:e.spin(forced_board=b,rng=lambda:.99)
 a=post(c).json();st=a['state'];assert st['respin'] and not st['finished'] and st['remaining']==0
 assert c.get('/v1/games/bastet/active').json()['state']['locked']==st['locked']
 b[1]=b[2]={'s':9}
 r.spin=lambda **kw:e.spin(**kw,forced_board=b,rng=lambda:.99)
 payload={'request_id':str(uuid4()),'stake':20,'round_id':st['round_id'],'sequence':1}
 x=c.post('/v1/games/bastet/spin',json=payload).json()
 assert x['charge']==0 and x['state']['finished'] and x['payout']>0
 again=c.post('/v1/games/bastet/spin',json=payload).json();assert again['balance']==x['balance'] and again['replayed']

def test_buy_finishes_without_unrequested_floor(fixture):
 c,s,r,e,_=fixture;r.spin=fake;a=post(c,action='buy').json();st=a['state']
 for _ in range(8):a=post(c,round_id=st['round_id'],sequence=st['sequence']).json();st=a['state']
 assert st['finished'] and a['balance']==98000 and st['total_payout']==0

def test_cap_and_fraction(fixture):
 c,s,r,e,_=fixture;r.spin=lambda **kw:{**fake(**kw),'payoutHundredths':25}
 a=post(c,stake=1).json();assert a['payout']==.25 and a['balance']==99999.25
 r.spin=lambda **kw:{**fake(**kw),'payoutHundredths':e.CAP,'capped':True,'extraSpins':2}
 a=post(c,action='buy').json();st=a['state'];a=post(c,round_id=st['round_id'],sequence=st['sequence']).json()
 assert a['state']['finished'] and a['state']['remaining']==0 and a['payout']==100000

def test_insufficient_and_rollback(fixture):
 c,s,r,e,identity=fixture;identity['id']='b';assert post(c,stake=100,action='buy').status_code==400
 identity['id']='a';r.spin=lambda **kw:(_ for _ in ()).throw(RuntimeError('rng'))
 with pytest.raises(RuntimeError):post(c)
 with s() as db:assert db.get(User,'a').lidya==100000 and not list(db.scalars(select(GameRound)))
