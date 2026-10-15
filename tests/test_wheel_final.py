"""Exercise production wheel services with real SQLAlchemy models in an isolated SQLite DB."""
import importlib
import sys
import types
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import Column, String, Table, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.pool import StaticPool

root = Path(__file__).resolve().parents[1]
pkg = types.ModuleType('_wheel_test_app')
pkg.__path__ = [str(root / 'backend/app')]
sys.modules[pkg.__name__] = pkg

class Base(DeclarativeBase):
    pass
stub = types.ModuleType('_wheel_test_app.db')
stub.Base = Base
sys.modules[stub.__name__] = stub
models = importlib.import_module('_wheel_test_app.models')
platform = importlib.import_module('_wheel_test_app.platform_models')
service = importlib.import_module('_wheel_test_app.wheel_live_v4')
rules = importlib.import_module('_wheel_test_app.wheel_rules')
User, GameBet, GameRound = models.User, platform.GameBet, platform.GameRound
rooms = Table('rooms', Base.metadata, Column('id', String(64), primary_key=True))

@pytest.fixture
def db():
    engine = create_engine('sqlite:///:memory:',poolclass=StaticPool,connect_args={'check_same_thread':False})
    Base.metadata.create_all(engine, tables=[User.__table__, rooms, GameRound.__table__,
        GameBet.__table__, service.WheelReceipt.__table__, service.WheelSettlement.__table__])
    with Session(engine) as session:
        yield session
    engine.dispose()

def user(db, uid='player', balance=500_000):
    u = User(id=uid, public_id='ID'+uid, nickname='Oyuncu '+uid, lidya=balance)
    db.add(u);db.commit();return u

def request(row, amount=100, choice='rose', request_id=None):
    return service.BetRequest(round_id=row.id, amount=amount, choice=choice, request_id=request_id or uuid4())

def test_weights_and_complete_secure_draw_domain():
    assert sum(rules.WEIGHTS.values()) == 10000
    counts = Counter(rules.choose(randbelow=lambda n, i=i: i) for i in range(10000))
    assert counts == rules.WEIGHTS
    assert len(set(counts[k] for k in ('rose','heart','star','diamond'))) == 1
    assert counts['crown'] > counts['fire'] > counts['gem'] > counts['jackpot'] > 0

@pytest.mark.parametrize('symbol,mult', list(rules.MULTIPLIERS.items()))
def test_exact_payouts(symbol,mult):
    assert rules.payout(symbol,symbol,100000) == 100000*mult
    assert rules.payout('wrong',symbol,100000) == 0

@pytest.mark.parametrize('amount', rules.STAKES+(50,500,3000000000))
def test_all_five_bets_replay_once(db, amount):
    u=user(db,balance=max(500000,amount*2));before=u.lidya;row=service.get_round(db);db.commit();payload=request(row,amount)
    result=service.place_bet(db,u,payload);db.commit()
    again=service.place_bet(db,u,payload);db.commit()
    assert not result['replayed'] and again['replayed']
    assert u.lidya == before-amount
    assert db.scalar(select(func.count(GameBet.id))) == 1

@pytest.mark.parametrize('amount',[1,25,100001,-10])
def test_invalid_stakes(db, amount):
    u=user(db);row=service.get_round(db);db.commit()
    with pytest.raises(HTTPException) as err:service.place_bet(db,u,request(row,amount))
    assert err.value.status_code == 422
    db.rollback();assert u.lidya == 500000

@pytest.mark.parametrize('amount',[True,100.0,'100'])
def test_strict_integer_amount(amount):
    with pytest.raises(ValidationError):service.BetRequest(round_id='a',amount=amount,choice='rose',request_id=uuid4())

def test_low_balance_and_stale_round_never_charge(db):
    u=user(db,balance=10);row=service.get_round(db);db.commit()
    with pytest.raises(HTTPException):service.place_bet(db,u,request(row,100))
    db.rollback();assert u.lidya==10
    payload=request(row,10);payload.round_id='expired'
    with pytest.raises(HTTPException) as err:service.place_bet(db,u,payload)
    assert err.value.status_code==409
    db.rollback();assert u.lidya==10

def test_changed_retry_rejected(db):
    u=user(db);row=service.get_round(db);db.commit();p=request(row)
    service.place_bet(db,u,p);db.commit();p.choice='heart'
    with pytest.raises(HTTPException) as err:service.place_bet(db,u,p)
    assert err.value.status_code==409
    db.rollback();assert u.lidya==499900

@pytest.mark.parametrize('symbol', rules.SYMBOLS)
def test_settlement_credits_one_time_and_reports_server_payout(db,monkeypatch,symbol):
    u=user(db);row=service.get_round(db);db.commit()
    service.place_bet(db,u,request(row,100000,symbol));db.commit()
    row.ends_at=service.now()-timedelta(seconds=1);db.commit()
    monkeypatch.setattr(rules,'choose',lambda weights:symbol)
    service.finish(db,row);db.commit();before=u.lidya
    service.finish(db,row);db.commit()
    assert u.lidya==before==400000+100000*rules.MULTIPLIERS[symbol]
    assert service.response(db,row,u)['my_payout']==100000*rules.MULTIPLIERS[symbol]
    assert db.scalar(select(func.count(service.WheelSettlement.round_id)))==1

def test_closed_bet_window(db):
    u=user(db);row=service.get_round(db);row.ends_at=service.now()+timedelta(seconds=4);db.commit()
    with pytest.raises(HTTPException) as err:service.place_bet(db,u,request(row))
    assert err.value.status_code==409
    db.rollback();assert u.lidya==500000

