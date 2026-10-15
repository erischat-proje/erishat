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
    package=types.ModuleType('candy_test_app');package.__path__=[str(ROOT/'backend/app')];sys.modules['candy_test_app']=package
    e=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(e);sessions=sessionmaker(bind=e,autoflush=False)
    def get_db():
        with sessions() as s:yield s
    for name,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
        m=types.ModuleType('candy_test_app.'+name);m.__dict__.update(attrs);sys.modules[m.__name__]=m
    eng=module('candy_test_app.candy_engine',ROOT/'backend/app/candy_engine.py');routes=module('candy_test_app.candy_routes',ROOT/'backend/app/candy_routes.py')
    with sessions() as s:s.add_all([User(id='a',lidya=100000),User(id='b',lidya=5000)]);s.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):
        u=db.get(User,identity['id'])
        if identity.get('stale'):u.lidya=123456789
        return u
    app=FastAPI();app.include_router(routes.register_auth(auth));client=TestClient(app)
    yield client,sessions,routes,eng,identity
    e.dispose()

def post(c,**kw):return c.post('/v1/games/candy/spin',json={'request_id':str(uuid4()),'stake':20,**kw})

def test_rules_and_validation(fixture):
    c,*_=fixture
    assert c.get('/v1/games/candy/rules').json()['max_win']==5000
    for kw in [{'stake':0},{'stake':-1},{'stake':True},{'ante':1},{'stake':20.0},{'sequence':False},{'action':'hack'},{'payout':999},{'request_id':'not-a-uuid'},{'ante':True,'action':'buy'}]:assert post(c,**kw).status_code==422

def test_paid_spin_exactly_once(fixture):
    c,s,r,e,_=fixture
    payload={'request_id':str(uuid4()),'stake':20}
    a=c.post('/v1/games/candy/spin',json=payload);assert a.status_code==200,a.text
    first=a.json();again=c.post('/v1/games/candy/spin',json=payload).json()
    assert again['replayed'] and first['payout']==again['payout']
    with s() as db:
        assert db.get(User,'a').lidya+r.fraction(db,'a')/100==100000-20+first['payout']
        assert len(list(db.scalars(select(GameBet))))==1
        assert len(list(db.scalars(select(GamePlay))))==1

def test_bonus_resume_owner_and_sequence(fixture):
    c,s,r,e,identity=fixture
    b=post(c,action='buy').json();state=b['state'];rid=state['round_id']
    assert state['remaining'] in [10,12,15,20,30] and b['charge']==2000 and b['balance']==98000
    assert c.get('/v1/games/candy/active').json()['state']['round_id']==rid
    assert post(c).status_code==409
    assert post(c,round_id=rid,sequence=0).status_code==409
    assert post(c,round_id=rid,sequence=1,stake=40).status_code==409
    identity['id']='b';assert post(c,round_id=rid,sequence=1).status_code==404;identity['id']='a'
    payload={'request_id':str(uuid4()),'round_id':rid,'sequence':1,'stake':20}
    a=c.post('/v1/games/candy/spin',json=payload).json();b=c.post('/v1/games/candy/spin',json=payload).json()
    assert a['charge']==0 and b['replayed'] and a['balance']==b['balance']
    assert a['state']['remaining']==state['remaining']-1
    assert post(c,round_id=rid,sequence=1).status_code==409

def test_ante_charge_and_insufficient_balance(fixture):
    c,s,r,e,_=fixture
    res=post(c,ante=True).json();assert res['charge']==25
    # No available funds for a bonus purchase.
    with s() as db:u=db.get(User,'a');u.lidya=0;db.commit()
    assert post(c,action='buy').status_code in [400,409]
    with s() as db:assert db.get(User,'a').lidya==0

def test_cap_ends_bonus_and_tracks_bet(fixture):
    c,s,r,e,_=fixture
    b=post(c,action='buy').json();state=b['state']
    native=r.spin
    def capped(**kw):
        out=native(**kw);out.update(payoutHundredths=500000,payout=5000,capped=True);return out
    r.spin=capped
    a=post(c,round_id=state['round_id'],sequence=1).json()
    assert a['payout']==100000 and a['state']['remaining']==0 and a['state']['finished']
    assert c.get('/v1/games/candy/active').json()['state'] is None
    assert post(c,round_id=state['round_id'],sequence=2).status_code==409
    with s() as db:assert db.scalar(select(GameBet)).payout==100000

