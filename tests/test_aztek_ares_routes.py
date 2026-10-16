"""Version migration and exact settlement tests against an isolated SQLite wallet."""
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
    name = 'aztek_routes_test'
    package = types.ModuleType(name)
    package.__path__ = [str(ROOT/'backend/app')]
    sys.modules[name] = package
    engine = create_engine('sqlite://', connect_args={'check_same_thread':False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False)
    def get_db():
        with sessions() as db:
            yield db
    for suffix, attrs in [('db', {'get_db':get_db}), ('models', {'User':User}),
                          ('platform_models', {'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),
                          ('moderation', {'require_feature':lambda *_:None})]:
        stub=types.ModuleType(name+'.'+suffix);stub.__dict__.update(attrs);sys.modules[stub.__name__]=stub
    # Load the real shared fraction helpers without loading unrelated app models.
    module(name+'.kure_engine', ROOT/'backend/app/kure_engine.py')
    module(name+'.kure_routes', ROOT/'backend/app/kure_routes.py')
    math = module(name+'.aztek_ares_engine', ROOT/'backend/app/aztek_ares_engine.py')
    routes = module(name+'.aztek_ares_routes', ROOT/'backend/app/aztek_ares_routes.py')
    with sessions() as db:
        db.add_all([User(id='a',lidya=100000),User(id='b',lidya=1000)]);db.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):
        return db.get(User,identity['id'])
    app=FastAPI();app.include_router(routes.register_auth(auth))
    yield TestClient(app),sessions,routes,math,identity
    engine.dispose()


def post(client, game='ares', **kwargs):
    return client.post('/v1/games/'+game+'/spin', json={'request_id':str(uuid4()),'stake':1,**kwargs})


def test_new_round_and_fraction_are_settled_once(fixture, monkeypatch):
    c,s,r,engine,_=fixture
    original=r.spin
    def fixed(*args,**kwargs):
        value=original(*args,**kwargs);value.update(payoutHundredths=37,awarded=0);return value
    monkeypatch.setattr(r,'spin',fixed)
    request={'request_id':str(uuid4()),'stake':1}
    first=c.post('/v1/games/ares/spin',json=request);assert first.status_code==200,first.text
    a=first.json();b=c.post('/v1/games/ares/spin',json=request).json()
    assert a['state']['version']==engine.VERSION
    assert a['next_rules']['version']==engine.VERSION
    assert a['balance']==99999.37 and b['balance']==a['balance'] and b['replayed']
    with s() as db:
        assert r.fraction(db,'a')==37
        assert len(list(db.scalars(select(GameBet))))==1


def test_paid_v1_bonus_resumes_then_returns_to_v2(fixture,monkeypatch):
    c,s,r,engine,identity=fixture
    result=post(c,action='buy').json();state=result['state'];rid=state['round_id']
    with s() as db:
        row=db.get(GameRound,rid);stored=json.loads(row.state_data)
        stored.update(version=engine.legacy.VERSION,remaining=1)
        row.state_data=json.dumps(stored);db.commit()
    active=c.get('/v1/games/ares/active').json()
    assert active['rules']['version']==engine.legacy.VERSION
    assert active['state']['remaining']==1
    calls=[]
    original=r.spin
    def record(*args,**kwargs):
        calls.append(kwargs['version']);out=original(*args,**kwargs);out.update(awarded=0);return out
    monkeypatch.setattr(r,'spin',record)
    before=active['balance']
    identity['id']='b'
    assert post(c,round_id=rid,sequence=1).status_code==404
    identity['id']='a'
    assert post(c,round_id=rid,sequence=0).status_code==409
    request={'request_id':str(uuid4()),'stake':1,'round_id':rid,'sequence':1}
    response=c.post('/v1/games/ares/spin',json=request)
    assert response.status_code==200,response.text
    out=response.json()
    assert calls==[engine.legacy.VERSION] and out['result']['version']==engine.legacy.VERSION
    assert out['charge']==0 and out['balance']==before+out['payout']
    assert out['state']['finished'] and out['next_rules']['version']==engine.VERSION
    replay=c.post('/v1/games/ares/spin',json=request).json()
    assert replay['replayed'] and calls==[engine.legacy.VERSION]
    assert c.get('/v1/games/ares/active').json()['rules']['version']==engine.VERSION


def test_unknown_saved_model_cannot_charge_or_change_progress(fixture):
    c,s,r,engine,_=fixture
    state=post(c,action='buy').json()['state'];rid=state['round_id']
    with s() as db:
        row=db.get(GameRound,rid);stored=json.loads(row.state_data);stored['version']='unavailable'
        row.state_data=json.dumps(stored);db.commit()
    assert post(c,round_id=rid,sequence=1).status_code==409
    with s() as db:
        assert db.get(User,'a').lidya==99900
        assert json.loads(db.get(GameRound,rid).state_data)['remaining']==15


def test_clients_cannot_select_a_model_or_payout(fixture):
    c,*_=fixture
    for kwargs in [{'version':'lidya-aztek-ares-v1'},{'payout':10000},{'bonus':True}]:
        assert post(c,**kwargs).status_code==422


def test_failure_rolls_back_charge(fixture,monkeypatch):
    c,s,r,*_=fixture
    def fail(*args,**kwargs):raise RuntimeError('engine failure')
    monkeypatch.setattr(r,'spin',fail)
    with pytest.raises(RuntimeError):post(c)
    with s() as db:
        assert db.get(User,'a').lidya==100000
        assert not list(db.scalars(select(GameRound)))
