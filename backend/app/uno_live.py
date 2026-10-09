"""Persistent, room-scoped UNO. Room row mutex serializes all room games."""
from __future__ import annotations
import asyncio
import hashlib
import json
import logging
import time
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import ForeignKey, String, Text, select, delete
from sqlalchemy.orm import Mapped, Session, mapped_column
from .db import Base, SessionLocal, get_db
from .models import User
from .room_models import Room, RoomSeat
from . import room_routes as rooms, uno_engine as rules

router = APIRouter(prefix='/v1/rooms', tags=['room-uno'])
log = logging.getLogger('erischat.uno')
ACTIVE = ('lobby', 'playing', 'hand_finished')
STAKES = (50, 100, 150, 200, 250, 300)

class RoomUno(Base):
    __tablename__ = 'room_uno'
    room_id: Mapped[str] = mapped_column(ForeignKey('rooms.id', ondelete='CASCADE'), primary_key=True)
    round_id: Mapped[str] = mapped_column(String(36), nullable=False)
    status: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    state_json: Mapped[str] = mapped_column(Text, nullable=False)

class UnoReceipt(Base):
    __tablename__ = 'room_uno_receipts'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    room_id: Mapped[str] = mapped_column(ForeignKey('rooms.id', ondelete='CASCADE'), index=True)
    round_id: Mapped[str] = mapped_column(String(36), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)

class Action(BaseModel):
    action: Literal['create','ready','withdraw','start','play','draw','pass','color','uno','catch',
                    'challenge','accept4','next_hand','close','configure']
    request_key: str = Field(min_length=16, max_length=64)
    round_id: str = Field(default='', max_length=36)
    version: int = Field(default=0, ge=0)
    mode: Literal['solo','paired'] = 'solo'
    victory: Literal['quick','points'] = 'quick'
    card: int | None = Field(default=None, ge=0, le=108)
    target: int | None = Field(default=None, ge=1, le=4)
    color: Literal['red','yellow','green','blue'] | None = None
    call_uno: bool = False
    stake: int = Field(default=50, ge=50, le=300)

def dumps(s):
    return json.dumps(s, separators=(',', ':'), ensure_ascii=False)

def can_manage(db, room, user):
    for check in (rooms.require_staff, rooms.require_owner):
        try:
            check(db, room, user)
            return True
        except HTTPException:
            pass
    return False

def occupants(db, rid):
    return dict(db.execute(select(RoomSeat.seat_number, RoomSeat.user_id).where(
        RoomSeat.room_id == rid, RoomSeat.seat_number <= 4, RoomSeat.user_id.is_not(None))).all())

def present(db, rid, p, seats):
    return seats.get(p['seat']) == p['user_id'] and rooms.is_member(db, rid, p['user_id']) and not rooms.ghost_active(db, p['user_id'])

def save(row, s):
    row.round_id, row.status, row.state_json = s['round_id'], s['status'], dumps(s)

def assert_other_games_closed(db, rid):
    from .ludo_live import RoomLudo
    from .okey101_live import RoomOkey101
    for model, label in ((RoomLudo, 'Ludo'), (RoomOkey101, '101 Okey')):
        other = db.get(model, rid)
        if other and other.status in ACTIVE:
            raise HTTPException(409, f'Önce odadaki {label} oyununu kapatın.')

def lock_players(db, ids):
    return {u.id: u for u in db.scalars(select(User).where(User.id.in_(sorted(ids)))
            .order_by(User.id).with_for_update().execution_options(populate_existing=True))}

def roster(s):
    return {p['user_id'] for p in s['players']}

def refund(db, s):
    if s.get('settled'):
        return
    users = lock_players(db, roster(s))
    for p in s['players']:
        users[p['user_id']].lidya += p.get('stake', 0)
    s.update(settled=True, refunded=True, payouts={})

def settle(db, s):
    if s['status'] != 'finished' or s.get('settled'):
        return
    winners = [p for p in s['players'] if p['seat'] in s['winners']]
    pool = sum(p.get('stake', 0) for p in s['players'])
    if not winners or pool % len(winners):
        raise RuntimeError('UNO ödeme hesabı geçersiz.')
    users = lock_players(db, roster(s))
    amount = pool // len(winners)
    for p in winners:
        users[p['user_id']].lidya += amount
    s.update(settled=True, refunded=False, pool=pool,
             payouts={str(p['seat']): amount for p in winners})

