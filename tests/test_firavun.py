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
    package=types.ModuleType('firavun_test_app');package.__path__=[];sys.modules['firavun_test_app']=package
    e=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(e);sessions=sessionmaker(bind=e,autoflush=False)
    def get_db():
        with sessions() as s:yield s
    for name,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
        m=types.ModuleType('firavun_test_app.'+name);m.__dict__.update(attrs);sys.modules[m.__name__]=m
    eng=module('firavun_test_app.firavun_engine',ROOT/'backend/app/firavun_engine.py');routes=module('firavun_test_app.firavun_routes',ROOT/'backend/app/firavun_routes.py')
    with sessions() as s:s.add_all([User(id='a',lidya=100000),User(id='b',lidya=5000)]);s.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):
        u=db.get(User,identity['id'])
        if identity.get('stale'):u.lidya=123456789
        return u
    app=FastAPI();app.include_router(routes.register_auth(auth));client=TestClient(app)
    yield client,sessions,routes,eng,identity
    e.dispose()

def post(c,**kw):return c.post('/v1/games/firavun/spin',json={'request_id':str(uuid4()),'stake':20,**kw})



def quiet():return [{'s':(i+i//5)%5} for i in range(15)]
def fake(**kw):return {'board':quiet(),'expandedBoard':quiet(),'lineWins':[],'lineHundredths':0,'scatterHundredths':0,'expansionHundredths':0,'expandColumns':[],'special':kw.get('special'),'books':0,'bonusSpins':0,'extraSpins':0,'payoutHundredths':0,'capped':False,'reelWindows':[]}

def test_rules_and_validation(fixture):
 c,s,r,e,_=fixture;rules=c.get('/v1/games/firavun/rules').json()
 assert rules['buy_spins']==10 and rules['max_win']==5000 and rules['bonus_cost']==100
 assert len(rules['lines'])==10 and len(set(tuple(l) for l in rules['lines']))==10
 for kw in [{'stake':0},{'stake':10001},{'stake':True},{'stake':1.5},{'sequence':False},{'action':'bad'},{'special':8},{'board':[]},{'payout':999},{'request_id':'invalid'}]:assert post(c,**kw).status_code==422

def test_book_substitution_best_pay_once(fixture):
 *_,e,_=fixture
 board=quiet();board[:5]=[{'s':9},{'s':0},{'s':0},{'s':1},{'s':2}]
 _,wins=e.evaluate(board);win=next(w for w in wins if w['line']==2)
 assert win['symbol']=='ten' and win['count']==3 and win['payHundredths']==50
 board[:5]=[{'s':9} for _ in range(5)]
 _,wins=e.evaluate(board);win=next(w for w in wins if w['line']==2)
 assert win['symbol']=='explorer' and win['payHundredths']==50000
 assert sum(w['line']==2 for w in wins)==1

def test_normal_lines_need_left_start(fixture):
 *_,e,_=fixture
 board=quiet();board[:5]=[{'s':0},{'s':1},{'s':8},{'s':8},{'s':8}]
 _,wins=e.evaluate(board);assert not any(w['line']==2 for w in wins)

@pytest.mark.parametrize('count,pay',[(3,200),(4,2000),(5,20000)])
def test_scatter_and_bonus_mapping(fixture,count,pay):
 *_,e,_=fixture
 board=quiet()
 for i in range(count):board[i]={'s':9}
 result=e.spin(forced_board=board)
 assert result['scatterHundredths']==pay and result['bonusSpins']==10
 assert result['payoutHundredths']==min(e.CAP,result['lineHundredths']+pay)

def test_expands_disjoint_reels_and_all_lines(fixture):
 *_,e,_=fixture
 board=[{'s':1} for _ in range(15)]
 for i in [0,2,4]:board[i]={'s':0}
 pay,columns,expanded=e.expand(board,0)
 assert columns==[0,2,4] and pay==500
 assert all(expanded[row*5+col]['s']==0 for row in range(3) for col in columns)
 assert expanded[1]==board[1] and expanded[3]==board[3]

def test_distinct_reels_not_duplicate_cells_or_wild(fixture):
 *_,e,_=fixture
 board=[{'s':1} for _ in range(15)]
 for i in [0,5,10]:board[i]={'s':0}
 assert e.expand(board,0)[1]==[]
 board[2]={'s':0};board[4]={'s':9}
 assert e.expand(board,0)[1]==[]
 board[4]={'s':0};assert e.expand(board,0)[1]==[0,2,4]
 board=[{'s':0} for _ in range(15)];board[0]={'s':5};board[4]={'s':5}
 assert e.expand(board,5)[0]==500 and e.expand(board,5)[1]==[0,4]

def test_three_phases_sum_and_retrigger(fixture):
 *_,e,_=fixture
 board=quiet()
 for i in [0,2,4]:board[i]={'s':5}
 for i in [5,6,7]:board[i]={'s':9}
 result=e.spin(bonus=True,special=5,forced_board=board)
 assert result['extraSpins']==10 and result['bonusSpins']==0 and result['special']==5
 assert result['payoutHundredths']==min(e.CAP,result['lineHundredths']+result['scatterHundredths']+result['expansionHundredths'])
 assert result['expansionHundredths']==2500 and result['books']==3
 # Book counted before expansion can overwrite it in a selected reel.
 assert result['expandedBoard'][5]['s']==5 and result['board'][5]['s']==9

def test_cap_all_phases(fixture):
 *_,e,_=fixture
 result=e.spin(bonus=True,special=8,forced_board=[{'s':8} for _ in range(15)])
 assert result['expansionHundredths']==500000 and result['payoutHundredths']==500000 and result['capped']
 with pytest.raises(ValueError):e.spin(bonus=True,special=9)
 with pytest.raises(ValueError):e.spin(forced_board=[])

def test_buy_resume_locked_symbol_and_late_duplicate(fixture):
 c,s,r,e,identity=fixture;r.choose_special=lambda:8;r.spin=fake
 payload={'request_id':str(uuid4()),'stake':20,'action':'buy'}
 first=c.post('/v1/games/firavun/spin',json=payload).json();state=first['state'];rid=state['round_id']
 assert first['charge']==2000 and first['payout']==0 and first['balance']==98000 and state['remaining']==10 and state['special']==8
 assert c.get('/v1/games/firavun/active').json()['state']['special']==8
 assert post(c).status_code==409 and post(c,round_id=rid,sequence=0).status_code==409 and post(c,round_id=rid,sequence=1,stake=40).status_code==409
 identity['id']='b';assert post(c,round_id=rid,sequence=1).status_code==404;identity['id']='a'
 nextspin=post(c,round_id=rid,sequence=1).json();assert nextspin['charge']==0 and nextspin['state']['remaining']==9 and nextspin['state']['special']==8
 r.choose_special=lambda:0;r.spin=lambda **kw:{**fake(**kw),'extraSpins':10,'books':3}
 retrigger=post(c,round_id=rid,sequence=2).json();assert retrigger['state']['remaining']==18 and retrigger['state']['special']==8
 replay=c.post('/v1/games/firavun/spin',json=payload).json();assert replay['replayed'] and replay['balance']==retrigger['balance']
 with s() as db:assert len(list(db.scalars(select(GameBet))))==1

def test_natural_bonus_selects_once(fixture):
 c,s,r,e,_=fixture;r.choose_special=lambda:6;r.spin=lambda **kw:{**fake(**kw),'bonusSpins':10,'payoutHundredths':200}
 a=post(c).json();assert a['payout']==40 and a['state']['special']==6 and a['state']['remaining']==10
 r.choose_special=lambda:1;r.spin=fake
 b=post(c,round_id=a['state']['round_id'],sequence=1).json();assert b['state']['special']==6 and b['state']['remaining']==9

def test_cap_ends_bonus_and_bet(fixture):
 c,s,r,e,_=fixture;a=post(c,action='buy').json();r.spin=lambda **kw:{**fake(**kw),'payoutHundredths':500000,'capped':True,'extraSpins':10}
 b=post(c,round_id=a['state']['round_id'],sequence=1).json();assert b['payout']==100000 and b['state']['finished'] and b['state']['remaining']==0
 with s() as db:assert db.scalar(select(GameBet)).payout==100000

def test_rng_failure_and_funds(fixture):
 c,s,r,e,identity=fixture;r.spin=lambda **kw:(_ for _ in ()).throw(RuntimeError('rng'))
 with pytest.raises(RuntimeError):post(c)
 with s() as db:assert db.get(User,'a').lidya==100000 and not list(db.scalars(select(GameRound)))
 identity['id']='b';assert post(c,action='buy',stake=100).status_code==400

def test_fractional_ledger(fixture):
 c,s,r,e,_=fixture
 from datetime import datetime
 with s() as db:
  db.add(GameRound(id=r.wallet_id('a'),user_id='a',game_type='dede_wallet',status='ledger',started_at=datetime.now(),ends_at=datetime.now(),result_key='fraction',state_data='{"remainder":75}'));db.commit()
 r.spin=lambda **kw:{**fake(),'payoutHundredths':25}
 a=post(c,stake=1).json();assert a['balance']==100000 and a['payout']==.25

def test_purchase_profile_is_server_owned(fixture):
 c,s,r,e,_=fixture;seen=[]
 def capture(**kw):seen.append(kw.get('purchased'));return fake(**kw)
 r.spin=capture
 a=post(c,action='buy').json();post(c,round_id=a['state']['round_id'],sequence=1)
 assert seen==[True]
 assert post(c,round_id=a['state']['round_id'],sequence=2,purchased=False).status_code==422
 assert e.CONFIG['bonusReels']!=e.CONFIG['buyBonusReels']
