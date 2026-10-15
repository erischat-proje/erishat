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
    package=types.ModuleType('kure_test_app');package.__path__=[];sys.modules['kure_test_app']=package
    e=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(e);sessions=sessionmaker(bind=e,autoflush=False)
    def get_db():
        with sessions() as s:yield s
    for name,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
        m=types.ModuleType('kure_test_app.'+name);m.__dict__.update(attrs);sys.modules[m.__name__]=m
    eng=module('kure_test_app.kure_engine',ROOT/'backend/app/kure_engine.py');routes=module('kure_test_app.kure_routes',ROOT/'backend/app/kure_routes.py')
    with sessions() as s:s.add_all([User(id='a',lidya=100000),User(id='b',lidya=5000)]);s.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):
        u=db.get(User,identity['id'])
        if identity.get('stale'):u.lidya=123456789
        return u
    app=FastAPI();app.include_router(routes.register_auth(auth));client=TestClient(app)
    yield client,sessions,routes,eng,identity
    e.dispose()

def post(c,**kw):return c.post('/v1/games/kure/spin',json={'request_id':str(uuid4()),'stake':20,**kw})


def board(h=2):return [[{'s':(c+r)%5} for r in range(h)] for c in range(6)]
def top():return [{'s':i+5} for i in range(4)]
def forced(e,b,t=None,**kw):return e.spin(forced_heights=list(map(len,b)),forced_board=b,forced_top=t or top(),rng=lambda:.99,**kw)

def test_rules_validation(fixture):
 c,_,_,_,_=fixture;r=c.get('/v1/games/kure/rules').json()
 assert r['max_ways']==200704 and r['max_win']==5000 and r['ante_cost']==1.25 and r['bonus_cost']==100
 assert r['spin_sectors']==[5,8,10,12,15,20,12] and r['multiplier_sectors']==[2,3,5,8,10,15,20,25]
 for kw in [{'stake':True},{'stake':0},{'stake':-1},{'sequence':False},{'ante':1},{'action':'bad'},{'heights':[7]*6},{'multiplier':25}]:assert post(c,**kw).status_code==422

def test_maximum_ways_and_cap(fixture):
 *_,e,_=fixture;b=[[{'s':9} for _ in range(7)] for _ in range(6)];t=[{'s':9}]*4
 assert e.ways(b,t)==200704
 x=forced(e,b,t);assert x['payoutHundredths']==500000 and x['capped'] and not x['triggered'] and x['tumbles']==0

def test_wild_only_doubles_its_combinations_once(fixture):
 *_,e,_=fixture;b=board();b[0]=[{'s':0},{'s':0}];b[1]=[{'s':0},{'s':11}];b[2]=[{'s':0},{'s':11}];b[3]=[{'s':2},{'s':3}]
 amount,wins,removed=e.evaluate(b,top());w=next(w for w in wins if w['symbol']=='ten')
 assert w['count']==3 and w['ways']==8 and w['normalWays']==2 and w['wildWays']==6
 assert w['payHundredths']==e.PAY[0][0]*(2+2*6)
 x=e.evaluate(b,top(),multiplier=25)[1][0];assert x['payHundredths']==w['payHundredths']*25

def test_top_cell_counts_as_extra_way(fixture):
 *_,e,_=fixture;b=board();b[0]=[{'s':0},{'s':1}];b[1]=[{'s':0},{'s':2}];b[2]=[{'s':0},{'s':3}];b[3]=[{'s':4},{'s':4}]
 t=top();t[0]={'s':0};t[1]={'s':0}
 win=next(w for w in e.evaluate(b,t)[1] if w['symbol']=='ten');assert win['ways']==4 and win['count']==3
 assert 't:0' in win['indices'] and 't:1' in win['indices']

@pytest.mark.parametrize('n,pay',[(3,500),(4,1000),(5,2000),(6,10000)])
def test_scatter_once_and_bonus_multiplier(fixture,n,pay):
 *_,e,_=fixture;b=board()
 for c in range(n):b[c][0]={'s':10}
 x=forced(e,b);assert x['scatterHundredths']==pay and x['triggered']
 y=forced(e,b,bonus=True,multiplier=5);assert y['scatterHundredths']==pay*5

def test_invalid_shapes_positions(fixture):
 *_,e,_=fixture;b=board();b[0][0]={'s':11}
 with pytest.raises(ValueError):forced(e,b)
 with pytest.raises(ValueError):e.spin(forced_heights=[1]*6)
 with pytest.raises(ValueError):e.spin(forced_heights=[8]*6)
 with pytest.raises(ValueError):forced(e,board(),[{'s':10}]*4)
 with pytest.raises(ValueError):e.wheel(forced=(7,0))

