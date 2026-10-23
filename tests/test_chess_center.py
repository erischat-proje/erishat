"""Chess transactions, permissions, clock settlement and tournament lifecycle."""
import os,sys,json
from pathlib import Path
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
import pytest
from sqlalchemy import create_engine,select,event
from sqlalchemy.orm import Session
from fastapi import FastAPI,HTTPException
from fastapi.testclient import TestClient
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'));os.environ.setdefault('DATABASE_URL','sqlite://')
from app.db import Base,get_db
from app.admin_models import AdminRole
from app.models import User
from app.platform_models import UserBlock
from app.chess_models import ChessGate,ChessPlayer,ChessMatch,ChessCommand,ChessTournament,ChessEntry
from app import chess_routes as c
from app.chess_vendor import Game
from app.chess_rules import san_move,position_key,insufficient,repetitions,pgn
app=FastAPI()
def auth(db,authorization,request):
 u=db.get(User,(authorization or '').removeprefix('Bearer '))
 if not u:raise HTTPException(401,'Oturum gerekli')
 return u
c.register(auth);app.include_router(c.router)
@pytest.fixture
def env(tmp_path):
 engine=create_engine('sqlite:///'+str(tmp_path/'chess.db'),connect_args={'check_same_thread':False,'timeout':20})
 @event.listens_for(engine,'connect')
 def fk(conn,_):conn.execute('PRAGMA foreign_keys=ON')
 Base.metadata.create_all(engine,tables=[x.__table__ for x in (AdminRole,User,UserBlock,ChessGate,ChessPlayer,ChessMatch,ChessCommand,ChessTournament,ChessEntry)])
 def dbs():
  with Session(engine,expire_on_commit=False,autoflush=False) as db:yield db
 app.dependency_overrides[get_db]=dbs
 with Session(engine) as db:
  db.add_all([User(id=str(i),public_id='ID'+str(i),_nickname=('Oyuncu '+str(i)),_avatar='♔',lidya=1000,is_active=True) for i in range(40)]);db.commit()
 with TestClient(app) as client:yield client,engine
 app.dependency_overrides.clear();engine.dispose()
def req(env,uid,method,path,data=None):
 return env[0].request(method,'/v1/chess'+path,headers={'Authorization':'Bearer '+str(uid)},**({'json':data} if data is not None else {}))
def ok(r):assert r.status_code==200,r.text;return r.json()
def live(env,rated=True):
 ok(req(env,0,'POST','/queue',{'preset':'5+3','rated':rated}))
 return ok(req(env,1,'POST','/queue',{'preset':'5+3','rated':rated}))['match']
def mv(env,m,uci,key=None,who=None):
 uid=who if who is not None else m['white']['id'] if m['turn']=='w' else m['black']['id']
 return req(env,uid,'POST','/matches/'+m['id']+'/move',{'uci':uci,'revision':m['revision'],'key':key or ('cmd_'+str(m['revision'])+'_'+uci)})
def act(env,m,uid,a):return req(env,uid,'POST','/matches/'+m['id']+'/action',{'action':a})
def tournament(env,n=4,rounds=3):
 t=ok(req(env,0,'POST','/tournaments',{'name':'Akşam satrancı','rounds':rounds,'capacity':32,'preset':'3+2','starts_in_minutes':10}))
 for uid in range(1,n):ok(req(env,uid,'POST','/tournaments/'+t['id']+'/action',{'action':'join'}))
 return ok(req(env,0,'POST','/tournaments/'+t['id']+'/action',{'action':'start'}))

def test_auth_privacy_input_and_wallet(env):
 assert req(env,'missing','GET','/hub').status_code==401
 m=live(env)
 assert req(env,2,'GET','/matches/'+m['id']).status_code==403
 assert mv(env,m,'e2e4',who=2).status_code==403
 assert ok(req(env,2,'POST','/practice',{'fen':'arbitrary'}))['fen']==Game.default_fen # arbitrary client FEN cannot override the initial board
 assert req(env,3,'POST','/queue',{'preset':'1+0'}).status_code==422
 assert req(env,3,'POST','/invite',{'public_id':'ID0','rated':False,'hack':1}).status_code==422
 with Session(env[1]) as db:assert all(u.lidya==1000 for u in db.scalars(select(User)))

