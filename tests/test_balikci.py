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
    package=types.ModuleType('balikci_test_app');package.__path__=[];sys.modules['balikci_test_app']=package
    e=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(e);sessions=sessionmaker(bind=e,autoflush=False)
    def get_db():
        with sessions() as s:yield s
    for name,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
        m=types.ModuleType('balikci_test_app.'+name);m.__dict__.update(attrs);sys.modules[m.__name__]=m
    module('balikci_test_app.balikci_engine_v1',ROOT/'backend/app/balikci_engine_v1.py')
    module('balikci_test_app.slot_bonus_buy',ROOT/'backend/app/slot_bonus_buy.py')
    eng=module('balikci_test_app.balikci_engine',ROOT/'backend/app/balikci_engine.py');routes=module('balikci_test_app.balikci_routes',ROOT/'backend/app/balikci_routes.py')
    with sessions() as s:s.add_all([User(id='a',lidya=100000),User(id='b',lidya=5000)]);s.commit()
    identity={'id':'a'}
    def auth(db=Depends(get_db)):
        u=db.get(User,identity['id'])
        if identity.get('stale'):u.lidya=123456789
        return u
    app=FastAPI();app.include_router(routes.register_auth(auth));client=TestClient(app)
    yield client,sessions,routes,eng,identity
    e.dispose()

def post(c,**kw):return c.post('/v1/games/balikci/spin',json={'request_id':str(uuid4()),'stake':20,**kw})


def fixed(routes,engine,**overrides):
    native=engine.spin
    def play(**kw):
        out=native(**kw);out.update(overrides);return out
    routes.spin=play

def trigger(c,r,e,**kw):
    fixed(r,e,payoutHundredths=0,bonusSpins=10)
    return post(c,**kw).json()['state']

def test_rules_strict_validation(fixture):
    c,*_=fixture
    rules=c.get('/v1/games/balikci/rules').json()
    assert rules['name']=='Balıkçı Hasan' and len(rules['lines'])==10 and rules['max_win']==2100
    for kw in [{'stake':0},{'stake':10001},{'stake':True},{'stake':20.0},{'ante':False},{'sequence':False},{'action':'invalid'},{'payout':999},{'request_id':'not-a-uuid'}]:assert post(c,**kw).status_code==422

def test_wallet_paid_replay_and_fraction(fixture):
    c,s,r,e,_=fixture
    fixed(r,e,payoutHundredths=50,bonusSpins=0)
    payload={'request_id':str(uuid4()),'stake':1}
    a=c.post('/v1/games/balikci/spin',json=payload).json();b=c.post('/v1/games/balikci/spin',json=payload).json()
    assert a['charge']==1 and a['payout']==.5 and a['balance']==99999.5
    assert b['replayed'] and b['balance']==a['balance']
    with s() as db:assert r.fraction(db,'a')==50 and len(list(db.scalars(select(GamePlay))))==1
    d=post(c,stake=1).json();assert d['balance']==99999
    with s() as db:assert r.fraction(db,'a')==0

def test_bonus_resume_sequence_owner_and_old_receipt(fixture):
    c,s,r,e,identity=fixture
    state=trigger(c,r,e);rid=state['round_id']
    assert state['remaining']==10 and c.get('/v1/games/balikci/active').json()['state']['round_id']==rid
    assert post(c).status_code==409
    assert post(c,round_id=rid,sequence=0).status_code==409
    assert post(c,round_id=rid,sequence=1,stake=21).status_code==409
    identity['id']='b';assert post(c,round_id=rid,sequence=1).status_code==404;identity['id']='a'
    fixed(r,e,payoutHundredths=0,bonusSpins=0,extraSpins=0,collected=1)
    payload={'request_id':str(uuid4()),'round_id':rid,'sequence':1,'stake':20}
    a=c.post('/v1/games/balikci/spin',json=payload).json()
    b=post(c,round_id=rid,sequence=2).json()
    replay=c.post('/v1/games/balikci/spin',json=payload).json()
    assert a['charge']==b['charge']==0 and a['state']['remaining']==9
    assert replay['replayed'] and replay['balance']==b['balance']
    assert post(c,round_id=rid,sequence=1).status_code==409

