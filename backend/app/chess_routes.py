"""Authenticated, free chess. One database gate serializes state transitions.

The gate is deliberately conservative: correct across multiple API workers, but
not intended as a claim of high-volume matchmaking throughput. No wallet access.
"""
import json
import secrets
from uuid import uuid4
from datetime import datetime, timezone, timedelta
from contextlib import contextmanager
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update, or_, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .platform_models import UserBlock
from .chess_models import ChessGate, ChessPlayer, ChessMatch, ChessCommand, ChessTournament, ChessEntry
from .chess_vendor import Game
from .chess_rules import san_move, insufficient, automatic_result, repetitions, bot_move, pgn
from .runtime_tasks import database_task

router=APIRouter(prefix='/v1/chess', tags=['chess'])
_auth=None
PRESETS={'3+2':(180000,2000),'5+3':(300000,3000),'10+5':(600000,5000)}

def register(auth):
    global _auth
    _auth=auth

def authenticated(db:Session=Depends(get_db), authorization:str|None=Header(None), request:Request=None):
    user=_auth(db,authorization,request)
    if not user.is_active:raise HTTPException(403,'Hesap kullanılamıyor.')
    return user

def now():return datetime.now(timezone.utc)
def utc(t):return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t
def ident():return str(uuid4())
def fail(code,msg):raise HTTPException(code,msg)

@contextmanager
def transaction(db):
    if db.get(ChessGate,1) is None:
        try:
            with db.begin_nested():
                db.add(ChessGate(id=1,version=0));db.flush()
        except IntegrityError:pass
    db.execute(update(ChessGate).where(ChessGate.id==1).values(version=1-ChessGate.version))
    db.expire_all()
    try:
        yield
        db.commit()
    except HTTPException:
        # Validation is always performed before the requested mutation. Persist
        # any elapsed-clock/round settlement performed while checking access.
        db.commit();raise
    except Exception:
        db.rollback();raise

def player(db,uid):
    p=db.get(ChessPlayer,uid)
    if not p:
        p=ChessPlayer(user_id=uid,rating=1200,wins=0,draws=0,losses=0);db.add(p);db.flush()
    # Existing account erasure removes dependent matches/tournaments. Repair
    # surviving participants' soft reservations instead of blocking them forever.
    if p.active_match:
        m=db.get(ChessMatch,p.active_match)
        if not m or m.status not in ('active','invited'):p.active_match=None
    if p.tournament_id:
        t=db.get(ChessTournament,p.tournament_id)
        if not t or t.status not in ('registration','active'):p.tournament_id=None
    return p

def name(db,uid):
    u=db.get(User,uid) if uid else None
    return u.nickname if u else 'Antrenman botu'

def person(db,uid):
    p=player(db,uid) if uid else None
    return {'id':uid,'name':name(db,uid),'rating':p.rating if p else None}

def blocked(db,a,b):
    return db.scalar(select(UserBlock.id).where(or_((UserBlock.blocker_id==a)&(UserBlock.blocked_id==b),(UserBlock.blocker_id==b)&(UserBlock.blocked_id==a)))) is not None

def finish(db,m,result,reason,at=None):
    if m.status!='active':return
    m.status='finished';m.result=result;m.reason=reason;m.finished_at=at or now();m.revision+=1;m.draw_by=None
    for uid in (m.white_id,m.black_id):
        if uid:
            p=player(db,uid)
            if p.active_match==m.id:p.active_match=None
    if m.rated and m.black_id:
        w,b=player(db,m.white_id),player(db,m.black_id)
        score=1 if result=='1-0' else 0 if result=='0-1' else .5
        delta=round(32*(score-1/(1+10**((b.rating-w.rating)/400))))
        wd=max(100,w.rating+delta)-w.rating;bd=max(100,b.rating-delta)-b.rating
        w.rating+=wd;b.rating+=bd;m.rating_delta=json.dumps({'white':wd,'black':bd})
        if score==1:w.wins+=1;b.losses+=1
        elif score==0:b.wins+=1;w.losses+=1
        else:w.draws+=1;b.draws+=1
    if m.tournament_id:
        entries={e.user_id:e for e in db.scalars(select(ChessEntry).where(ChessEntry.tournament_id==m.tournament_id))}
        entries[m.white_id].points+=2 if result=='1-0' else 1 if result=='1/2-1/2' else 0
        entries[m.black_id].points+=2 if result=='0-1' else 1 if result=='1/2-1/2' else 0
    db.flush()

