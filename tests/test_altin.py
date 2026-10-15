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
    package=types.ModuleType('altin_test_app');package.__path__=[];sys.modules['altin_test_app']=package
    e=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(e);sessions=sessionmaker(bind=e,autoflush=False)
    def get_db():
        with sessions() as s:yield s
    for name,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
        m=types.ModuleType('altin_test_app.'+name);m.__dict__.update(attrs);sys.modules[m.__name__]=m
    eng=module('altin_test_app.altin_engine',ROOT/'backend/app/altin_engine.py');routes=module('altin_test_app.altin_routes',ROOT/'backend/app/altin_routes.py')
    with sessions() as s:s.add_all([User(id='a',lidya=100000),User(id='b',lidya=5000)]);s.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):
        u=db.get(User,identity['id'])
        if identity.get('stale'):u.lidya=123456789
        return u
    app=FastAPI();app.include_router(routes.register_auth(auth));client=TestClient(app)
    yield client,sessions,routes,eng,identity
    e.dispose()

def post(c,**kw):return c.post('/v1/games/altin/spin',json={'request_id':str(uuid4()),'stake':20,**kw})


def baseboard():return [{'s':i%6} for i in range(15)]

def test_rules_validation(fixture):
 c,_,_,_,_=fixture;r=c.get('/v1/games/altin/rules').json()
 assert len(set(map(tuple,r['lines'])))==25 and r['max_win']==5163 and r['bonus_cost']==100
 assert r['jackpots']==[20,50,200,5000]
 for kw in [{'stake':True},{'stake':0},{'stake':1000000001},{'sequence':False},{'action':'bad'},{'payout':5},{'bonus':{}}]:assert post(c,**kw).status_code==422

def test_copy_and_payout(fixture):
 *_,e,_=fixture;b=baseboard()
 for i in [0,5,10]:b[i]={'s':10}
 x=e.spin(forced_board=b,forced_copy=[1,2,3,4],rng=lambda:.9)
 assert x['copyColumns']==[1,2,3,4] and all(c['s']==10 for c in x['board'])
 assert x['payoutHundredths']==25*400 and len(x['lineWins'])==25

def test_wild_position(fixture):
 *_,e,_=fixture
 for i in [0,4,5,9]:
  b=baseboard();b[i]={'s':11}
  with pytest.raises(ValueError):e.spin(forced_board=b)
 b=baseboard();b[:5]=[{'s':0},{'s':11},{'s':0},{'s':1},{'s':0}]
 # First fixed line uses middle row.
 b[5:10]=[{'s':0},{'s':11},{'s':0},{'s':1},{'s':0}]
 assert next(w for w in e.spin(forced_board=b)['lineWins'] if w['line']==1)['count']==3

@pytest.mark.parametrize('count',[6,7,8,9,15])
def test_bonus_distribution(fixture,count):
 *_,e,_=fixture;b=e.start_bonus([100]*count,rng=lambda:.5)
 assert len(b['boards'])==4 and all(len(g)==15 for g in b['boards'])
 assert sum(bool(c) for g in b['boards'] for c in g)==count
 assert all(any(c for c in g) for g in b['boards']) and b['remaining']==8
 assert b['previewHundredths']==count*100

def test_six_money_trigger_and_copy_before_count(fixture):
 *_,e,_=fixture;b=baseboard()
 for i in range(6):b[i]={'s':12,'value':100}
 a=e.spin(forced_board=b,rng=lambda:.5);assert a['moneyCount']==6 and a['bonus']['remaining']==8
 b=baseboard()
 for i in [0,5,10]:b[i]={'s':6}
 for i in [1,2,3,4,6,7]:b[i]={'s':12,'value':100}
 a=e.spin(forced_board=b,forced_copy=[1],rng=lambda:.5)
 assert a['moneyCount']==4 and a['bonus'] is None

def seeded(e):return e.start_bonus([100]*6,rng=lambda:.5)
def empty(b,g):return next(i for i,c in enumerate(b['boards'][g]) if c is None)

def test_multiplier_sticky_and_extra(fixture):
 *_,e,_=fixture;b=seeded(e);i=empty(b,0);target=next(i for i,c in enumerate(b['boards'][0]) if c)
 x=e.respin(b,forced_events=[{'grid':0,'index':i,'kind':'multiplier','multiplier':25,'target':target}],rng=lambda:.5)
 assert b['boards'][0][target]['value']==100 and x['bonus']['boards'][0][target]['value']==2500
 assert x['bonus']['boards'][0][i]=={'kind':'multiplier','multiplier':25}
 j=empty(x['bonus'],1);y=e.respin(x['bonus'],forced_events=[{'grid':1,'index':j,'kind':'extra'}])
 assert y['bonus']['remaining']==7 and y['extraSpins']==1
 assert y['bonus']['boards'][0][i]==x['bonus']['boards'][0][i]
 with pytest.raises(ValueError):e.respin(y['bonus'],forced_events=[{'grid':0,'index':i,'kind':'pot','value':100}])