def test_live_moves_turn_clock_increment_idempotence_and_stale(env):
 m=live(env);white=m['white']['id'];black=m['black']['id']
 assert mv(env,m,'e2e5').status_code==422
 assert mv(env,m,'e2e4',who=black).status_code==403
 with Session(env[1]) as db:
  row=db.get(ChessMatch,m['id']);row.tick_at=c.now()-timedelta(seconds=10);db.commit()
 first=ok(mv(env,m,'e2e4',key='same-command-123'));assert 291000<first['white_ms']<294000
 assert first['moves'][0]['san']=='e4' and first['turn']=='b'
 second=ok(mv(env,m,'e2e4',key='same-command-123'));assert len(second['moves'])==1
 assert mv(env,m,'d2d4',key='same-command-123').status_code==409
 assert mv(env,m,'e7e5',who=black).status_code==409
 m=ok(mv(env,first,'e7e5'));assert len(m['moves'])==2
 with Session(env[1]) as db:assert db.scalar(select(c.func.count()).select_from(ChessCommand))==2

def test_checkmate_elo_history_and_duplicate_finish(env):
 m=live(env)
 for uci in ['f2f3','e7e5','g2g4','d8h4']:m=ok(mv(env,m,uci))
 assert m['status']=='finished' and m['result']=='0-1' and m['reason']=='checkmate' and m['moves'][-1]['san']=='Qh4#'
 assert m['rating_delta']=={'white':-16,'black':16}
 assert act(env,m,m['white']['id'],'resign').status_code==409
 h=ok(req(env,0,'GET','/history'));assert h['items'][0]['id']==m['id']
 board=ok(req(env,0,'GET','/leaderboard'))['items'];assert [x['rating'] for x in board]==[1216,1184]
 assert '[Result "0-1"]' in m['pgn'] and '2. g4 Qh4# 0-1' in m['pgn']
 with Session(env[1]) as db:
  assert db.get(ChessPlayer,m['black']['id']).wins==1
  assert all(u.lidya==1000 for u in db.scalars(select(User)))

def test_timeout_persists_even_when_late_move_rejected_and_new_match_allowed(env):
 m=live(env)
 with Session(env[1]) as db:
  row=db.get(ChessMatch,m['id']);row.tick_at=c.now()-timedelta(minutes=6);db.commit()
 assert mv(env,m,'e2e4').status_code==409
 finished=ok(req(env,0,'GET','/matches/'+m['id']));assert finished['reason']=='timeout' and finished['white_ms']==0
 assert ok(req(env,0,'POST','/practice'))['status']=='active'

def test_offer_draw_accept_own_offer_and_claim(env):
 m=live(env);w=m['white']['id'];b=m['black']['id']
 assert act(env,m,w,'claim_draw').status_code==422
 m=ok(act(env,m,w,'offer_draw'));assert act(env,m,w,'accept_draw').status_code==409
 m=ok(act(env,m,b,'decline_draw'));assert m['draw_by'] is None
 m=ok(act(env,m,w,'offer_draw'));m=ok(act(env,m,b,'accept_draw'));assert m['result']=='1/2-1/2'
 assert m['rating_delta']=={'white':0,'black':0}

def test_threefold_claim_and_fivefold_automatic(env):
 m=live(env)
 for _ in range(2):
  for uci in ['g1f3','g8f6','f3g1','f6g8']:m=ok(mv(env,m,uci))
 assert m['status']=='active'
 m=ok(act(env,m,m['white']['id'],'claim_draw'));assert m['reason']=='claimed_draw'
 m=live(env)
 for _ in range(4):
  for uci in ['g1f3','g8f6','f3g1','f6g8']:m=ok(mv(env,m,uci))
 assert m['reason']=='fivefold_repetition'

@pytest.mark.parametrize('fen,move,expected',[
 ('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1','e1g1','O-O'),
 ('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1','e5d6','exd6'),
 ('7k/P7/8/8/8/8/8/4K3 w - - 0 1','a7a8n','a8=N'),
 ('7k/P7/8/8/8/8/8/4K3 w - - 0 1','a7a8q','a8=Q+')])
def test_special_moves_san(fen,move,expected):
 g=Game(fen);assert san_move(g,move)==expected