def touch(db,m,t=None,timeout_only=False):
    t=t or now()
    if m.status=='invited':
        if (t-utc(m.created_at)).total_seconds()>120:
            m.status='expired';m.reason='invite_expired';m.revision+=1
            p=player(db,m.white_id)
            if p.active_match==m.id:p.active_match=None
        return
    if m.status!='active' or m.mode=='bot':return
    elapsed=max(0,int((t-utc(m.tick_at)).total_seconds()*1000))
    turn=Game(m.fen).state.player
    attr='white_ms' if turn=='w' else 'black_ms'
    if timeout_only and elapsed<getattr(m,attr):return
    deadline=utc(m.tick_at)+timedelta(milliseconds=getattr(m,attr))
    setattr(m,attr,max(0,getattr(m,attr)-elapsed));m.tick_at=t
    if getattr(m,attr)==0:
        winner='b' if turn=='w' else 'w'
        finish(db,m,'1/2-1/2' if insufficient(Game(m.fen),winner) else '0-1' if turn=='w' else '1-0','timeout',deadline)

def available(db,uid,tid=None):
    p=player(db,uid)
    if p.active_match:
        old=db.get(ChessMatch,p.active_match)
        if old:touch(db,old)
        if old and old.status in ('active','invited'):fail(409,'Önce mevcut maçınızı tamamlayın.')
        p.active_match=None
    if p.tournament_id and p.tournament_id!=tid:fail(409,'Kayıtlı olduğunuz turnuvayı tamamlayın veya kayıttan ayrılın.')
    return p

def new_match(db,w,b,preset,rated=False,mode='live',tid=None,round_no=None,reserve_black=True):
    ms,inc=PRESETS[preset];t=now()
    m=ChessMatch(id=ident(),white_id=w,black_id=b,mode=mode,status='active',rated=rated,preset=preset,
        fen=Game.default_fen,moves='[]',white_ms=ms,black_ms=ms,increment_ms=inc,tick_at=t,created_at=t,
        revision=0,result='*',rating_delta='{}',tournament_id=tid,round_no=round_no)
    db.add(m);db.flush()
    for uid in (w,b if reserve_black else None):
        if uid:
            p=player(db,uid);p.active_match=m.id;p.queue=None;p.queued_at=None
    return m

def load_match(db,mid,uid):
    m=db.get(ChessMatch,mid)
    if not m:fail(404,'Maç bulunamadı.')
    if uid not in (m.white_id,m.black_id) and not m.tournament_id:fail(403,'Bu maç size ait değil.')
    touch(db,m)
    return m

def view(db,m,uid):
    moves=json.loads(m.moves);g=Game(m.fen)
    return {'id':m.id,'white':person(db,m.white_id),'black':person(db,m.black_id),
        'mode':m.mode,'status':m.status,'rated':m.rated,'preset':m.preset,'fen':m.fen,'moves':moves,
        'legal':g.get_moves() if m.status=='active' and (uid==m.white_id and g.state.player=='w' or uid==m.black_id and g.state.player=='b') else [],
        'check':g.status in (Game.CHECK,Game.CHECKMATE),'turn':g.state.player,
        'white_ms':m.white_ms,'black_ms':m.black_ms,'server_at':now().isoformat(),'revision':m.revision,
        'result':m.result,'reason':m.reason,'draw_by':m.draw_by,'rating_delta':json.loads(m.rating_delta),
        'tournament_id':m.tournament_id,'round':m.round_no,'viewer':uid,
        'pgn':pgn(m,name(db,m.white_id),name(db,m.black_id))}