def resolve(db, rid, user, lock=False):
    room = rooms.get_room_or_404(db, rid)
    if lock:
        preliminary = db.get(RoomUno, room.id)
        previous = json.loads(preliminary.state_json) if preliminary else {'players': []}
        ids = roster(previous) | {user.id}
        db.info['uno_locked_accounts'] = lock_players(db, ids)
        db.info['uno_locked_users'] = ids
        # All currency operations use user rows first, room row second.
        room = db.scalar(select(Room).where(Room.id == room.id).with_for_update().execution_options(populate_existing=True))
        if preliminary:
            db.expire(preliminary)
    if not rooms.is_member(db, room.id, user.id):
        raise HTTPException(403, 'UNO yalnızca odanın üyelerine açıktır.')
    return room

def view(db, room, row, user):
    s = json.loads(row.state_json) if row else None
    seats = []
    for n, uid in occupants(db, room.id).items():
        u = db.get(User, uid)
        if u and rooms.is_member(db, room.id, uid) and not rooms.ghost_active(db, uid):
            seats.append(dict(seat=n, user_id=uid, name=u.nickname))
    from .ludo_live import RoomLudo
    from .okey101_live import RoomOkey101
    blocked_by = None
    for model, label in ((RoomLudo, 'Ludo'), (RoomOkey101, '101 Okey')):
        other = db.get(model, room.id)
        if other and other.status in ACTIVE:
            blocked_by = label
            break
    return dict(state=rules.public_state(s, user.id), seats=seats, my_id=user.id,
                can_manage=can_manage(db, room, user), balance=user.lidya, stakes=list(STAKES),
                blocked_by=blocked_by, server_time=time.time())

def sync_presence(db, room, s, now):
    seats = occupants(db, room.id)
    changed = False
    for p in s['players']:
        if present(db, room.id, p, seats):
            if p.get('disconnected_at') is not None or p.get('bot'):
                p.update(disconnected_at=None, bot=False)
                changed = True
        elif p.get('disconnected_at') is None:
            p['disconnected_at'] = now
            changed = True
        elif now - p['disconnected_at'] >= 60 and not p.get('bot'):
            p['bot'] = True
            changed = True
    if changed:
        rules.event(s, 'presence')

@router.get('/{room_id}/uno')
def snapshot(room_id: str, db: Session = Depends(get_db), user: User = Depends(rooms.current_user_dependency)):
    room = resolve(db, room_id, user)
    return view(db, room, db.get(RoomUno, room.id), user)