def test_rng_failure_rolls_back_charge(fixture):
    c,s,r,e,_=fixture
    r.spin=lambda **kw:(_ for _ in ()).throw(RuntimeError('fixture failure'))
    with pytest.raises(RuntimeError):post(c)
    with s() as db:
        assert db.get(User,'a').lidya==100000
        assert not list(db.scalars(select(GameRound)))


def quiet_board():return [(i+i//7)%7 for i in range(49)]

def test_cluster_horizontal_vertical_and_diagonal(fixture):
    *_,eng,_=fixture
    diagonal=quiet_board()
    for i in [0,8,16,24,32]:diagonal[i]=0
    assert not eng.clusters(diagonal)
    board=quiet_board()
    for i in [0,1,2,9,16]:board[i]=6
    groups=eng.clusters(board)
    assert any(set(cells)=={0,1,2,9,16} for _,cells in groups)

def test_separate_clusters_and_sum_spots(fixture):
    *_,eng,_=fixture
    board=[(i+i//7)%6 for i in range(49)]
    for i in [0,1,2,3,4,42,43,44,45,46]:board[i]=6
    marks=[0]*49;marks[0]=2;marks[1]=4
    wins=eng.evaluate(board,marks)
    assert len(wins)==2 and wins[0]['multiplier']==6 and wins[1]['multiplier']==1
    assert sum(w['hundredths'] for w in wins)==700

def test_double_explosion_timing_and_sticky(fixture):
    *_,eng,_=fixture
    board=quiet_board()
    for i in range(5):board[i]=0
    first=eng.spin(bonus=True,spots=[0]*49,forced_board=board,remaining_cap=20,rng=lambda:.99)
    assert first['payoutHundredths']==20 and all(first['spots'][i]==1 for i in range(5))
    second=eng.spin(bonus=True,spots=first['spots'],forced_board=board,remaining_cap=20,rng=lambda:.99)
    assert second['steps'][0]['wins'][0]['multiplier']==1 and all(second['spots'][i]==2 for i in range(5))
    third=eng.spin(bonus=True,spots=second['spots'],forced_board=board,remaining_cap=200,rng=lambda:.99)
    assert third['steps'][0]['wins'][0]['multiplier']==10 and all(third['spots'][i]==4 for i in range(5))
    reset=eng.spin(spots=[1024]*49,forced_board=quiet_board(),rng=lambda:.99)
    assert reset['spots']==[0]*49
    top=eng.spin(bonus=True,spots=[1024]*49,forced_board=board,remaining_cap=1,rng=lambda:.99)
    assert top['spots']==[1024]*49 and top['capped']

@pytest.mark.parametrize('count,free',[(3,10),(4,12),(5,15),(6,20),(7,30)])
def test_scatter_mapping(fixture,count,free):
    *_,eng,_=fixture
    board=quiet_board()
    for i in range(count):board[i]=7
    r=eng.spin(forced_board=board,rng=lambda:.99)
    assert r['bonusTriggered'] and r['bonusSpins']==free and r['payoutHundredths']==0

def test_purchase_distribution_edges(fixture):
    *_,eng,_=fixture
    assert eng.buy_spins(lambda:0)==10
    assert eng.buy_spins(lambda:.9999999)==30

def test_late_duplicate_receipt_after_bonus_moves(fixture):
    c,s,r,e,_=fixture
    buy={'request_id':str(uuid4()),'stake':20,'action':'buy'}
    original=c.post('/v1/games/candy/spin',json=buy).json();state=original['state']
    nextspin=post(c,round_id=state['round_id'],sequence=state['sequence']).json()
    replay=c.post('/v1/games/candy/spin',json=buy).json()
    assert replay['replayed'] and replay['charge']==2000 and replay['balance']==nextspin['balance']
    assert c.get('/v1/games/candy/active').json()['state']['sequence']==2

def test_shared_fractional_wallet(fixture):
    c,s,r,e,_=fixture
    with s() as db:
        from datetime import datetime
        db.add(GameRound(id=r.wallet_id('a'),user_id='a',game_type='dede_wallet',status='ledger',started_at=datetime.now(),ends_at=datetime.now(),result_key='fraction',state_data='{"remainder":75}'));db.commit()
    r.spin=lambda **kw:{'payoutHundredths':0,'payout':0,'bonusTriggered':False,'spots':[0]*49,'capped':False}
    a=post(c,stake=1,ante=True).json()
    assert a['balance']==99999.5 and a['charge']==1.25
