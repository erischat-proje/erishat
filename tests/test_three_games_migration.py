"""Real routes and shared fractional ledger in isolated SQLite databases."""
import json
import random
import sys
import types
from uuid import uuid4

import pytest
from fastapi import Depends,FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine,select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from test_aztek_ares_routes import Base,User,GameRound,GameBet,GamePlay,module,ROOT


@pytest.fixture(params=['bastet','candy','kovboy'])
def fixture(request):
    game=request.param;name='migration_'+game
    package=types.ModuleType(name);package.__path__=[str(ROOT/'backend/app')];sys.modules[name]=package
    db_engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
    Base.metadata.create_all(db_engine);sessions=sessionmaker(bind=db_engine,autoflush=False)
    def get_db():
        with sessions() as db:yield db
    for suffix,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
        stub=types.ModuleType(name+'.'+suffix);stub.__dict__.update(attrs);sys.modules[stub.__name__]=stub
    engine=module(name+'.'+game+'_engine',ROOT/'backend/app'/f'{game}_engine.py')
    routes=module(name+'.'+game+'_routes',ROOT/'backend/app'/f'{game}_routes.py')
    with sessions() as db:db.add_all([User(id='a',lidya=100000),User(id='b',lidya=1000)]);db.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):return db.get(User,identity['id'])
    app=FastAPI();app.include_router(routes.register_auth(auth))
    yield TestClient(app),sessions,routes,engine,identity,game
    db_engine.dispose()


def post(fixture,**kwargs):
    return fixture[0].post('/v1/games/'+fixture[-1]+'/spin',json={'request_id':str(uuid4()),'stake':1,**kwargs})


def test_legacy_paid_bonus_uses_its_saved_model_and_replays_once(fixture,monkeypatch):
    c,s,r,e,identity,game=fixture
    initial=post(fixture,action='buy');assert initial.status_code==200,initial.text
    state=initial.json()['state'];rid=state['round_id']
    assert state['version']==e.CONFIG['version']
    with s() as db:
        row=db.get(GameRound,rid);stored=json.loads(row.state_data)
        stored.update(version=e.LEGACY_CONFIG['version'],remaining=1)
        row.state_data=json.dumps(stored);db.commit()
    before=c.get('/v1/games/'+game+'/active').json()['balance'];calls=[]
    original=r.spin
    def record(**kwargs):
        calls.append(kwargs)
        result=original(**kwargs,rng=random.Random(414).random,trace=False)
        result['extraSpins']=0
        if game=='bastet':result.update(respin=False,locked={})
        return result
    monkeypatch.setattr(r,'spin',record)
    identity['id']='b';assert post(fixture,round_id=rid,sequence=1).status_code==404
    identity['id']='a';assert post(fixture,round_id=rid,sequence=0).status_code==409
    request_id=str(uuid4());response=post(fixture,request_id=request_id,round_id=rid,sequence=1)
    assert response.status_code==200,response.text
    out=response.json()
    assert out['charge']==0 and out['state']['finished']
    assert out['state']['version']==out['result']['modelVersion']==e.LEGACY_CONFIG['version']
    assert out['balance']==before+out['payout']
    assert calls[0]['model_version']==e.LEGACY_CONFIG['version']
    if game!='candy':assert calls[0]['purchased'] is True
    replay=post(fixture,request_id=request_id,round_id=rid,sequence=1).json()
    assert replay['replayed'] and len(calls)==1 and replay['balance']==out['balance']
    with s() as db:assert len(list(db.scalars(select(GameBet))))==1
    assert post(fixture,action='buy').json()['state']['version']==e.CONFIG['version']


def test_unknown_model_cannot_charge_or_advance(fixture):
    c,s,r,e,_,game=fixture
    state=post(fixture,action='buy').json()['state'];rid=state['round_id']
    with s() as db:
        row=db.get(GameRound,rid);stored=json.loads(row.state_data);stored['version']='missing'
        row.state_data=json.dumps(stored);db.commit()
    assert post(fixture,round_id=rid,sequence=1).status_code==409
    with s() as db:
        assert db.get(User,'a').lidya==99900
        assert json.loads(db.get(GameRound,rid).state_data)['remaining']==state['remaining']


def test_client_cannot_request_old_odds_or_purchase_profile(fixture):
    for kwargs in [{'version':'old'},{'model_version':'old'},{'purchased':True}]:
        assert post(fixture,**kwargs).status_code==422