@pytest.mark.parametrize('g,jackpot',[(0,2000),(1,5000),(2,20000),(3,500000)])
def test_jackpot_awarded_once(fixture,g,jackpot):
 *_,e,_=fixture;b=seeded(e)
 b['boards'][g]=[{'kind':'pot','value':100}]*14+[None]
 x=e.respin(b,forced_events=[{'grid':g,'index':14,'kind':'extra'}])
 assert x['newJackpots']==[g] and x['bonus']['jackpots'][g]
 assert x['bonus']['previewHundredths']>=jackpot+1400
 if not x['finished']:
  y=e.respin(x['bonus'],forced_events=[]);assert not y['newJackpots'] and y['bonus']['previewHundredths']==x['bonus']['previewHundredths']

def test_completion_pays_once_and_cap(fixture):
 *_,e,_=fixture;b=seeded(e);b['remaining']=1
 x=e.respin(b,forced_events=[]);assert x['finished'] and x['payoutHundredths']==600
 with pytest.raises(ValueError):e.respin(x['bonus'],forced_events=[])
 b=seeded(e);i=empty(b,0);target=next(i for i,c in enumerate(b['boards'][0]) if c);b['boards'][0][target]['value']=30000
 x=e.respin(b,forced_events=[{'grid':0,'index':i,'kind':'multiplier','multiplier':25,'target':target}],remaining_cap=1000)
 assert x['capped'] and x['finished'] and x['payoutHundredths']==1000 and x['bonus']['remaining']==0

def test_buy_resume_idempotency_and_late_receipt(fixture):
 c,s,r,e,identity=fixture;req={'request_id':str(uuid4()),'stake':20,'action':'buy'}
 a=c.post('/v1/games/altin/spin',json=req).json();st=a['state'];assert a['charge']==2000 and st['remaining']==8 and a['payout']==0
 assert c.get('/v1/games/altin/active').json()['state']['bonus']==st['bonus']
 assert post(c).status_code==409 and post(c,round_id=st['round_id'],sequence=0).status_code==409
 assert post(c,round_id=st['round_id'],sequence=1,stake=40).status_code==409
 identity['id']='b';assert post(c,round_id=st['round_id'],sequence=1).status_code==404;identity['id']='a'
 x=post(c,round_id=st['round_id'],sequence=1).json();assert x['charge']==0
 again=c.post('/v1/games/altin/spin',json=req).json();assert again['replayed'] and again['balance']==x['balance']
 with s() as db:assert len(list(db.scalars(select(GameBet))))==1

def test_final_credit_fraction_and_replay(fixture):
 c,s,r,e,_=fixture
 r.start_bonus=lambda **kw:e.start_bonus([25]*6,rng=lambda:.5)
 r.respin=lambda state,**kw:e.respin(state,forced_events=[],**kw)
 a=post(c,stake=1,action='buy').json();st=a['state']
 for _ in range(8):
  req={'request_id':str(uuid4()),'stake':1,'round_id':st['round_id'],'sequence':st['sequence']};a=c.post('/v1/games/altin/spin',json=req).json();st=a['state']
 assert st['finished'] and a['payout']==1.5 and a['balance']==99901.5
 again=c.post('/v1/games/altin/spin',json=req).json();assert again['balance']==a['balance'] and again['replayed']
 with s() as db:
  assert db.get(User,'a').lidya==99901 and json.loads(db.get(GameRound,r.wallet_id('a')).state_data)['remainder']==50

def test_insufficient_rollback(fixture):
 c,s,r,e,identity=fixture;identity['id']='b';assert post(c,stake=100,action='buy').status_code==400
 identity['id']='a';r.spin=lambda **kw:(_ for _ in ()).throw(RuntimeError('rng'))
 with pytest.raises(RuntimeError):post(c)
 with s() as db:assert db.get(User,'a').lidya==100000 and not list(db.scalars(select(GameRound)))


def test_api_routers_precede_static_mount():
 source=(ROOT/'backend/app/main.py').read_text()
 for name in ['altin','bastet']:
  registration='app.include_router('+name+'_routes.register_auth(current_user))'
  assert source.count(registration)==1
  assert source.index(registration)<source.index('app.mount("/", StaticFiles')