def test_repetition_ignores_unusable_ep():
 a=Game();a.apply_move('e2e4');b=Game(str(a).replace('e3','-'));assert position_key(a)==position_key(b)

@pytest.mark.parametrize('fen,expected',[
 ('4k3/8/8/8/8/8/8/4K3 w - - 0 1',True),
 ('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1',True),
 ('4k3/8/8/8/8/8/8/2N1K3 w - - 0 1',True),
 ('4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1',False),
 ('4k3/8/8/8/8/8/8/2R1K3 w - - 0 1',False)])
def test_insufficient_material(fen,expected):assert insufficient(Game(fen))==expected

def test_practice_bot_never_rated_and_resignation(env):
 m=ok(req(env,0,'POST','/practice'));assert m['mode']=='bot' and not m['rated']
 m=ok(mv(env,m,'e2e4'));assert len(m['moves'])==2 and m['turn']=='w'
 m=ok(act(env,m,0,'resign'));assert m['status']=='finished'
 assert ok(req(env,0,'GET','/hub'))['me']['rating']==1200
 assert ok(req(env,0,'GET','/leaderboard'))['items']==[]

def test_friend_invitation_consent_decline_expiry_and_black_queue_preserved(env):
 ok(req(env,1,'POST','/queue',{'preset':'3+2','rated':True}))
 m=ok(req(env,0,'POST','/invite',{'public_id':'ID1','preset':'5+3'}))
 assert m['status']=='invited' and not m['rated']
 with Session(env[1]) as db:
  p=db.get(ChessPlayer,'1');assert p.active_match is None and p.queue=='3+2R'
 assert act(env,m,0,'accept').status_code==409
 assert ok(req(env,1,'GET','/hub'))['invitations'][0]['id']==m['id']
 m=ok(act(env,m,1,'accept'));assert m['status']=='active'
 assert req(env,1,'POST','/practice').status_code==409
 ok(act(env,m,1,'resign'))
 m=ok(req(env,0,'POST','/invite',{'public_id':'ID1'}))
 with Session(env[1]) as db:db.get(ChessMatch,m['id']).created_at=c.now()-timedelta(minutes=3);db.commit()
 m=ok(req(env,1,'GET','/matches/'+m['id']));assert m['status']=='expired'
 assert ok(req(env,0,'POST','/practice'))['status']=='active'

def test_blocked_invitation_and_matchmaking(env):
 with Session(env[1]) as db:db.add(UserBlock(blocker_id='1',blocked_id='0'));db.commit()
 assert req(env,0,'POST','/invite',{'public_id':'ID1'}).status_code==403
 ok(req(env,0,'POST','/queue',{}));assert ok(req(env,1,'POST','/queue',{}))['queued']
 assert ok(req(env,2,'POST','/queue',{}))['match'] is not None

def test_queue_expiry_and_cancel(env):
 ok(req(env,0,'POST','/queue',{}))
 with Session(env[1]) as db:db.get(ChessPlayer,'0').queued_at=c.now()-timedelta(seconds=61);db.commit()
 assert ok(req(env,1,'POST','/queue',{}))['queued']
 assert ok(req(env,0,'GET','/hub'))['queue'] is None
 ok(req(env,1,'DELETE','/queue'));assert ok(req(env,1,'GET','/hub'))['queue'] is None

def test_concurrent_matching_reserves_exactly_one_match(env):
 ok(req(env,0,'POST','/queue',{}))
 with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda uid:req(env,uid,'POST','/queue',{}),[1,2]))
 assert all(r.status_code==200 for r in results)
 assert sum(r.json()['match'] is not None for r in results)==1
 with Session(env[1]) as db:assert db.scalar(select(c.func.count()).select_from(ChessMatch))==1

def test_concurrent_duplicate_move_only_applies_once(env):
 m=live(env)
 with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:mv(env,m,'e2e4',key='same-concurrent'),range(2)))
 assert all(r.status_code==200 for r in results),[r.text for r in results]
 with Session(env[1]) as db:assert len(json.loads(db.get(ChessMatch,m['id']).moves))==1

