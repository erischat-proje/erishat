"""Transactional anonymous matchmaking, shared timers and mutual profile consent."""
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, and_, delete, func, or_, select, text
from sqlalchemy.orm import Mapped, Session, mapped_column
from .db import Base, get_db
from .models import User
from .platform_models import DirectCall, UserBlock
from .admin_models import AdminRole
from .moderation import active_ban, require_feature

router = APIRouter(prefix='/v1/anonymous-calls', tags=['anonymous-calls'])
_current_user = None
ISTANBUL = ZoneInfo('Europe/Istanbul')

def register_auth(fn):
    global _current_user
    _current_user = fn

def authenticated(db: Session = Depends(get_db), authorization: str | None = Header(None), request: Request = None):
    return _current_user(db, authorization, request)

class Account(Base):
    __tablename__ = 'anonymous_call_accounts'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    day: Mapped[str] = mapped_column(String(10))
    used: Mapped[int] = mapped_column(Integer, default=0)
    premium_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class Queue(Base):
    __tablename__ = 'anonymous_call_queue'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    mode: Mapped[str] = mapped_column(String(8), index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

class Call(Base):
    __tablename__ = 'anonymous_calls'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    mode: Mapped[str] = mapped_column(String(8))
    first_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    second_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    status: Mapped[str] = mapped_column(String(12), default='active', index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    second_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    profile_status: Mapped[str] = mapped_column(String(12), default='none')
    profile_requester: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reason: Mapped[str] = mapped_column(String(24), default='')

class Signal(Base):
    __tablename__ = 'anonymous_call_signals'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    call_id: Mapped[str] = mapped_column(ForeignKey('anonymous_calls.id', ondelete='CASCADE'), index=True)
    sender_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    kind: Mapped[str] = mapped_column(String(12))
    payload: Mapped[str] = mapped_column(Text)

class Extension(Base):
    __tablename__ = 'anonymous_call_extensions'
    __table_args__ = (UniqueConstraint('call_id', 'user_id', 'request_key', name='uq_anon_extension'),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    call_id: Mapped[str] = mapped_column(ForeignKey('anonymous_calls.id'))
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    request_key: Mapped[str] = mapped_column(String(64))
    seconds: Mapped[int] = mapped_column(Integer)

def now():
    return datetime.now(timezone.utc)

def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

def serialize(db):
    # One transaction lock across Railway workers protects quotas, matching and payments.
    if db.bind.dialect.name == 'postgresql':
        db.execute(text('SELECT pg_advisory_xact_lock(731905240)'))
    elif db.bind.dialect.name == 'sqlite' and not db.connection().connection.driver_connection.in_transaction:
        db.execute(text('BEGIN IMMEDIATE'))

def account(db, uid):
    day = now().astimezone(ISTANBUL).date().isoformat()
    row = db.get(Account, uid)
    if not row:
        row = Account(user_id=uid, day=day, used=0)
        db.add(row)
        db.flush()
    if row.day != day:
        row.day, row.used = day, 0
    return row

def premium(row):
    return bool(row.premium_until and utc(row.premium_until) > now())

def quota(db, uid):
    row = account(db, uid)
    paid = premium(row)
    maximum = 20 if paid else 10
    return {'premium': paid, 'premium_until': utc(row.premium_until).isoformat() if paid else None,
            'used': row.used, 'daily_limit': maximum, 'remaining': max(0, maximum-row.used), 'initial_seconds': 120 if paid else 60}

def user_busy(db, uid):
    return db.scalar(select(Call.id).where(Call.status == 'active', or_(Call.first_id == uid, Call.second_id == uid)).limit(1))

def direct_busy(db, uid):
    return db.scalar(select(DirectCall.id).where(DirectCall.status.in_(('ringing', 'active')),
                                              or_(DirectCall.caller_id == uid, DirectCall.callee_id == uid)).limit(1))

def blocked(db, a, b):
    return bool(db.scalar(select(UserBlock.id).where(or_(and_(UserBlock.blocker_id == a, UserBlock.blocked_id == b),
                                                           and_(UserBlock.blocker_id == b, UserBlock.blocked_id == a)))))

def available(db, uid):
    user, role = db.get(User, uid), db.get(AdminRole, uid)
    if not user or not user.is_active or (role and role.role == 'DA' and role.ghost_mode):
        return False
    if active_ban(db, uid) or active_ban(db, uid, chat=True):
        return False
    from . import ban_workflow, support_workflow
    return not ban_workflow.restriction(db, uid) and not support_workflow.remaining_restriction(db, uid)

def expire(db):
    instant = now()
    db.execute(delete(Queue).where(Queue.expires_at <= instant).execution_options(synchronize_session='fetch'))
    for queued in db.scalars(select(Queue)):
        if not available(db, queued.user_id) or quota(db, queued.user_id)['remaining'] <= 0:
            db.delete(queued)
    for call in db.scalars(select(Call).where(Call.status == 'active')):
        reason = ''
        if utc(call.ends_at) <= instant:
            reason = 'time'
        elif min(utc(call.first_seen), utc(call.second_seen)) < instant-timedelta(seconds=25):
            reason = 'disconnected'
        elif not available(db, call.first_id) or not available(db, call.second_id) or blocked(db, call.first_id, call.second_id):
            reason = 'unavailable'
        if reason:
            call.status, call.reason = 'ended', reason
    db.flush()

def owned_call(db, cid, uid):
    call = db.get(Call, cid)
    if not call or uid not in (call.first_id, call.second_id):
        raise HTTPException(404, 'Arama bulunamadı.')
    return call

def summary(db, call, uid):
    status = ('preparing' if now() < utc(call.starts_at) else 'active') if call.status == 'active' else 'ended'
    item = {'id': call.id, 'mode': call.mode, 'status': status, 'starts_at': utc(call.starts_at).isoformat(),
            'ends_at': utc(call.ends_at).isoformat(), 'server_now': now().isoformat(), 'initiator': uid == call.first_id,
            'profile_status': call.profile_status, 'profile_incoming': call.profile_status == 'pending' and call.profile_requester != uid,
            'profile_outgoing': call.profile_requester == uid, 'reason': call.reason}
    if call.profile_status == 'accepted':
        peer = db.get(User, call.second_id if uid == call.first_id else call.first_id)
        item['peer'] = {'user_id': peer.id, 'nickname': peer.nickname}
    return item

def count(db, mode):
    queued = db.scalar(select(func.count()).select_from(Queue).where(Queue.mode == mode)) or 0
    active = db.scalar(select(func.count()).select_from(Call).where(Call.mode == mode, Call.status == 'active')) or 0
    return int(queued + active*2)

def state(db, user, mode='voice'):
    call = db.scalar(select(Call).where(Call.status == 'active', or_(Call.first_id == user.id, Call.second_id == user.id)))
    queue = db.get(Queue, user.id)
    return {'quota': quota(db, user.id), 'queued': bool(queue), 'mode': queue.mode if queue else None,
            'active_users': count(db, queue.mode if queue else call.mode if call else mode), 'call': summary(db, call, user.id) if call else None}

def charge(db, uid, amount, operation, reference):
    user = db.scalar(select(User).where(User.id == uid).with_for_update().execution_options(populate_existing=True))
    if user.lidya < amount:
        raise HTTPException(402, f'{amount} Lidya gerekli.')
    user.lidya -= amount
    db.info.update(lidya_operation=operation, lidya_actor_id=uid, lidya_reference_id=reference)
    db.flush()
    for key in ('lidya_operation', 'lidya_actor_id', 'lidya_reference_id'):
        db.info.pop(key, None)

class Join(BaseModel):
    mode: str = Field(pattern='^(voice|video)$')
class SignalIn(BaseModel):
    kind: str = Field(pattern='^(offer|answer|ice)$')
    payload: dict
class Extend(BaseModel):
    request_key: str = Field(min_length=16, max_length=64, pattern=r'^[A-Za-z0-9_-]+$')
class Response(BaseModel):
    action: str = Field(pattern='^(accept|reject)$')

@router.get('/status')
def status(mode: str = Query('voice', pattern='^(voice|video)$'), db: Session = Depends(get_db), user: User = Depends(authenticated)):
    serialize(db)
    expire(db)
    result = state(db, user, mode)
    db.commit()
    return result

@router.post('/premium')
def buy_premium(db: Session = Depends(get_db), user: User = Depends(authenticated)):
    serialize(db)
    row = account(db, user.id)
    if not premium(row):
        charge(db, user.id, 500, 'anonymous_premium', now().astimezone(ISTANBUL).date().isoformat())
        row.premium_until = (now().astimezone(ISTANBUL).replace(hour=0, minute=0, second=0, microsecond=0)+timedelta(days=1)).astimezone(timezone.utc)
    result = quota(db, user.id)
    db.commit()
    return result

@router.post('/queue')
def join(body: Join, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    from .call_routes import expire as expire_direct_calls
    expire_direct_calls(db)
    serialize(db)
    expire(db)
    require_feature(db, user.id)
    if not available(db, user.id):
        raise HTTPException(403, 'Bu durumda anonim aramaya katılamazsınız.')
    existing = user_busy(db, user.id)
    if existing:
        result = {'call': summary(db, db.get(Call, existing), user.id)}
        db.commit()
        return result
    if direct_busy(db, user.id):
        raise HTTPException(409, 'Önce devam eden aramanızı kapatın.')
    if quota(db, user.id)['remaining'] <= 0:
        raise HTTPException(403, 'Günlük arama hakkınız doldu.')
    row = db.get(Queue, user.id)
    if row and row.mode != body.mode:
        raise HTTPException(409, 'Önce diğer arama kuyruğundan çıkın.')
    if not row:
        row = Queue(user_id=user.id, mode=body.mode, joined_at=now(), expires_at=now())
        db.add(row)
    row.expires_at = now()+timedelta(seconds=25)
    db.flush()
    peer = None
    for candidate in db.scalars(select(Queue).where(Queue.mode == body.mode, Queue.user_id != user.id, Queue.expires_at > now()).order_by(Queue.joined_at, Queue.user_id)):
        if not available(db, candidate.user_id) or quota(db, candidate.user_id)['remaining'] <= 0 or user_busy(db, candidate.user_id):
            db.delete(candidate)
            continue
        if direct_busy(db, candidate.user_id) or blocked(db, user.id, candidate.user_id):
            continue
        peer = candidate
        break
    call = None
    if peer:
        seconds = max(quota(db, user.id)['initial_seconds'], quota(db, peer.user_id)['initial_seconds'])
        starts = now()+timedelta(seconds=3)
        call = Call(id=str(uuid4()), mode=body.mode, first_id=peer.user_id, second_id=user.id, status='active', starts_at=starts,
                    ends_at=starts+timedelta(seconds=seconds), first_seen=now(), second_seen=now(), profile_status='none', reason='')
        db.add(call)
        account(db, user.id).used += 1
        account(db, peer.user_id).used += 1
        db.delete(row)
        db.delete(peer)
        db.flush()
    result = {'queued': call is None, 'active_users': count(db, body.mode), 'call': summary(db, call, user.id) if call else None, 'quota': quota(db, user.id)}
    db.commit()
    return result

@router.post('/heartbeat')
def heartbeat(db: Session = Depends(get_db), user: User = Depends(authenticated)):
    serialize(db)
    expire(db)
    row = db.get(Queue, user.id)
    if row:
        row.expires_at = now()+timedelta(seconds=25)
    result = state(db, user, row.mode if row else 'voice')
    db.commit()
    return result

@router.post('/cancel')
def cancel(db: Session = Depends(get_db), user: User = Depends(authenticated)):
    serialize(db)
    db.execute(delete(Queue).where(Queue.user_id == user.id))
    for call in db.scalars(select(Call).where(Call.status == 'active', or_(Call.first_id == user.id, Call.second_id == user.id))):
        call.status, call.reason = 'ended', 'hangup'
    db.commit()
    return {'ok': True}

@router.get('/{cid}/events')
def events(cid: str, after: int = Query(0, ge=0), db: Session = Depends(get_db), user: User = Depends(authenticated)):
    serialize(db)
    expire(db)
    call = owned_call(db, cid, user.id)
    if call.status == 'active':
        if user.id == call.first_id:
            call.first_seen = now()
        else:
            call.second_seen = now()
    rows = list(db.scalars(select(Signal).where(Signal.call_id == cid, Signal.id > after).order_by(Signal.id).limit(100)))
    result = {'call': summary(db, call, user.id), 'events': [{'kind': r.kind, 'payload': json.loads(r.payload)} for r in rows if r.sender_id != user.id],
              'cursor': rows[-1].id if rows else after, 'active_users': count(db, call.mode)}
    db.commit()
    return result

@router.post('/{cid}/signals')
def signal(cid: str, body: SignalIn, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    serialize(db)
    expire(db)
    call = owned_call(db, cid, user.id)
    if call.status != 'active':
        raise HTTPException(409, 'Arama sona erdi.')
    if (body.kind == 'offer' and user.id != call.first_id) or (body.kind == 'answer' and user.id != call.second_id):
        raise HTTPException(403, 'Sinyal sırası geçersiz.')
    encoded = json.dumps(body.payload)
    if len(encoded) > 20000:
        raise HTTPException(413, 'Arama sinyali fazla büyük.')
    db.add(Signal(call_id=cid, sender_id=user.id, kind=body.kind, payload=encoded))
    db.commit()
    return {'ok': True}

@router.post('/{cid}/extend')
def extend(cid: str, body: Extend, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    serialize(db)
    expire(db)
    call = owned_call(db, cid, user.id)
    prior = db.scalar(select(Extension).where(Extension.call_id == cid, Extension.user_id == user.id, Extension.request_key == body.request_key))
    if prior:
        result = {'seconds': prior.seconds, 'call': summary(db, call, user.id)}
        db.commit()
        return result
    if call.status != 'active' or now() < utc(call.starts_at):
        raise HTTPException(409, 'Aktif görüşme gerekli.')
    seconds = 240 if premium(account(db, user.id)) else 120
    charge(db, user.id, 100, 'anonymous_extra_time', cid)
    call.ends_at = utc(call.ends_at)+timedelta(seconds=seconds)
    db.add(Extension(call_id=cid, user_id=user.id, request_key=body.request_key, seconds=seconds))
    result = {'seconds': seconds, 'call': summary(db, call, user.id)}
    db.commit()
    return result

@router.post('/{cid}/profile-request')
def profile_request(cid: str, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    serialize(db)
    expire(db)
    call = owned_call(db, cid, user.id)
    if call.status != 'active' or now() < utc(call.starts_at):
        raise HTTPException(409, 'Aktif görüşme gerekli.')
    if call.profile_status in ('pending', 'accepted'):
        raise HTTPException(409, 'Profil isteği zaten mevcut.')
    call.profile_status, call.profile_requester = 'pending', user.id
    db.commit()
    return {'ok': True}

@router.post('/{cid}/profile-response')
def profile_response(cid: str, body: Response, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    serialize(db)
    expire(db)
    call = owned_call(db, cid, user.id)
    if call.status != 'active' or call.profile_status != 'pending' or call.profile_requester == user.id:
        raise HTTPException(409, 'Yanıtlanabilir profil isteği yok.')
    call.profile_status = 'accepted' if body.action == 'accept' else 'rejected'
    result = summary(db, call, user.id)
    db.commit()
    return result