def standings(db,t):
    entries=list(db.scalars(select(ChessEntry).where(ChessEntry.tournament_id==t.id)))
    points={e.user_id:e.points for e in entries}
    result=[{'user':person(db,e.user_id),'points':e.points/2,'buchholz':sum(points.get(o,0) for o in json.loads(e.opponents))/2,
        'bye':e.bye,'seed':e.seed} for e in entries]
    result.sort(key=lambda e:(-e['points'],-e['buchholz'],-e['seed'],e['user']['id']))
    for i,row in enumerate(result):row['rank']=i+1
    return result

def next_round(db,t,tick=None):
    entries=list(db.scalars(select(ChessEntry).where(ChessEntry.tournament_id==t.id)))
    if t.round_no>=t.rounds:
        t.status='finished'
        for e in entries:player(db,e.user_id).tournament_id=None
        return
    t.round_no+=1
    scores={e['user']['id']:e for e in standings(db,t)}
    entries.sort(key=lambda e:(-e.points,-scores[e.user_id]['buchholz'],-e.seed,e.user_id))
    if len(entries)%2:
        bye=next((e for e in reversed(entries) if not e.bye),entries[-1]);bye.points+=2;bye.bye=True;entries.remove(bye)
    # Bounded search favors no repeated opponents; fallback minimizes repeats.
    budget=[10000]
    def pair(rest):
        if not rest:return []
        budget[0]-=1
        if budget[0]<0:return None
        a=rest[0];seen=json.loads(a.opponents)
        for j in sorted(range(1,len(rest)),key=lambda j:(abs(a.points-rest[j].points),abs(a.seed-rest[j].seed))):
            b=rest[j]
            if b.user_id in seen:continue
            tail=pair(rest[1:j]+rest[j+1:])
            if tail is not None:return [(a,b)]+tail
        return None
    pairs=pair(entries)
    if pairs is None:
        pairs=[];rest=entries[:]
        while rest:
            a=rest.pop(0);b=min(rest,key=lambda e:(e.user_id in json.loads(a.opponents),abs(a.points-e.points),abs(a.seed-e.seed)))
            rest.remove(b);pairs.append((a,b))
    for a,b in pairs:
        balance=lambda e:e.colors.count('w')-e.colors.count('b')
        if balance(a)>balance(b) or balance(a)==balance(b) and t.round_no%2==0:a,b=b,a
        a.opponents=json.dumps(json.loads(a.opponents)+[b.user_id]);b.opponents=json.dumps(json.loads(b.opponents)+[a.user_id])
        a.colors+='w';b.colors+='b'
        match=new_match(db,a.user_id,b.user_id,t.preset,False,'tournament',t.id,t.round_no)
        if tick:match.tick_at=tick
    db.flush()

def advance(db,t):
    if t.status=='registration' and utc(t.starts_at)<=now():start_tournament(db,t,scheduled=True)
    # Bounded catch-up: a late reader cannot reset any round's elapsed clock.
    for _ in range(5):
        if t.status!='active':break
        current=list(db.scalars(select(ChessMatch).where(ChessMatch.tournament_id==t.id,ChessMatch.round_no==t.round_no)))
        for m in current:touch(db,m,timeout_only=True)
        if not current:
            # Account erasure can remove a participant and their current match.
            entries=list(db.scalars(select(ChessEntry).where(ChessEntry.tournament_id==t.id)))
            if len(entries)<2:
                t.status='cancelled'
                for e in entries:
                    p=player(db,e.user_id);p.tournament_id=None;p.active_match=None
                break
            next_round(db,t)
        elif all(m.status=='finished' for m in current):
            next_round(db,t,max(utc(m.finished_at) for m in current))
        else:break

