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
    package=types.ModuleType('dede_test_app');package.__path__=[];sys.modules['dede_test_app']=package
    e=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(e);sessions=sessionmaker(bind=e,autoflush=False)
    def get_db():
        with sessions() as s:yield s
    for name,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
        m=types.ModuleType('dede_test_app.'+name);m.__dict__.update(attrs);sys.modules[m.__name__]=m
    eng=module('dede_test_app.dede_engine',ROOT/'backend/app/dede_engine.py');routes=module('dede_test_app.dede_routes',ROOT/'backend/app/dede_routes.py')
    with sessions() as s:s.add_all([User(id='a',lidya=100000),User(id='b',lidya=5000)]);s.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):
        u=db.get(User,identity['id'])
        if identity.get('stale'):u.lidya=123456789
        return u
    app=FastAPI();app.include_router(routes.register_auth(auth));client=TestClient(app)
    yield client,sessions,routes,eng,identity
    e.dispose()

def post(c,**kw):return c.post('/v1/games/dede/spin',json={'request_id':str(uuid4()),'stake':20,**kw})

def test_rules_and_validation(fixture):
    c,*_=fixture
    assert c.get('/v1/games/dede/rules').json()['max_win']==5000
    for kw in [{'stake':0},{'stake':1000000001},{'stake':True},{'ante':1},{'stake':20.0},{'sequence':False},{'action':'hack'},{'payout':999},{'request_id':'not-a-uuid'},{'ante':True,'action':'buy'}]:assert post(c,**kw).status_code==422

def test_paid_spin_exactly_once(fixture):
    c,s,r,e,_=fixture
    payload={'request_id':str(uuid4()),'stake':20}
    a=c.post('/v1/games/dede/spin',json=payload);assert a.status_code==200,a.text
    first=a.json();again=c.post('/v1/games/dede/spin',json=payload).json()
    assert again['replayed'] and first['payout']==again['payout']
    with s() as db:
        assert db.get(User,'a').lidya==100000-20+first['payout']
        assert len(list(db.scalars(select(GameBet))))==1
        assert len(list(db.scalars(select(GamePlay))))==1

def test_bonus_resume_owner_and_sequence(fixture):
    c,s,r,e,identity=fixture
    b=post(c,action='buy').json();state=b['state'];rid=state['round_id']
    assert state['remaining']==15 and b['charge']==2000 and b['balance']==98000
    assert c.get('/v1/games/dede/active').json()['state']['round_id']==rid
    assert post(c).status_code==409
    assert post(c,round_id=rid,sequence=0).status_code==409
    assert post(c,round_id=rid,sequence=1,stake=40).status_code==409
    identity['id']='b';assert post(c,round_id=rid,sequence=1).status_code==404;identity['id']='a'
    payload={'request_id':str(uuid4()),'round_id':rid,'sequence':1,'stake':20}
    a=c.post('/v1/games/dede/spin',json=payload).json();b=c.post('/v1/games/dede/spin',json=payload).json()
    assert a['charge']==0 and b['replayed'] and a['balance']==b['balance']
    assert a['state']['remaining'] in [14,19]
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
    assert c.get('/v1/games/dede/active').json()['state'] is None
    assert post(c,round_id=state['round_id'],sequence=2).status_code==409
    with s() as db:assert db.scalar(select(GameBet)).payout==100000

def test_rng_failure_rolls_back_charge(fixture):
    c,s,r,e,_=fixture
    r.spin=lambda **kw:(_ for _ in ()).throw(RuntimeError('fixture failure'))
    with pytest.raises(RuntimeError):post(c)
    with s() as db:
        assert db.get(User,'a').lidya==100000
        assert not list(db.scalars(select(GameRound)))