@router.post('/{room_id}/uno')
def mutate(room_id: str, payload: Action, db: Session = Depends(get_db), user: User = Depends(rooms.current_user_dependency)):
    room = resolve(db, room_id, user, lock=True)
    user = db.info['uno_locked_accounts'][user.id]
    rooms.reject_ghost(db, user, 'UNO oynamak')
    row = db.get(RoomUno, room.id)
    s = json.loads(row.state_json) if row else None
    if s and not roster(s).issubset(db.info['uno_locked_users']):
        raise HTTPException(409, 'Katılımcılar güncellendi; tekrar deneyin.')
    receipt_id = hashlib.sha256(f'{room.id}:{user.id}:{payload.request_key}'.encode()).hexdigest()
    fingerprint = hashlib.sha256(dumps(payload.model_dump()).encode()).hexdigest()
    receipt = db.get(UnoReceipt, receipt_id)
    if receipt:
        if receipt.fingerprint != fingerprint:
            raise HTTPException(409, 'İstek anahtarı başka işlemde kullanılmış.')
        if not s or receipt.round_id != s['round_id']:
            raise HTTPException(409, 'Bu istek önceki oyuna ait.')
        return view(db, room, row, user)
    now = time.time()
    staff = can_manage(db, room, user)
    seats = occupants(db, room.id)
    seat = next((n for n, uid in seats.items() if uid == user.id), None)
    try:
        if payload.action == 'create':
            if not staff and seat is None:
                raise HTTPException(403, 'Oyun kurmak için ilk dört koltuktan birine oturun.')
            if s and s['status'] in ACTIVE:
                raise HTTPException(409, 'Bu odada açık bir UNO oyunu var.')
            assert_other_games_closed(db, room.id)
            if payload.stake not in STAKES:
                raise rules.RuleError('50–300 Lidya seçeneklerinden birini seçin.')
            if s:
                settle(db, s)
            s = rules.new_game(user.id, payload.mode, payload.victory, now)
            s.update(stake=payload.stake, pool=0, settled=False, refunded=False, payouts={})
            rules.event(s, 'lobby')
            db.execute(delete(UnoReceipt).where(UnoReceipt.room_id == room.id))
            if not row:
                row = RoomUno(room_id=room.id, round_id=s['round_id'], status='lobby', state_json=dumps(s))
                db.add(row)
        else:
            if not s or payload.round_id != s['round_id']:
                raise HTTPException(409, 'Oyun değişti; güncel oyunu açın.')
            # UNO/catch races are resolved under the room lock against current state.
            if payload.action not in ('uno', 'catch') and payload.version != s['version']:
                raise HTTPException(409, 'Oyun güncellendi; tekrar deneyin.')
            p = next((p for p in s['players'] if p['user_id'] == user.id), None)
            controls = staff or user.id == s['host']
            if payload.action == 'close':
                if not controls:
                    raise HTTPException(403, 'Oyun kurucusu veya oda yönetimi kapatabilir.')
                refund(db, s)
                s['status'] = 'closed'
                rules.event(s, 'close')
            elif payload.action == 'configure':
                if not controls or s['status'] != 'lobby':
                    raise HTTPException(403, 'Ayarları lobi kurucusu veya oda yönetimi değiştirebilir.')
                if s['players']:
                    raise rules.RuleError('Ayar değiştirmek için herkes hazırdan çıkmalı.')
                if payload.stake not in STAKES:
                    raise rules.RuleError('Geçerli bahis seçin.')
                s.update(mode=payload.mode, victory=payload.victory, stake=payload.stake)
                rules.event(s, 'configure')
            elif payload.action in ('ready', 'withdraw'):
                if s['status'] != 'lobby':
                    raise rules.RuleError('Oyun başlamış.')
                if payload.action == 'withdraw':
                    if p:
                        user.lidya += p.get('stake', 0)
                        s['players'].remove(p)
                        s['pool'] = sum(q.get('stake', 0) for q in s['players'])
                        rules.event(s, 'withdraw', seat=p['seat'])
                else:
                    if seat is None:
                        raise rules.RuleError('İlk dört koltuktan birine oturun.')
                    if p:
                        if p['seat'] != seat:
                            raise rules.RuleError('Önce hazır durumundan çıkın.')
                    elif any(p['seat'] == seat for p in s['players']):
                        raise rules.RuleError('Bu oyun koltuğu dolu; lobi yenilenmesini bekleyin.')
                    else:
                        stake = s.get('stake', 0)
                        if payload.stake != stake and stake:
                            raise HTTPException(409, 'Bahis değişti; güncel tutarı onaylayın.')
                        if user.lidya < stake:
                            raise rules.RuleError('Lidya bakiyeniz yetersiz.')
                        user.lidya -= stake
                        s['players'].append(dict(seat=seat, user_id=user.id, name=user.nickname, stake=stake,
                           team=1 if seat in (1,3) else 2, hand=[], uno=False, bot=False, disconnected_at=None))
                        s['pool'] = sum(q.get('stake', 0) for q in s['players'])
                        rules.event(s, 'ready', seat=seat)
            elif payload.action in ('start', 'next_hand'):
                if not controls:
                    raise HTTPException(403, 'Oyun kurucusu veya oda yönetimi başlatabilir.')
                expected = 'lobby' if payload.action == 'start' else 'hand_finished'
                if s['status'] != expected:
                    raise rules.RuleError('Oyun bu işleme hazır değil.')
                if not all(present(db, room.id, p, seats) for p in s['players']):
                    raise rules.RuleError('Bütün oyuncular koltuklarında olmalı.')
                if any(q.get('stake', 0) != s.get('stake', 0) for q in s['players']):
                    raise rules.RuleError('Tüm oyuncular aynı bahisle katılmalı.')
                assert_other_games_closed(db, room.id)
                s.pop('challenge_reveal', None)
                rules.start_hand(s, now)
            else:
                if not p or not present(db, room.id, p, seats):
                    raise HTTPException(403, 'Bu oyunda aktif oyuncu değilsiniz.')
                if s['status'] != 'playing':
                    raise rules.RuleError('Aktif el yok.')
                if now >= s['deadline'] and payload.action not in ('uno', 'catch'):
                    # Worker will advance it; an expired client cannot steal a turn.
                    raise HTTPException(409, 'Hamle süresi doldu; oyun yenileniyor.')
                n = p['seat']
                action = payload.action
                if action == 'play': rules.play(s, n, payload.card, payload.color, payload.call_uno, now, swap_target=payload.target)
                elif action == 'draw': rules.draw(s, n, now)
                elif action == 'pass': rules.pass_turn(s, n, now)
                elif action == 'color': rules.choose_color(s, n, payload.color, now)
                elif action == 'uno': rules.call(s, n)
                elif action == 'catch': rules.catch(s, n)
                elif action in ('challenge', 'accept4'): rules.answer_draw4(s, n, action == 'challenge', now)
    except rules.RuleError as e:
        raise HTTPException(400, str(e)) from e
    settle(db, s)
    save(row, s)
    db.add(UnoReceipt(id=receipt_id, room_id=room.id, round_id=s['round_id'], fingerprint=fingerprint))
    db.commit()
    return view(db, room, row, user)