def start_tournament(db,t,scheduled=False):
    entries=list(db.scalars(select(ChessEntry).where(ChessEntry.tournament_id==t.id)))
    if len(entries)<4:
        t.status='cancelled'
        for e in entries:player(db,e.user_id).tournament_id=None
        return
    t.rounds=min(t.rounds,len(entries)-1);t.status='active';next_round(db,t,utc(t.starts_at) if scheduled else now())

def tournament_view(db,t):
    matches=list(db.scalars(select(ChessMatch).where(ChessMatch.tournament_id==t.id).order_by(ChessMatch.round_no,ChessMatch.id)))
    return {'id':t.id,'name':t.name,'owner_id':t.owner_id,'status':t.status,'preset':t.preset,'rounds':t.rounds,
        'round':t.round_no,'capacity':t.capacity,'starts_at':utc(t.starts_at).isoformat(),'standings':standings(db,t),
        'matches':[{'id':m.id,'round':m.round_no,'white':person(db,m.white_id),'black':person(db,m.black_id),'status':m.status,'result':m.result} for m in matches]}

class Input(BaseModel):model_config=ConfigDict(extra='forbid')
class Play(Input):
    preset:Literal['3+2','5+3','10+5']='5+3'
    rated:bool=True
class Invite(Play):public_id:str=Field(min_length=1,max_length=32)
class Move(Input):
    uci:str=Field(pattern=r'^[a-h][1-8][a-h][1-8][qrbn]?$')
    revision:int=Field(ge=0)
    key:str=Field(min_length=8,max_length=64,pattern=r'^[a-zA-Z0-9_-]+$')
class Action(Input):action:Literal['accept','decline','resign','offer_draw','accept_draw','decline_draw','claim_draw']
class TournamentCreate(Input):
    name:str=Field(min_length=3,max_length=64)
    preset:Literal['3+2','5+3','10+5']='5+3'
    rounds:int=Field(default=3,ge=3,le=5)
    capacity:int=Field(default=16,ge=4,le=32)
    starts_in_minutes:int=Field(default=10,ge=2,le=1440)
class TournamentAction(Input):action:Literal['join','leave','start','cancel']

@router.get('/hub')
@database_task
async def hub(compact:bool=False,db:Session=Depends(get_db),user:User=Depends(authenticated)):
    with transaction(db):
        uid=user.id;p=player(db,uid)
        if p.tournament_id:
            t=db.get(ChessTournament,p.tournament_id)
            if t:advance(db,t)
        m=db.get(ChessMatch,p.active_match) if p.active_match else None
        if m:touch(db,m)
        if p.queue and p.queued_at and (now()-utc(p.queued_at)).total_seconds()>60:p.queue=None
        invites=list(db.scalars(select(ChessMatch).where(ChessMatch.black_id==uid,ChessMatch.status=='invited').order_by(ChessMatch.created_at.desc()).limit(20)))
        for i in invites:touch(db,i)
        tournaments=list(db.scalars(select(ChessTournament).where(ChessTournament.status.in_(['registration','active'])).order_by(ChessTournament.starts_at).limit(30)))
        for t in tournaments:
            if t.status=='registration':advance(db,t)
        return {'me':person(db,uid),'stats':{'wins':p.wins,'draws':p.draws,'losses':p.losses},
            'active':({'id':m.id,'status':m.status} if compact else view(db,m,uid)) if m and m.status in ('active','invited') else None,'queue':p.queue,
            'tournament_id':p.tournament_id,'invitations':[view(db,i,uid) for i in invites if i.status=='invited'],
            'tournaments':[{'id':t.id,'name':t.name,'status':t.status,'preset':t.preset,'round':t.round_no,'rounds':t.rounds,'capacity':t.capacity,'starts_at':utc(t.starts_at).isoformat()} for t in tournaments]}