def test_tournament_lifecycle_standings_and_private_spectator_authority(env):
 t=tournament(env);tid=t['id'];assert t['round']==1 and len(t['matches'])==2
 assert req(env,1,'POST','/tournaments/'+tid+'/action',{'action':'cancel'}).status_code==409
 assert req(env,0,'POST','/practice').status_code==409
 assert req(env,9,'POST','/tournaments/'+tid+'/action',{'action':'join'}).status_code==409
 for rnd in range(1,4):
  matches=[m for m in t['matches'] if m['round']==rnd]
  assert len(matches)==2
  for item in matches:
   m=ok(req(env,30,'GET','/matches/'+item['id']))
   assert mv(env,m,'e2e4',who=30).status_code==403
   ok(act(env,m,m['black']['id'],'resign'))
  t=ok(req(env,0,'GET','/tournaments/'+tid))
 assert t['status']=='finished' and len(t['matches'])==6
 assert sum(x['points'] for x in t['standings'])==6
 with Session(env[1]) as db:
  for uid in ['0','1','2','3']:
   p=db.get(ChessPlayer,uid);assert p.tournament_id is None and p.active_match is None and p.rating==1200
  for e in db.scalars(select(ChessEntry)):assert len(set(json.loads(e.opponents)))==3
 assert ok(req(env,0,'POST','/practice'))['mode']=='bot'

def test_odd_tournament_bye_rotates_and_rounds_truncate(env):
 t=tournament(env,5,5);tid=t['id'];assert t['rounds']==4
 for rnd in range(1,5):
  for m in [x for x in t['matches'] if x['round']==rnd]:
   game=ok(req(env,0,'GET','/matches/'+m['id']));ok(act(env,game,game['black']['id'],'resign'))
  t=ok(req(env,0,'GET','/tournaments/'+tid))
 assert t['status']=='finished' and sum(e['bye'] for e in t['standings'])==4
 assert sum(e['points'] for e in t['standings'])==12

def test_tournament_registration_permissions_capacity_and_cancel(env):
 t=ok(req(env,0,'POST','/tournaments',{'name':'Yeni turnuva','capacity':4}));tid=t['id']
 assert req(env,1,'POST','/tournaments/'+tid+'/action',{'action':'cancel'}).status_code==403
 for uid in [1,2,3]:ok(req(env,uid,'POST','/tournaments/'+tid+'/action',{'action':'join'}))
 assert req(env,4,'POST','/tournaments/'+tid+'/action',{'action':'join'}).status_code==409
 ok(req(env,3,'POST','/tournaments/'+tid+'/action',{'action':'leave'}));ok(req(env,4,'POST','/tournaments/'+tid+'/action',{'action':'join'}))
 t=ok(req(env,0,'POST','/tournaments/'+tid+'/action',{'action':'cancel'}));assert t['status']=='cancelled'
 assert ok(req(env,1,'POST','/practice'))['mode']=='bot'

def test_scheduled_start_insufficient_players_cancels_and_releases(env):
 t=ok(req(env,0,'POST','/tournaments',{'name':'Az oyuncu'}))
 with Session(env[1]) as db:db.get(ChessTournament,t['id']).starts_at=c.now()-timedelta(seconds=1);db.commit()
 t=ok(req(env,1,'GET','/tournaments/'+t['id']));assert t['status']=='cancelled'
 assert ok(req(env,0,'POST','/practice'))['mode']=='bot'

def test_tournament_timeouts_advance_from_poll_and_cannot_double_score(env):
 t=tournament(env);tid=t['id']
 with Session(env[1]) as db:
  for m in db.scalars(select(ChessMatch)):m.tick_at=c.now()-timedelta(minutes=4)
  db.commit()
 t=ok(req(env,0,'GET','/tournaments/'+tid));assert t['round']==2
 total=sum(e['points'] for e in t['standings']);assert total==2
 t=ok(req(env,0,'GET','/tournaments/'+tid));assert sum(e['points'] for e in t['standings'])==total

def test_scheduled_start_clock_uses_deadline_and_catches_up_all_rounds(env):
 t=ok(req(env,0,'POST','/tournaments',{'name':'Zamanlı turnuva','preset':'3+2'}));tid=t['id']
 for uid in [1,2,3]:ok(req(env,uid,'POST','/tournaments/'+tid+'/action',{'action':'join'}))
 with Session(env[1]) as db:db.get(ChessTournament,tid).starts_at=c.now()-timedelta(hours=1);db.commit()
 t=ok(req(env,0,'GET','/tournaments/'+tid));assert t['status']=='finished' and t['round']==3
 assert all(m['status']=='finished' and m['result']=='0-1' for m in t['matches'])
 assert sum(e['points'] for e in t['standings'])==6
 with Session(env[1]) as db:
  assert all(c.utc(m.finished_at)<c.now()-timedelta(minutes=40) for m in db.scalars(select(ChessMatch)))
  assert all(db.get(ChessPlayer,str(uid)).tournament_id is None for uid in range(4))