def test_tumble_removes_only_winning_cells(fixture):
 *_,e,_=fixture;b=board();b[0]=[{'s':0},{'s':10}];b[1]=[{'s':0},{'s':3}];b[2]=[{'s':0},{'s':4}];b[3]=[{'s':1},{'s':2}]
 next_board=[[{'s':c}]*2 for c in range(6)];x=forced(e,b,forced_refills=[{'board':next_board,'top':top()}])
 assert x['tumbles']==1 and x['steps'][0]['removed']==['0:0','1:0','2:0']
 assert len(x['steps'])==2 and x['scatters']==1 and x['steps'][-1]['wins']==[]

def test_wheel_sector_mapping(fixture):
 *_,e,_=fixture
 for outer in range(7):
  for inner in range(8):
   w=e.wheel(forced=(outer,inner));assert w['spins']==e.FS[outer] and w['multiplier']==e.MULT[inner]

def test_buy_resume_late_replay_and_ante_lock(fixture):
 c,s,r,e,identity=fixture;r.wheel=lambda **kw:e.wheel(forced=(1,2))
 req={'request_id':str(uuid4()),'stake':20,'action':'buy','ante':True};a=c.post('/v1/games/kure/spin',json=req).json();st=a['state']
 assert a['charge']==2000 and st['remaining']==8 and st['multiplier']==5 and st['ante']
 assert c.get('/v1/games/kure/active').json()['state']['multiplier']==5
 assert post(c).status_code==409
 assert post(c,round_id=st['round_id'],sequence=1,ante=False).status_code==409
 assert post(c,round_id=st['round_id'],sequence=1,stake=40,ante=True).status_code==409
 identity['id']='b';assert post(c,round_id=st['round_id'],sequence=1,ante=True).status_code==404;identity['id']='a'
 x=post(c,round_id=st['round_id'],sequence=1,ante=True).json();assert x['charge']==0
 old=c.post('/v1/games/kure/spin',json=req).json();assert old['replayed'] and old['balance']==x['balance']

def fake(**kw):return {'payoutHundredths':0,'triggered':False,'capped':False,'wheelMultiplier':kw.get('multiplier',1)}
def test_retrigger_adds_spins_and_multiplier_once(fixture):
 c,s,r,e,_=fixture;r.wheel=lambda **kw:e.wheel(forced=(1,1));r.spin=lambda **kw:{**fake(**kw),'triggered':True}
 a=post(c,action='buy').json();st=a['state'];assert st['remaining']==8 and st['multiplier']==3
 req={'request_id':str(uuid4()),'stake':20,'round_id':st['round_id'],'sequence':st['sequence']}
 x=c.post('/v1/games/kure/spin',json=req).json();assert x['state']['remaining']==15 and x['state']['multiplier']==6 and x['result']['wheelMultiplier']==3
 again=c.post('/v1/games/kure/spin',json=req).json();assert again['state']['remaining']==15 and again['state']['multiplier']==6 and again['replayed']

def test_ante_fractional_charge(fixture):
 c,s,r,e,_=fixture;r.spin=fake
 x=post(c,stake=1,ante=True).json();assert x['charge']==1.25 and x['balance']==99998.75
 with s() as db:assert json.loads(db.get(GameRound,r.wallet_id('a')).state_data)['remainder']==75

def test_cap_stops_bonus(fixture):
 c,s,r,e,_=fixture;r.wheel=lambda **kw:e.wheel(forced=(1,7));a=post(c,action='buy').json();st=a['state']
 r.spin=lambda **kw:{**fake(**kw),'payoutHundredths':500000,'capped':True}
 x=post(c,round_id=st['round_id'],sequence=st['sequence']).json();assert x['state']['finished'] and x['state']['remaining']==0 and x['payout']==100000

def test_insufficient_rollback(fixture):
 c,s,r,e,identity=fixture;identity['id']='b';assert post(c,stake=100,action='buy').status_code==400
 identity['id']='a';r.spin=lambda **kw:(_ for _ in ()).throw(RuntimeError('rng'))
 with pytest.raises(RuntimeError):post(c)
 with s() as db:assert db.get(User,'a').lidya==100000 and not list(db.scalars(select(GameRound)))

def test_api_before_static():
 source=(ROOT/'backend/app/main.py').read_text();assert source.index('app.include_router(kure_routes.register_auth(current_user))')<source.index('app.mount("/", StaticFiles')


def test_all_positive_initial_scatter_counts_possible():
 cfg=json.loads((ROOT/'backend/app/kure-math.json').read_text())
 assert len(cfg['baseScatterCountWeights'])==6 and all(v>0 for v in cfg['baseScatterCountWeights'])
 assert sum(cfg['baseScatterCountWeights'])==100000
 assert cfg['scatterRate']*2<=1