def test_insufficient_funds_atomic_rollback_and_feature_gate(fixture):
    c,s,r,e,_=fixture
    with s() as db:u=db.get(User,'a');u.lidya=0;db.commit()
    assert post(c).status_code==400
    with s() as db:assert not list(db.scalars(select(GameRound)))
    with s() as db:u=db.get(User,'a');u.lidya=1000;db.commit()
    r.spin=lambda **kw:(_ for _ in ()).throw(RuntimeError('RNG failure'))
    with pytest.raises(RuntimeError):post(c)
    with s() as db:assert db.get(User,'a').lidya==1000 and not list(db.scalars(select(GameRound)))
    r.require_feature=lambda *_:(_ for _ in ()).throw(HTTPException(403,'restricted'))
    assert post(c).status_code==403

def test_total_cap_finishes_bonus(fixture):
    c,s,r,e,_=fixture
    state=trigger(c,r,e)
    fixed(r,e,payoutHundredths=e.CAP,capped=True,collected=12,extraSpins=10)
    a=post(c,round_id=state['round_id'],sequence=1).json()
    assert a['payout']==20*2100 and a['state']['finished'] and a['state']['remaining']==0
    assert c.get('/v1/games/balikci/active').json()['state'] is None
    assert post(c,round_id=state['round_id'],sequence=2).status_code==409
    with s() as db:assert db.scalar(select(GameBet)).payout==20*2100

def test_shared_dede_wallet_and_stale_auth(fixture):
    c,s,r,e,identity=fixture
    from datetime import datetime,timezone
    with s() as db:
        now=datetime.now(timezone.utc);db.add(GameRound(id=r.wallet_id('a'),user_id='a',game_type='dede_wallet',status='ledger',started_at=now,ends_at=now,result_key='fraction',state_data='{"remainder":25}'));db.commit()
    fixed(r,e,payoutHundredths=0,bonusSpins=0)
    identity['stale']=True
    a=post(c,stake=1).json();assert a['balance']==99999.25
    with s() as db:assert db.get(User,'a').lidya==99999 and r.fraction(db,'a')==25