def test_concurrent_first_hub_initializes_single_gate(env):
 with ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(lambda uid:req(env,uid,'GET','/hub'),[0,1,2]))
 assert all(r.status_code==200 for r in results)
 with Session(env[1]) as db:assert db.scalar(select(c.func.count()).select_from(ChessGate))==1

def test_concurrent_two_different_moves_one_revision_has_one_winner(env):
 m=live(env)
 with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda uci:mv(env,m,uci,key='concurrent_'+uci),['e2e4','d2d4']))
 assert sorted(r.status_code for r in results)==[200,409]
 with Session(env[1]) as db:assert len(json.loads(db.get(ChessMatch,m['id']).moves))==1

@pytest.mark.parametrize('fen,uci,result,why',[
 ('7k/4Q3/6K1/8/8/8/8/8 w - - 0 1','e7f7','1/2-1/2','stalemate'),
 ('7k/8/8/8/8/8/4n3/2B1K3 w - - 0 1','c1e3',None,None),
 ('7k/8/8/8/8/8/8/R3K3 w - - 149 1','a1a2','1/2-1/2','seventy_five_moves')])
def test_automatic_draw_rule_positions(fen,uci,result,why):
 from app.chess_rules import automatic_result
 g=Game(fen);san_move(g,uci)
 class M:pass
 m=M();m.fen=str(g);m.moves='[]'
 assert automatic_result(m,g)==((result,why) if result else None)

def test_compact_hub_exposes_resume_summary_and_keeps_server_clock(env):
 m=live(env);uid=m['white']['id']
 with Session(env[1]) as db:db.get(ChessMatch,m['id']).tick_at=c.now()-timedelta(seconds=5);db.commit()
 h=ok(req(env,uid,'GET','/hub?compact=true'));assert h['active']=={'id':m['id'],'status':'active'}
 full=ok(req(env,uid,'GET','/matches/'+m['id']));assert full['white_ms']<296000
 assert full['fen']==Game.default_fen

def test_tournament_start_does_not_consume_clock_before_deadline(env):
 t=ok(req(env,0,'POST','/tournaments',{'name':'Yaklaşan turnuva'}));tid=t['id']
 for uid in [1,2,3]:ok(req(env,uid,'POST','/tournaments/'+tid+'/action',{'action':'join'}))
 t=ok(req(env,0,'GET','/tournaments/'+tid));assert t['status']=='registration' and t['matches']==[]
 t=ok(req(env,0,'POST','/tournaments/'+tid+'/action',{'action':'start'}));assert t['round']==1
 for m in t['matches']:
  game=ok(req(env,0,'GET','/matches/'+m['id']));assert game['white_ms']>299000

def test_existing_account_erasure_does_not_leave_opponents_reserved(env):
 from app.account_deletion_routes import delete_user
 t=tournament(env);tid=t['id']
 with Session(env[1]) as db:delete_user(db,db.get(User,'0'))
 for uid in [1,2,3]:
  h=ok(req(env,uid,'GET','/hub'));assert h['tournament_id'] is None
  assert h['active'] is None
  assert ok(req(env,uid,'POST','/practice'))['mode']=='bot'

def test_erased_current_matches_do_not_stall_remaining_tournament(env):
 from app.account_deletion_routes import delete_user
 t=tournament(env);tid=t['id']
 # Keep the owner, erase one nonowner from each of the two current matches.
 victims=[]
 for m in t['matches']:
  victims.append(next(p['id'] for p in (m['white'],m['black']) if p['id']!='0'))
 with Session(env[1]) as db:
  for uid in victims:delete_user(db,db.get(User,uid))
 t=ok(req(env,0,'GET','/tournaments/'+tid));assert t['round']==2
 assert len([m for m in t['matches'] if m['status']=='active'])==1