def test_legacy_round_uses_old_weights_and_multipliers(db,monkeypatch):
    u=user(db);at=service.now()
    row=GameRound(id='legacy',game_type='wheel_live',status='open',started_at=at-timedelta(minutes=1),ends_at=at-timedelta(seconds=1),state_data='{}')
    db.add(row);db.flush();db.add(GameBet(round_id=row.id,user_id=u.id,choice='gift',amount=100,payout=0));db.commit()
    monkeypatch.setattr(rules,'choose',lambda weights:'gift')
    service.finish(db,row);db.commit();assert u.lidya==500400
    assert service.response(db,row,u)['multipliers']['gift']==4

@pytest.mark.parametrize('period,start,end',[
 ('hour','2026-10-14T14:00:00+00:00','2026-10-14T15:00:00+00:00'),
 ('day','2026-10-13T21:00:00+00:00','2026-10-14T21:00:00+00:00'),
 ('week','2026-10-11T21:00:00+00:00','2026-10-18T21:00:00+00:00'),
 ('month','2026-09-30T21:00:00+00:00','2026-10-31T21:00:00+00:00')])
def test_istanbul_calendar_windows(period,start,end):
    a,b=rules.period_bounds(period,datetime(2026,10,14,14,41,tzinfo=timezone.utc))
    assert a.isoformat()==start and b.isoformat()==end

def test_december_and_leap_month():
    assert rules.period_bounds('month',datetime(2026,12,15,tzinfo=timezone.utc))[1].isoformat()=='2026-12-31T21:00:00+00:00'
    a,b=rules.period_bounds('month',datetime(2028,2,10,tzinfo=timezone.utc));assert (b-a).days==29

def test_rank_top50_paid_only_with_frames_and_period_boundary(db,monkeypatch):
    at=datetime(2026,10,14,14,30,tzinfo=timezone.utc);bounds=rules.period_bounds
    monkeypatch.setattr(rules,'period_bounds',lambda p:bounds(p,at))
    viewer=user(db,'viewer');players=[user(db,str(i)) for i in range(60)]
    for i,u in enumerate(players):
        rid='win'+str(i);row=GameRound(id=rid,game_type='wheel_live',status='finished',started_at=at-timedelta(minutes=1),ends_at=at,result_key='rose',state_data='{}');db.add(row);db.flush()
        db.add(GameBet(round_id=rid,user_id=u.id,choice='rose',amount=10,payout=(i+1)*100))
    old=GameRound(id='old',game_type='wheel_live',status='finished',started_at=at-timedelta(hours=1),ends_at=at.replace(minute=0)-timedelta(seconds=1),result_key='jackpot',state_data='{}');db.add(old);db.flush();db.add(GameBet(round_id='old',user_id=viewer.id,choice='jackpot',amount=10,payout=600))
    pending=GameRound(id='pending',game_type='wheel_live',status='open',started_at=at,ends_at=at+timedelta(minutes=1),state_data='{}');db.add(pending);db.flush();db.add(GameBet(round_id='pending',user_id=viewer.id,choice='rose',amount=100,payout=500000))
    players[-1].frame_asset='frame.png';players[-1].avatar_asset='avatar.png';db.commit()
    result=service.leaderboard(db,viewer,'hour');assert len(result['items'])==50
    assert result['items'][0]['winnings']==6000
    assert result['items'][0]['frame_asset']=='frame.png'
    assert result['items'][0]['avatar_asset']=='avatar.png'
    assert result['items'][-1]['rank']==50
    assert result['my_winnings']==0
    assert service.leaderboard(db,viewer,'day')['my_winnings']==600

def test_actual_fastapi_wheel_handlers_validate_and_serialize(db):
    """Compile the exact route definitions from platform_routes, without unrelated app services."""
    import ast
    from fastapi import APIRouter, Depends, FastAPI, Query
    from fastapi.testclient import TestClient
    source=ast.parse((root/'backend/app/platform_routes.py').read_text())
    factory=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='register_platform_auth')
    names={'wheel_live_state','wheel_live_bet','wheel_leaderboard','wheel_records'}
    functions=[n for n in factory.body if isinstance(n,ast.FunctionDef) and n.name in names]
    assert len(functions)==4
    u=user(db)
    router=APIRouter(prefix='/v1')
    env=dict(router=router,Session=Session,User=User,Depends=Depends,Query=Query,
        get_db=lambda:db,current_user_dependency=lambda:u,wheel_live_v4=service,
        _get_wheel_live_round=lambda s:service.get_round(s),
        _wheel_live_response=lambda row,s,who:service.response(s,row,who))
    exec(compile(ast.Module(body=functions,type_ignores=[]),str(root/'backend/app/platform_routes.py'),'exec'),env)
    app=FastAPI();app.include_router(router)
    with TestClient(app) as client:
        x=client.get('/v1/games/wheel/live');assert x.status_code==200
        assert len(x.json()['symbols'])==8
        payload={'round_id':x.json()['round_id'],'request_id':str(uuid4()),'choice':'jackpot','amount':100000}
        result=client.post('/v1/games/wheel/live/bet',json=payload);assert result.status_code==200
        assert result.json()['balance']==400000
        again=client.post('/v1/games/wheel/live/bet',json=payload);assert again.json()['replayed']
        payload.update(request_id=str(uuid4()),amount='100')
        assert client.post('/v1/games/wheel/live/bet',json=payload).status_code==422
        assert client.get('/v1/games/wheel/leaderboard?period=invalid').status_code==422
        for period in rules.PERIODS:
            rank=client.get('/v1/games/wheel/leaderboard?period='+period)
            assert rank.status_code==200 and rank.json()['timezone']=='Europe/Istanbul'
        assert client.get('/v1/games/wheel/records').status_code==200