@router.post('/queue')
@database_task
async def queue(data:Play,db:Session=Depends(get_db),user:User=Depends(authenticated)):
    with transaction(db):
        p=available(db,user.id);key=data.preset+('R' if data.rated else 'F');cut=now()-timedelta(seconds=60)
        candidates=db.scalars(select(ChessPlayer).where(ChessPlayer.queue==key,ChessPlayer.user_id!=user.id,ChessPlayer.queued_at>=cut,ChessPlayer.active_match.is_(None),ChessPlayer.tournament_id.is_(None)).order_by(ChessPlayer.queued_at).limit(100))
        other=next((c for c in candidates if db.get(User,c.user_id).is_active and not blocked(db,user.id,c.user_id)),None)
        if other:
            w,b=(user.id,other.user_id) if secrets.randbelow(2) else (other.user_id,user.id)
            m=new_match(db,w,b,data.preset,data.rated)
            return {'match':view(db,m,user.id),'queued':False}
        p.queue=key;p.queued_at=now();return {'match':None,'queued':True}

@router.delete('/queue')
@database_task
async def cancel_queue(db:Session=Depends(get_db),user:User=Depends(authenticated)):
    with transaction(db):player(db,user.id).queue=None
    return {'ok':True}

@router.post('/practice')
@database_task
async def practice(db:Session=Depends(get_db),user:User=Depends(authenticated)):
    with transaction(db):
        available(db,user.id);m=new_match(db,user.id,None,'5+3',False,'bot');return view(db,m,user.id)

@router.post('/invite')
@database_task
async def invite(data:Invite,db:Session=Depends(get_db),user:User=Depends(authenticated)):
    with transaction(db):
        available(db,user.id)
        u=db.scalar(select(User).where(User.public_id==data.public_id.strip(),User.is_active.is_(True)))
        if not u or u.id==user.id:fail(404,'Davet edilecek kullanıcı bulunamadı.')
        if blocked(db,user.id,u.id):fail(403,'Bu kullanıcıya davet gönderilemiyor.')
        recent=db.scalar(select(func.count()).select_from(ChessMatch).where(ChessMatch.white_id==user.id,ChessMatch.mode=='friend',ChessMatch.created_at>now()-timedelta(hours=1)))
        if recent>=10:fail(429,'Saatte en fazla 10 arkadaş daveti gönderebilirsiniz.')
        # Refuse unavailable targets, but never reserve their slot without consent.
        available(db,u.id)
        m=new_match(db,user.id,u.id,data.preset,False,'friend',reserve_black=False);m.status='invited'
        return view(db,m,user.id)

@router.get('/matches/{mid}')
@database_task
async def get_match(mid:str,db:Session=Depends(get_db),user:User=Depends(authenticated)):
    with transaction(db):
        m=load_match(db,mid,user.id)
        if m.tournament_id:advance(db,db.get(ChessTournament,m.tournament_id))
        return view(db,m,user.id)

def append_move(db,m,uci):
    g=Game(m.fen);san=san_move(g,uci);moves=json.loads(m.moves)
    moves.append({'uci':uci,'san':san,'fen':str(g)});m.moves=json.dumps(moves);m.fen=str(g);m.revision+=1;m.draw_by=None
    result=automatic_result(m,g)
    if result:finish(db,m,*result)
    return g

@router.post('/matches/{mid}/move')
@database_task
async def move(mid:str,data:Move,db:Session=Depends(get_db),user:User=Depends(authenticated)):
    with transaction(db):
        m=load_match(db,mid,user.id)
        if user.id not in (m.white_id,m.black_id):fail(403,'İzleyici hamle yapamaz.')
        existing=db.scalar(select(ChessCommand).where(ChessCommand.match_id==mid,ChessCommand.key==data.key))
        if existing:
            if existing.actor!=user.id or existing.uci!=data.uci:fail(409,'İşlem anahtarı daha önce kullanıldı.')
            return view(db,m,user.id)
        if m.status!='active':fail(409,'Maç aktif değil.')
        if m.revision!=data.revision:fail(409,'Tahta güncellendi; son konumu alın.')
        g=Game(m.fen);who=m.white_id if g.state.player=='w' else m.black_id
        if who!=user.id:fail(403,'Hamle sırası sizde değil.')
        if data.uci not in g.get_moves():fail(422,'Geçersiz hamle.')
        attr='white_ms' if g.state.player=='w' else 'black_ms'
        if m.mode!='bot':setattr(m,attr,getattr(m,attr)+m.increment_ms)
        db.add(ChessCommand(id=ident(),match_id=mid,key=data.key,actor=user.id,uci=data.uci))
        g=append_move(db,m,data.uci)
        if m.mode=='bot' and m.status=='active':
            reply=bot_move(g)
            if reply:append_move(db,m,reply)
        m.tick_at=now()
        if m.tournament_id:advance(db,db.get(ChessTournament,m.tournament_id))
        return view(db,m,user.id)

