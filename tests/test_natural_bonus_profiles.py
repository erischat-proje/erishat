"""Natural-entry profiles, immutable old bonuses and atomic API settlement."""
import copy,hashlib,importlib,importlib.util,json,random,sys,types
from pathlib import Path
from uuid import uuid4
import pytest
from fastapi import Depends,FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine,select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from test_balikci import Base,User,GameRound,GameBet,GamePlay
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.app import natural_bonus as n
GAMES=['dede','prenses','seker','balikci','dogparty','candy','kovboy','bastet','kure','firavun']

@pytest.fixture(params=GAMES+['ares'])
def api(request,monkeypatch):
 game=request.param;name='natural_api_'+game+'_'+uuid4().hex;pkg=types.ModuleType(name);pkg.__path__=[str(ROOT/'backend/app')];monkeypatch.setitem(sys.modules,name,pkg)
 engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool);Base.metadata.create_all(engine);sessions=sessionmaker(bind=engine,autoflush=False)
 def get_db():
  with sessions() as db:yield db
 for suffix,attrs in [('db',{'get_db':get_db}),('models',{'User':User}),('platform_models',{'GameRound':GameRound,'GameBet':GameBet,'GamePlay':GamePlay}),('moderation',{'require_feature':lambda *_:None})]:
  mod=types.ModuleType(name+'.'+suffix);mod.__dict__.update(attrs);monkeypatch.setitem(sys.modules,mod.__name__,mod)
 route=importlib.import_module(name+'.'+('aztek_ares' if game=='ares' else game)+'_routes');original=route.spin
 if game=='ares':original=importlib.import_module(name+'.aztek_ares_v2').spin
 calls=[]
 def spin(*args,**kwargs):
  calls.append(copy.deepcopy(kwargs));kwargs.update(rng=random.Random(26101599+len(calls)).random,trace=False);return original(*args,**kwargs)
 monkeypatch.setattr(route,'spin',spin)
 with sessions() as db:db.add(User(id='a',lidya=1000000));db.commit()
 def auth(db=Depends(get_db)):return db.get(User,'a')
 app=FastAPI();app.include_router(route.register_auth(auth))
 yield game,TestClient(app),sessions,route,calls
 engine.dispose()


def post(game,client,**kw):
 body={'request_id':str(uuid4()),'stake':1,**kw};return client.post('/v1/games/'+game+'/spin',json=body)


def force_entry(game,cfg):
 cfg=copy.deepcopy(cfg)
 if game in ('seker','balikci'):cfg['scatters']=[0]*(4 if game=='seker' else 3)+[1]+[0]*(2 if game=='seker' else 2)
 elif game=='ares':cfg['aresScatterThreshold']=10000
 elif game=='kure':cfg.update(scatterRate=1,baseScatterCountWeights=[0,0,1,0,0,0])
 else:cfg['bonusTrigger']=1;cfg['anteBonusTrigger']=1
 return cfg


def test_new_natural_profile_persists_and_replay_never_redraws(api,monkeypatch):
 game,c,s,r,calls=api;orig=r.entry_config;monkeypatch.setattr(r,'entry_config',lambda g:force_entry(g,orig(g)))
 first=post(game,c);assert first.status_code==200,first.text;a=first.json();state=a['state'];assert state['remaining']>0;assert state['natural_profile']==n.PROFILE
 request={'request_id':str(uuid4()),'round_id':state['round_id'],'sequence':state['sequence'],'stake':1}
 before=len(calls);second=c.post('/v1/games/'+game+'/spin',json=request);assert second.status_code==200,second.text;b=second.json();assert b['charge']==0;assert b['state']['natural_profile']==n.PROFILE
 assert len(calls)==before+1;assert calls[-1]['config']['naturalRewardFactor']>0
 again=c.post('/v1/games/'+game+'/spin',json=request);assert again.status_code==200;assert again.json()['replayed'];assert again.json()['payout']==b['payout'];assert len(calls)==before+1
 with s() as db:
  row=db.get(GameRound,state['round_id']);saved=json.loads(row.state_data);assert saved['natural_profile']==n.PROFILE
  assert len(list(db.scalars(select(GameBet))))==1
  assert db.get(User,'a').lidya==int(b['balance'])
 # Reloaded API reads the same locked profile and shared fractional wallet.
 active=c.get('/v1/games/'+game+'/active').json();assert active['balance']==b['balance']


def test_purchase_and_old_open_bonus_keep_original_profile(api):
 game,c,s,r,calls=api
 first=post(game,c,action='buy');assert first.status_code==200,first.text;a=first.json();state=a['state'];assert state['natural_profile'] is None;assert a['charge']==100
 # This also models an already-open natural bonus from before this update.
 with s() as db:
  row=db.get(GameRound,state['round_id']);saved=json.loads(row.state_data);assert 'natural_profile' not in saved
  if game not in ('dede','prenses','candy'):saved['entry']='spin'
  row.state_data=json.dumps(saved);db.commit()
 second=post(game,c,round_id=state['round_id'],sequence=state['sequence']);assert second.status_code==200,second.text
 assert second.json()['charge']==0;assert second.json()['state']['natural_profile'] is None
 assert 'naturalRewardFactor' not in calls[-1].get('config',{})


def test_client_cannot_select_profile_or_reward(api):
 game,c,s,_,_=api
 for key,value in [('natural_profile',n.PROFILE),('reward_factor',100),('config',{'bonusTrigger':1})]:assert post(game,c,**{key:value}).status_code==422
 with s() as db:assert db.get(User,'a').lidya==1000000


@pytest.mark.parametrize('game',GAMES+['aztek','ares'])
def test_old_and_bought_engine_outputs_are_bit_exact(game):
 fixture=json.loads((ROOT/'tests/natural-bonus-legacy-fixture.json').read_text());engine=n._engine(game)
 for case in fixture[game]['cases']:
  kw=copy.deepcopy(case['kwargs']);kw.update(rng=random.Random(case['seed']).random,trace=True)
  result=engine.spin(game,**kw) if game in ('aztek','ares') else engine.spin(**kw)
  digest=hashlib.sha256(json.dumps(result,sort_keys=True,separators=(',',':')).encode()).hexdigest()
  assert digest==case['sha256'],(game,case['kwargs'],case['seed'])


def test_rates_preserve_ante_advantage_and_never_change_active_profiles():
 for game in GAMES:
  state={};n.start(state,game,'spin');assert state['natural_profile']==n.PROFILE
  old=n.bonus_config(game,{});new=n.bonus_config(game,state);assert old==n._engine(game).CONFIG;assert 'naturalRewardFactor' not in old;assert new['naturalRewardFactor']>0
  bought={};n.start(bought,game,'buy');assert not bought
  cfg=n.entry_config(game);assert cfg['version']==old['version'];rules=n.rules(game);assert .008<=rules['probability']<=.012
  if rules['ante_probability']:assert rules['ante_probability']>rules['probability']