def test_paytable_and_pool(fixture):
    c,s,r,e,_=fixture
    for symbol in range(9):
        for count,tier in [(7,None),(8,0),(9,0),(10,1),(11,1),(12,2),(30,2)]:
            board=[{'s':symbol} for _ in range(count)]+[{'s':10,'m':2} for _ in range(30-count)]
            amount,wins=e.evaluate(board);assert amount==(0 if tier is None else e.PAY[symbol][tier])
    import random
    for seed in range(50):
        a=e.spin(bonus=True,pool=17,config={**e.CONFIG,'bonusOrbRate':0},rng=random.Random(seed).random)
        assert a['pool']==17 and a['payoutHundredths']==round(a['raw']*100)*17
    a=e.spin(config={**e.CONFIG,'bonusTrigger':1},rng=random.Random(6).random)
    assert a['bonusTriggered'] and a['scatters']>=4
    a=e.spin(bonus=True,config={**e.CONFIG,'retrigger':1},rng=random.Random(2).random)
    assert a['extraSpins']==5

def test_javascript_python_trace_parity(fixture):
    c,s,r,e,_=fixture
    path=ROOT/'tests/dede-parity.json'
    if not path.exists():pytest.skip('Generate scripted RNG fixtures with dede-reference-tests.cjs')
    for case in json.loads(path.read_text()):
        values=iter(case['random']);a=e.spin(rng=lambda:next(values),bonus=case['bonus'],pool=case['pool'],ante=case['ante']);b=case['result']
        a.pop('payoutHundredths');assert a==b


def test_locked_wallet_refreshes_auth_identity(fixture):
    c,s,r,e,identity=fixture
    identity['stale']=True
    res=post(c).json()
    assert res['balance']==100000-20+res['payout']
    with s() as db:assert db.get(User,'a').lidya==res['balance']


def test_fractional_payout_carried_between_rounds(fixture):
    c,s,r,e,_=fixture
    native=r.spin
    def fixed(**kw):
        out=native(**kw);out.update(payoutHundredths=25,payout=.25,bonusTriggered=False,extraSpins=0);return out
    r.spin=fixed
    a=post(c,stake=50).json();b=post(c,stake=50).json()
    assert a['payout']==b['payout']==12.5
    assert a['balance']==99962.5 and b['balance']==99925
    with s() as db:
        assert db.get(User,'a').lidya==99925
        bets=list(db.scalars(select(GameBet).order_by(GameBet.id)))
        assert [x.payout for x in bets]==[12,13]
        assert r.fraction(db,'a')==0
    assert c.get('/v1/games/dede/active').json()['balance']==99925

def test_one_lidya_ante_exact_charge_and_replay(fixture):
    c,s,r,e,_=fixture
    native=r.spin
    def zero(**kw):
        out=native(**kw);out.update(payoutHundredths=0,payout=0,bonusTriggered=False,extraSpins=0);return out
    r.spin=zero
    payload={'request_id':str(uuid4()),'stake':1,'ante':True}
    a=c.post('/v1/games/dede/spin',json=payload).json();again=c.post('/v1/games/dede/spin',json=payload).json()
    assert a['charge']==1.25 and a['balance']==99998.75
    assert again['balance']==a['balance'] and again['replayed']
    with s() as db:assert r.fraction(db,'a')==75
    b=post(c,stake=1,ante=True).json();assert b['balance']==99997.5

def test_new_stake_sizes_and_legacy_bonus(fixture):
    c,s,r,e,_=fixture
    native=r.spin
    def zero(**kw):
        out=native(**kw);out.update(payoutHundredths=0,payout=0,bonusTriggered=False,extraSpins=0);return out
    r.spin=zero
    for stake in [1,50,150,200,300,1000,1200,5000,5250,9750,10000]:assert post(c,stake=stake).status_code==200
    with s() as db:u=db.get(User,'a');u.lidya=100000;db.commit()
    old=post(c,stake=20,action='buy').json()['state']
    assert post(c,round_id=old['round_id'],sequence=old['sequence'],stake=20).status_code==200