@router.post('/matches/{mid}/action')
@database_task
async def action(mid:str,data:Action,db:Session=Depends(get_db),user:User=Depends(authenticated)):
    with transaction(db):
        m=load_match(db,mid,user.id);uid=user.id;a=data.action
        if uid not in (m.white_id,m.black_id):fail(403,'İzleyici maç işlemi yapamaz.')
        if m.status=='invited':
            if a=='accept' and uid==m.black_id:
                available(db,uid);m.status='active';m.tick_at=now();m.revision+=1;player(db,uid).active_match=m.id;player(db,uid).queue=None
            elif a=='decline':
                m.status='cancelled';m.revision+=1
                if player(db,m.white_id).active_match==m.id:player(db,m.white_id).active_match=None
            else:fail(409,'Davet kabul veya reddedilebilir.')
        else:
            if m.status!='active':fail(409,'Maç tamamlanmış.')
            if a=='resign':finish(db,m,'0-1' if uid==m.white_id else '1-0','resignation')
            elif a=='offer_draw':
                if m.mode=='bot':fail(422,'Antrenman botu beraberlik teklifi kabul etmez.')
                if m.draw_by:fail(409,'Bekleyen beraberlik teklifi var.')
                m.draw_by=uid;m.revision+=1
            elif a in ('accept_draw','decline_draw'):
                if not m.draw_by or m.draw_by==uid:fail(409,'Size yapılmış bir teklif yok.')
                if a=='accept_draw':finish(db,m,'1/2-1/2','agreement')
                else:m.draw_by=None;m.revision+=1
            elif a=='claim_draw':
                g=Game(m.fen)
                if (g.state.player=='w')!=(uid==m.white_id):fail(403,'Beraberlik talebi için sıra sizde olmalı.')
                if int(g.state.ply)<100 and repetitions(m)<3:fail(422,'Üç tekrar veya 50 hamle koşulu oluşmadı.')
                finish(db,m,'1/2-1/2','claimed_draw')
            else:fail(422,'Bu işlem bu konumda kullanılamaz.')
        if m.tournament_id:advance(db,db.get(ChessTournament,m.tournament_id))
        return view(db,m,uid)

@router.get('/history')
@database_task
async def history(offset:int=Query(0,ge=0,le=10000),db:Session=Depends(get_db),user:User=Depends(authenticated)):
    rows=list(db.scalars(select(ChessMatch).where(or_(ChessMatch.white_id==user.id,ChessMatch.black_id==user.id),ChessMatch.status=='finished').order_by(ChessMatch.finished_at.desc(),ChessMatch.id).offset(offset).limit(21)))
    return {'items':[{'id':m.id,'white':name(db,m.white_id),'black':name(db,m.black_id),'result':m.result,'rated':m.rated,'finished_at':utc(m.finished_at).isoformat()} for m in rows[:20]],'has_more':len(rows)>20}

@router.get('/leaderboard')
@database_task
async def leaderboard(db:Session=Depends(get_db),user:User=Depends(authenticated)):
    rows=db.execute(select(ChessPlayer,User).join(User,User.id==ChessPlayer.user_id).where(User.is_active.is_(True),(ChessPlayer.wins+ChessPlayer.losses+ChessPlayer.draws)>0).order_by(ChessPlayer.rating.desc(),ChessPlayer.wins.desc(),ChessPlayer.user_id).limit(50)).all()
    return {'items':[{'name':u.nickname,'id':p.user_id,'rating':p.rating,'wins':p.wins,'draws':p.draws,'losses':p.losses} for p,u in rows]}