def tick_room(rid, now):
    with SessionLocal() as db:
        preliminary = db.get(RoomUno, rid)
        if not preliminary or preliminary.status not in ACTIVE:
            return
        ids = roster(json.loads(preliminary.state_json))
        lock_players(db, ids)
        room = db.scalar(select(Room).where(Room.id == rid).with_for_update())
        db.expire(preliminary)
        row = db.get(RoomUno, rid)
        if not room or not row or row.status not in ACTIVE:
            return
        s = json.loads(row.state_json)
        if not roster(s).issubset(ids):
            return
        before = dumps(s)
        house = rooms.couple_gifts.room_house(db, rid)
        if house and not house.active:
            refund(db, s)
            s['status'] = 'closed'
            rules.event(s, 'close', reason='Çift odası kapandı.')
        elif s['status'] == 'lobby':
            seats = occupants(db, rid)
            available = [p for p in s['players'] if present(db, rid, p, seats)]
            if len(available) != len(s['players']):
                users = lock_players(db, ids)
                for p in s['players']:
                    if p not in available:
                        users[p['user_id']].lidya += p.get('stake', 0)
                s['players'] = available
                s['pool'] = sum(p.get('stake', 0) for p in available)
                rules.event(s, 'withdraw')
            if now >= s['expires']:
                refund(db, s)
                s['status'] = 'closed'
                rules.event(s, 'close', reason='Hazırlık süresi doldu.')
        else:
            sync_presence(db, room, s, now)
            if s['status'] == 'playing':
                p = rules.player(s, s['turn'])
                if now >= s['deadline'] or p.get('bot') and now >= s['deadline'] - rules.TURN_SECONDS + 2:
                    rules.timeout(s, now, bot=p.get('bot', False))
            elif s['status'] == 'hand_finished' and now >= (s.get('hand_expires') or 0):
                # Preserve scores briefly between hands; do not lock the room forever.
                if not s.get('hand_expires'):
                    s['hand_expires'] = now+600
                    rules.event(s, 'pause')
                else:
                    refund(db, s)
                    s['status'] = 'closed'
                    rules.event(s, 'close', reason='Sonraki el başlatılmadı.')
        settle(db, s)
        if dumps(s) != before:
            save(row, s)
            db.commit()

def tick():
    with SessionLocal() as db:
        ids = list(db.scalars(select(RoomUno.room_id).where(RoomUno.status.in_(ACTIVE))))
    for rid in ids:
        try:
            tick_room(rid, time.time())
        except Exception:
            log.exception('UNO tick failed: %s', rid)

async def routing_loop():
    while True:
        await asyncio.to_thread(tick)
        await asyncio.sleep(1)