def background():return [{'s':(i%5)+i//5} for i in range(15)]

def test_payline_left_to_right_and_wild_best_only(fixture):
    c,s,r,e,_=fixture
    for symbol in range(10):
        for count in (3,4,5):
            board=background()
            for col in range(count):board[5+col]={'s':symbol,'v':2}
            if count<5:board[5+count]={'s':10}
            _,wins=e.evaluate(board)
            line=next(w for w in wins if w['line']==1)
            assert line['payHundredths']==e.PAY[symbol][count-3]
    board=background()
    for i in [7,8,9]:board[i]={'s':8}
    board[5]={'s':10}
    assert not any(w['line']==1 for w in e.evaluate(board)[1])
    board=background()
    for i in [5,6,7,8,9]:board[i]={'s':11}
    wins=[w for w in e.evaluate(board)[1] if w['line']==1]
    assert len(wins)==1 and wins[0]['payHundredths']==20000

def test_collection_each_fisherman_stage_and_no_fish_meter(fixture):
    c,s,r,e,_=fixture
    import random
    board=background();board[0]={'s':11};board[4]={'s':11};board[12]={'s':9,'v':5};board[13]={'s':9,'v':20}
    x=e.spin(bonus=True,collected=3,forced_board=board,rng=random.Random(1).random)
    assert x['collectionHundredths']==25*2*100 and x['multiplier']==1
    assert x['collected']==5 and x['nextMultiplier']==2 and x['extraSpins']==10 and x['thresholds']==[4]
    x=e.spin(bonus=True,collected=11,forced_board=board,rng=random.Random(1).random)
    assert x['multiplier']==3 and x['collectionHundredths']==25*2*3*100
    assert x['collected']==12 and x['nextMultiplier']==10 and x['extraSpins']==10
    x=e.spin(bonus=True,collected=12,forced_board=board,rng=random.Random(1).random)
    assert x['collectionHundredths']==25*2*10*100 and x['extraSpins']==0
    # No fish still advances the meter; disable dynamite to isolate this rule.
    board=background();board[0]={'s':11}
    x=e.spin(bonus=True,collected=3,forced_board=board,config={**e.CONFIG,'dynamiteChance':0},rng=random.Random(1).random)
    assert x['collectionHundredths']==0 and x['extraSpins']==10 and x['collected']==4

def test_dynamite_guard_and_values(fixture):
    c,s,r,e,_=fixture
    import random
    board=background();board[0]={'s':11}
    x=e.spin(bonus=True,forced_board=board,config={**e.CONFIG,'dynamiteChance':1},rng=random.Random(4).random)
    assert 1<=len(x['dynamite'])<=3 and all(x['board'][i]['s']==9 and x['board'][i]['v']>=10 for i in x['dynamite'])
    assert x['collectionHundredths']==x['fishSum']*100
    assert x['lineHundredths']==e.evaluate(x['initialBoard'])[0]
    board[4]={'s':9,'v':2}
    assert not e.spin(bonus=True,forced_board=board,config={**e.CONFIG,'dynamiteChance':1})['dynamite']
    board=background()
    assert not e.spin(bonus=True,forced_board=board,config={**e.CONFIG,'dynamiteChance':1})['dynamite']

def test_scatter_and_fish_base_no_collect(fixture):
    c,s,r,e,_=fixture
    import random
    for count,award in [(2,0),(3,10),(4,15),(5,20)]:
        board=background()
        for i in range(count):board[i]={'s':10}
        board[14]={'s':9,'v':2000}
        x=e.spin(forced_board=board,rng=random.Random(3).random)
        assert x['bonusSpins']==award and x['collectionHundredths']==0
    assert sum(e.CONFIG['scatters'][3:])/sum(e.CONFIG['scatters'])==1/113
    for seed in range(100):
        x=e.spin(rng=random.Random(seed).random)
        assert not x['fishermen'] and all(c['s']!=11 for c in x['board'])
        x=e.spin(bonus=True,rng=random.Random(seed).random)
        assert x['payoutHundredths']==min(e.CAP,x['lineHundredths']+x['collectionHundredths'])

def test_all_thresholds_crossed_once(fixture):
    c,s,r,e,_=fixture
    import random
    board=background()
    for i in range(10):board[i]={'s':11}
    x=e.spin(bonus=True,collected=3,forced_board=board,rng=random.Random(7).random)
    assert x['thresholds']==[4,8,12] and x['extraSpins']==30 and x['collected']==12

def test_fixed_reel_wrap_and_actual_animation_windows(fixture):
    c,s,r,e,_=fixture
    cfg={**e.CONFIG,'baseReels':[list(range(10))*3 for _ in range(5)],'scatters':[1,0,0,0,0,0]}
    x=e.spin(config=cfg,rng=lambda:.99)
    assert x['reelStops']==[29]*5
    assert [c['s'] for c in x['board']]==[9]*5+[0]*5+[1]*5
    for col in range(5):
        assert x['reelWindows'][col][-3:]==[x['initialBoard'][row*5+col] for row in range(3)]
        assert len(x['reelWindows'][col])==15

def test_distinct_special_reels_and_symbol_contract(fixture):
    c,s,r,e,_=fixture
    import random
    for seed in range(100):
        base=e.spin(config={**e.CONFIG,'scatters':[0,0,0,1,0,0]},rng=random.Random(seed).random)
        positions=[i for i,cell in enumerate(base['board']) if cell['s']==10]
        assert len(positions)==3 and len({i%5 for i in positions})==3
        bonus=e.spin(bonus=True,config={**e.CONFIG,'wildCounts':[0,0,0,0,1]},rng=random.Random(seed).random)
        assert len(bonus['fishermen'])==4 and len({i%5 for i in bonus['fishermen']})==4
        assert all(bonus['board'][i]['s']==11 for i in bonus['fishermen'])
    assert c.get('/v1/games/balikci/rules').json()['symbolRoles']=={'moneyFish':9,'bonusFish':10,'hasan':11}

def test_evaluate_matches_bruteforce_all_symbols(fixture):
    c,s,r,e,_=fixture
    import random
    rng=random.Random(391)
    for _ in range(1000):
        board=[{'s':rng.randrange(12)} for _ in range(15)];expected=[]
        for i,line in enumerate(e.LINES):
            indices=[line[col]*5+col for col in range(5)];pays=[]
            for symbol in range(10):
                count=0
                for index in indices:
                    if board[index]['s'] in (symbol,11):count+=1
                    else:break
                if count>=3:pays.append(e.PAY[symbol][count-3])
            if pays:expected.append((i+1,max(pays)))
        got=e.evaluate(board)
        assert [(w['line'],w['payHundredths']) for w in got[1]]==expected
        assert got[0]==sum(p for _,p in expected)

def test_legacy_bonus_dispatch_is_bit_exact(fixture):
    c,s,r,e,_=fixture
    import random,sys
    le=sys.modules['balikci_test_app.balikci_engine_v1']
    for seed in range(50):
        a=e.spin(bonus=True,collected=4,rng=random.Random(seed).random,model_version='lidya-balikci-v1')
        b=le.spin(bonus=True,collected=4,rng=random.Random(seed).random)
        assert a==b
    with pytest.raises(ValueError):e.spin(model_version='unsupported-v99')

def test_active_legacy_bonus_keeps_paytable_and_wallet(fixture):
    c,s,r,e,_=fixture
    state=trigger(c,r,e)
    with s() as db:
        row=db.get(GameRound,state['round_id']);v=json.loads(row.state_data);v['version']='lidya-balikci-v1';v['remaining']=1;row.state_data=json.dumps(v);db.commit()
    assert c.get('/v1/games/balikci/rules').json()['paytable'][0][0]==.5
    assert c.get('/v1/games/balikci/rules').json()['legacy']
    seen=[]
    def play(**kw):
        seen.append(kw.get('model_version'));return e.spin(**kw,forced_board=background())
    r.spin=play
    a=post(c,round_id=state['round_id'],sequence=1).json()
    assert seen==['lidya-balikci-v1'] and a['state']['version']=='lidya-balikci-v1' and a['state']['finished']
    assert a['charge']==0
    assert c.get('/v1/games/balikci/rules').json()['paytable'][0][0]==.2
    assert not c.get('/v1/games/balikci/rules').json()['legacy']

def test_money_and_bonus_fish_never_fill_hasan_meter(fixture):
    c,s,r,e,_=fixture
    import random
    for symbol in [9,10]:
        board=background()
        for i in range(4):board[i]={'s':symbol,'v':5}
        x=e.spin(bonus=True,collected=3,forced_board=board,rng=random.Random(9).random)
        assert x['collected']==3 and x['fishermen']==[] and x['extraSpins']==0 and x['collectionHundredths']==0
    board=background();board[0]={'s':11};board[14]={'s':9,'v':2}
    x=e.spin(bonus=True,collected=3,forced_board=board,rng=random.Random(9).random)
    assert len(x['fishermen'])==1 and x['collected']==4 and x['extraSpins']==10


def test_bonus_buy_exact_charge_and_resume(fixture):
 c,s,r,e,identity=fixture
 path='/v1/games/balikci/spin';payload={'request_id':str(uuid4()),'stake':50,'action':'buy'}
 first=c.post(path,json=payload);assert first.status_code==200,first.text
 a=first.json();assert a['charge']==5000 and a['payout']==0 and a['balance']==95000 and not a['state']['finished']
 assert c.post(path,json=payload).json()['replayed']
 with s() as db:assert db.get(User,'a').lidya==95000 and db.scalar(select(GameBet)).choice=='buy'
 assert post(c,action='buy').status_code==409
 assert post(c,action='buy',round_id=a['state']['round_id'],sequence=a['state']['sequence'],stake=50).status_code==409
 resumed=post(c,round_id=a['state']['round_id'],sequence=a['state']['sequence'],stake=50).json();assert resumed['charge']==0
 replay=c.post(path,json=payload).json();assert replay['replayed'] and replay['balance']==resumed['balance']
 if 'collected' in a['state']:assert a['state']['remaining']==10 and a['state']['collected']==0 and a['state']['multiplier']==1
 else:assert len(a['result']['wheel'])==9 and a['state']['remaining']==sum(a['result']['wheel']) and a['state']['sticky']=={}

def test_buy_insufficient_balance_and_payload_injection(fixture):
 c,s,r,e,_=fixture
 with s() as db:u=db.get(User,'a');u.lidya=200;db.commit()
 assert post(c,action='buy').status_code==400
 with s() as db:assert db.get(User,'a').lidya==200 and not list(db.scalars(select(GameBet)))
 for override in [{'price':1},{'free_spins':27},{'buy_profile':'hack'}]:assert post(c,action='buy',**override).status_code==422

def test_buy_rng_failure_rollback(fixture):
 c,s,r,e,_=fixture;r.purchase=lambda *_:(_ for _ in ()).throw(RuntimeError('purchase test'))
 with pytest.raises(RuntimeError):post(c,action='buy')
 with s() as db:assert db.get(User,'a').lidya==100000 and not list(db.scalars(select(GameBet)))

def test_purchased_hasan_uses_separate_profile(fixture):
 c,s,r,e,_=fixture;a=post(c,action='buy').json()['state'];calls=[];native=e.spin
 def capture(**kw):calls.append(kw.get('config'));return native(**kw)
 e.spin=capture
 assert post(c,round_id=a['round_id'],sequence=a['sequence']).status_code==200
 assert calls[-1]['wildCounts']==[6900,2750,300,48,2] and e.CONFIG['wildCounts']==[7500,2150,300,48,2]