@router.post('/tournaments')
@database_task
async def create_tournament(data:TournamentCreate,db:Session=Depends(get_db),user:User=Depends(authenticated)):
    title=data.name.strip()
    if len(title)<3 or any(ord(c)<32 for c in title):fail(422,'Geçerli bir turnuva adı yazın.')
    with transaction(db):
        available(db,user.id)
        recent=db.scalar(select(func.count()).select_from(ChessTournament).where(ChessTournament.owner_id==user.id,ChessTournament.created_at>now()-timedelta(days=1)))
        if recent>=3:fail(429,'Günde en fazla 3 turnuva oluşturabilirsiniz.')
        total=db.scalar(select(func.count()).select_from(ChessTournament).where(ChessTournament.status.in_(['registration','active'])))
        if total>=30:fail(429,'Aktif turnuva sınırına ulaşıldı.')
        t=ChessTournament(id=ident(),owner_id=user.id,name=title,preset=data.preset,rounds=data.rounds,capacity=data.capacity,round_no=0,status='registration',starts_at=now()+timedelta(minutes=data.starts_in_minutes),created_at=now())
        db.add(t);db.flush();p=player(db,user.id);p.tournament_id=t.id;p.queue=None
        db.add(ChessEntry(id=ident(),tournament_id=t.id,user_id=user.id,seed=p.rating,points=0,opponents='[]',colors='',bye=False));db.flush()
        return tournament_view(db,t)

@router.get('/tournaments/{tid}')
@database_task
async def get_tournament(tid:str,db:Session=Depends(get_db),user:User=Depends(authenticated)):
    with transaction(db):
        t=db.get(ChessTournament,tid)
        if not t:fail(404,'Turnuva bulunamadı.')
        advance(db,t);return tournament_view(db,t)

@router.post('/tournaments/{tid}/action')
@database_task
async def tournament_action(tid:str,data:TournamentAction,db:Session=Depends(get_db),user:User=Depends(authenticated)):
    with transaction(db):
        t=db.get(ChessTournament,tid)
        if not t:fail(404,'Turnuva bulunamadı.')
        advance(db,t)
        if t.status!='registration':fail(409,'Kayıt dönemi kapandı.')
        e=db.scalar(select(ChessEntry).where(ChessEntry.tournament_id==tid,ChessEntry.user_id==user.id))
        if data.action=='join':
            if e:return tournament_view(db,t)
            p=available(db,user.id,tid)
            count=db.scalar(select(func.count()).select_from(ChessEntry).where(ChessEntry.tournament_id==tid))
            if count>=t.capacity:fail(409,'Turnuva dolu.')
            p.tournament_id=tid;p.queue=None
            db.add(ChessEntry(id=ident(),tournament_id=tid,user_id=user.id,seed=p.rating,points=0,opponents='[]',colors='',bye=False))
        elif data.action=='leave':
            if not e:fail(404,'Turnuvaya kayıtlı değilsiniz.')
            db.delete(e);player(db,user.id).tournament_id=None
        elif data.action in ('start','cancel'):
            if t.owner_id!=user.id:fail(403,'Bu işlemi turnuvayı oluşturan kişi yapabilir.')
            if data.action=='start':
                count=db.scalar(select(func.count()).select_from(ChessEntry).where(ChessEntry.tournament_id==tid))
                if count<4:fail(422,'Başlamak için en az 4 oyuncu gerekir.')
                start_tournament(db,t)
            else:
                t.status='cancelled'
                for entry in db.scalars(select(ChessEntry).where(ChessEntry.tournament_id==tid)):player(db,entry.user_id).tournament_id=None
        db.flush();return tournament_view(db,t)
