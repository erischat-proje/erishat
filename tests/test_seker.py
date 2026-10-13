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
    package=types.ModuleType('seker_test_app');package.__path__=[];sys.modules['seker_test_app']=package
    e=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(e);sessions=sessionmaker(bind=e,autoflush=False)
    def get_db():
        with sessions() as s:yield s
    for name,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
        m=types.ModuleType('seker_test_app.'+name);m.__dict__.update(attrs);sys.modules[m.__name__]=m
    eng=module('seker_test_app.seker_engine',ROOT/'backend/app/seker_engine.py');routes=module('seker_test_app.seker_routes',ROOT/'backend/app/seker_routes.py')
    with sessions() as s:s.add_all([User(id='a',lidya=100000),User(id='b',lidya=5000)]);s.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):
        u=db.get(User,identity['id'])
        if identity.get('stale'):u.lidya=123456789
        return u
    app=FastAPI();app.include_router(routes.register_auth(auth));client=TestClient(app)
    yield client,sessions,routes,eng,identity
    e.dispose()

def post(c,**kw):return c.post('/v1/games/seker/spin',json={'request_id':str(uuid4()),'stake':20,**kw})

def test_rules_and_validation(fixture):
    c,*_=fixture
    assert c.get('/v1/games/seker/rules').json()['max_win']==21100
    for kw in [{'stake':0},{'stake':10001},{'stake':True},{'ante':1},{'stake':20.0},{'sequence':False},{'action':'hack'},{'payout':999},{'request_id':'not-a-uuid'},{'ante':True,'action':'buy'}]:assert post(c,**kw).status_code==422

def test_paid_spin_exactly_once(fixture):
    c,s,r,e,_=fixture
    payload={'request_id':str(uuid4()),'stake':20}
    a=c.post('/v1/games/seker/spin',json=payload);assert a.status_code==200,a.text
    first=a.json();again=c.post('/v1/games/seker/spin',json=payload).json()
    assert again['replayed'] and first['payout']==again['payout']
    with s() as db:
        assert db.get(User,'a').lidya==100000-20+first['payout']
        assert len(list(db.scalars(select(GameBet))))==1
        assert len(list(db.scalars(select(GamePlay))))==1

def test_bonus_resume_owner_and_sequence(fixture):
    c,s,r,e,identity=fixture
    b=post(c,action='buy').json();state=b['state'];rid=state['round_id']
    assert state['remaining']==10 and b['charge']==2000 and b['balance']==98000
    assert c.get('/v1/games/seker/active').json()['state']['round_id']==rid
    assert post(c).status_code==409
    assert post(c,round_id=rid,sequence=0).status_code==409
    assert post(c,round_id=rid,sequence=1,stake=40).status_code==409
    identity['id']='b';assert post(c,round_id=rid,sequence=1).status_code==404;identity['id']='a'
    payload={'request_id':str(uuid4()),'round_id':rid,'sequence':1,'stake':20}
    a=c.post('/v1/games/seker/spin',json=payload).json();b=c.post('/v1/games/seker/spin',json=payload).json()
    assert a['charge']==0 and b['replayed'] and a['balance']==b['balance']
    assert a['state']['remaining'] in [9,14]
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
        out=native(**kw);out.update(payoutHundredths=2110000,payout=5000,capped=True);return out
    r.spin=capped
    a=post(c,round_id=state['round_id'],sequence=1).json()
    assert a['payout']==422000 and a['state']['remaining']==0 and a['state']['finished']
    assert c.get('/v1/games/seker/active').json()['state'] is None
    assert post(c,round_id=state['round_id'],sequence=2).status_code==409
    with s() as db:assert db.scalar(select(GameBet)).payout==422000

def test_rng_failure_rolls_back_charge(fixture):
    c,s,r,e,_=fixture
    r.spin=lambda **kw:(_ for _ in ()).throw(RuntimeError('fixture failure'))
    with pytest.raises(RuntimeError):post(c)
    with s() as db:
        assert db.get(User,'a').lidya==100000
        assert not list(db.scalars(select(GameRound)))

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
    assert c.get('/v1/games/seker/active').json()['balance']==99925

def test_one_lidya_ante_exact_charge_and_replay(fixture):
    c,s,r,e,_=fixture
    native=r.spin
    def zero(**kw):
        out=native(**kw);out.update(payoutHundredths=0,payout=0,bonusTriggered=False,extraSpins=0);return out
    r.spin=zero
    payload={'request_id':str(uuid4()),'stake':1,'ante':True}
    a=c.post('/v1/games/seker/spin',json=payload).json();again=c.post('/v1/games/seker/spin',json=payload).json()
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



def test_old_bonus_receipt_remains_idempotent(fixture):
    c,s,r,e,_=fixture
    first=post(c,action='buy').json()['state']
    payload={'request_id':str(uuid4()),'round_id':first['round_id'],'sequence':1,'stake':20}
    one=c.post('/v1/games/seker/spin',json=payload).json()
    two=post(c,round_id=first['round_id'],sequence=2).json()
    replay=c.post('/v1/games/seker/spin',json=payload).json()
    assert replay['replayed'] and replay['payout']==one['payout']
    assert replay['balance']==two['balance']


def test_shared_dede_fraction_wallet(fixture):
    c,s,r,e,_=fixture
    from datetime import datetime,timezone
    with s() as db:
        now=datetime.now(timezone.utc)
        db.add(GameRound(id=r.wallet_id('a'),user_id='a',game_type='dede_wallet',status='ledger',started_at=now,ends_at=now,result_key='fraction',state_data='{"remainder":50}'))
        db.commit()
    assert c.get('/v1/games/seker/active').json()['balance']==100000.5
    native=r.spin
    def zero(**kw):
        out=native(**kw);out.update(payoutHundredths=0,bonusTriggered=False);return out
    r.spin=zero
    result=post(c,stake=1,ante=True).json()
    assert result['balance']==99999.25
    with s() as db:assert r.fraction(db,'a')==25


def test_engine_rules_and_no_cross_spin_pool(fixture):
    c,s,r,e,_=fixture
    import random
    for symbol in range(9):
        for count,tier in [(7,None),(8,0),(9,0),(10,1),(11,1),(12,2),(30,2)]:
            board=[{'s':symbol}]*count+[{'s':10,'m':2}]*(30-count)
            amount,wins=e.evaluate(board)
            assert amount==(0 if tier is None else e.PAY[symbol][tier])
    for seed in range(100):
        base=e.spin(rng=random.Random(seed).random)
        assert not base['multipliers'] and base['applied']==1
        bonus=e.spin(bonus=True,rng=random.Random(seed).random)
        assert bonus['pool']==0
        assert bonus['payoutHundredths']==min(e.CAP,bonus['rawHundredths']*max(1,sum(bonus['multipliers'])))
        assert bonus['steps'][-1]['terminal']
        for i,step in enumerate(bonus['steps'][:-1]):
            new=bonus['steps'][i+1]['board']
            for col in range(6):
                survivors=[step['board'][row*6+col] for row in range(5) if row*6+col not in step['removed']]
                assert [new[row*6+col] for row in range(5-len(survivors),5)]==survivors
    for scatters,pay in [(3,0),(4,300),(5,500),(6,10000)]:
        board=[{'s':9}]*scatters+[{'s':i%9} for i in range(30-scatters)]
        x=e.spin(forced_board=board,rng=random.Random(33).random)
        assert x['scatterHundredths']==pay and x['bonusTriggered']==(scatters>=4)
        x=e.spin(bonus=True,forced_board=board,rng=random.Random(33).random)
        assert x['extraSpins']==5 and x['scatterHundredths']==0
