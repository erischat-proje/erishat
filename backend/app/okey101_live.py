"""Persistent room-only 101 Okey, transactional escrow, restart-safe bot scheduler."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import ForeignKey, String, Text, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .db import Base, SessionLocal, get_db
from .models import User
from .room_models import Room, RoomSeat, RoomMember
from . import okey101_engine as rules, room_routes as rooms

router = APIRouter(prefix='/v1/rooms', tags=['room-okey101'])
log = logging.getLogger('erischat.okey101')

class RoomOkey101(Base):
    __tablename__ = 'room_okey101'
    room_id: Mapped[str] = mapped_column(ForeignKey('rooms.id', ondelete='CASCADE'), primary_key=True)
    round_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    state_json: Mapped[str] = mapped_column(Text, nullable=False)

class Okey101Receipt(Base):
    __tablename__ = 'room_okey101_receipts'
    # Includes round and actor: a retry can never mutate a different match.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    response_json: Mapped[str] = mapped_column(Text, nullable=False)

class Action(BaseModel):
    action: Literal['create','ready','withdraw','start','draw','open','return_discard','preview_lay','auto_lay','lay','replace','discard','close','configure','restart']
    round_id: str = Field(default='', max_length=36)
    version: int = Field(default=0, ge=0)
    request_key: str = Field(min_length=16, max_length=64)
    mode: Literal['solo','paired'] = 'solo'
    source: Literal['stock','discard'] = 'stock'
    tile: int = Field(default=0, ge=0, le=105)
    groups: list[dict] = Field(default_factory=list, max_length=14)
    meld_id: str = Field(default='', max_length=12)
    end: Literal['left','right'] = 'right'
    face: list[int] | None = Field(default=None, min_length=2, max_length=2)
    index: int = Field(default=0, ge=0, le=12)
    penalties: bool = True
    tiles: list[int] | None = Field(default=None, max_length=22)
    plan: list[dict] | None = Field(default=None, max_length=21)
    progressive: bool = False
    hand_count: Literal[1,3,5,7] = 3
    finish_tile: int | None = Field(default=None, ge=0, le=105)
    stake: int = 50

def dumps(value):
    return json.dumps(value, separators=(',',':'), ensure_ascii=False)

def can_manage(db, room, user):
    try:
        rooms.require_staff(db, room, user)
        return True
    except HTTPException:
        # Both partners own a shared couple room.
        try:
            rooms.require_owner(db, room, user)
            return True
        except HTTPException:
            return False

def occupants(db, rid):
    return {n:uid for n,uid in db.execute(select(RoomSeat.seat_number,RoomSeat.user_id).where(
        RoomSeat.room_id==rid,RoomSeat.seat_number<=4,RoomSeat.user_id.is_not(None)))}

def present(db, rid, p, seats):
    return seats.get(p['seat'])==p['user_id'] and rooms.is_member(db,rid,p['user_id']) and not rooms.ghost_active(db,p['user_id'])

def save(row, s):
    row.status=s['status']
    row.state_json=dumps(s)

def users_for_money(db, s):
    ids=sorted({p['user_id'] for p in s['players']})
    return {u.id:u for u in db.scalars(select(User).where(User.id.in_(ids)).order_by(User.id).with_for_update().execution_options(populate_existing=True))}

def refund(db, s):
    if s.get('settled'):
        return
    users=users_for_money(db,s)
    for p in s['players']:
        users[p['user_id']].lidya += p['stake']
    s.update(settled=True, refunded=True)

def settle(db, s):
    if s['status']!='finished' or s.get('settled'):
        return
    users=users_for_money(db,s)
    winners=[p for p in s['players'] if p['seat'] in s['winners']]
    pool=sum(p['stake'] for p in s['players'])
    assert winners
    payouts={}
    for i,p in enumerate(sorted(winners,key=lambda p:p['seat'])):
        amount=pool//len(winners)+(i<pool%len(winners))
        users[p['user_id']].lidya += amount
        payouts[str(p['seat'])]=amount
    s.update(settled=True,payouts=payouts,pool=pool)

def view(db, room, row, user):
    state=json.loads(row.state_json) if row else None
    seats=occupants(db,room.id)
    cards=[]
    for seat,uid in seats.items():
        u=db.get(User,uid)
        if u and rooms.is_member(db,room.id,uid) and not rooms.ghost_active(db,uid):
            cards.append(dict(seat=seat,user_id=uid,name=u.nickname,avatar=u.avatar))
    safe=rules.public(state,user.id) if state else None
    suggestions=[]
    pair_suggestions=[]
    lay_options=[]
    can_return_discard=False
    if state and state['status']=='playing':
        p=next((p for p in state['players'] if p['user_id']==user.id),None)
        if p:
            suggestions=rules.candidate_groups(state,p['hand'])
            pair_suggestions=rules.candidate_groups(state,p['hand'],True)
            if state['turn']==p['seat'] and state['phase']=='discard':
                lay_options=rules.legal_lays(state,p['seat'])
                can_return_discard=state.get('taken') in p['hand']
    return dict(state=safe,seats=cards,my_id=user.id,balance=user.lidya,
                can_manage=can_manage(db,room,user),unlocked=room.level>=4,
                suggestions=suggestions,pair_suggestions=pair_suggestions,lay_options=lay_options,can_return_discard=can_return_discard,server_time=time.time())

def resolve(db,rid,user,lock=False):
    # Existing room lookup refreshes authoritative level before locking.
    room=rooms.get_room_or_404(db,rid)
    if not rooms.is_member(db,room.id,user.id):
        raise HTTPException(403,'101 Okey yalnızca odanın üyelerine açıktır.')
    if lock:
        preliminary=db.get(RoomOkey101,room.id)
        previous=json.loads(preliminary.state_json) if preliminary else {'players':[]}
        ids=sorted({user.id,*[p['user_id'] for p in previous['players']]})
        # Currency rows precede the room mutex, matching the other gift/payment flows.
        list(db.scalars(select(User).where(User.id.in_(ids)).order_by(User.id).with_for_update().execution_options(populate_existing=True)))
        db.info['okey101_locked_users']=set(ids)
        room=db.scalar(select(Room).where(Room.id==room.id).with_for_update().execution_options(populate_existing=True))
        if preliminary:db.expire(preliminary)
        # Membership may have changed while waiting for the room lock.
        if not rooms.is_member(db,room.id,user.id):
            raise HTTPException(403,'Önce odaya katılın.')
    return room

@router.get('/{room_id}/okey101')
def snapshot(room_id:str, db:Session=Depends(get_db), user:User=Depends(rooms.current_user_dependency)):
    room=resolve(db,room_id,user)
    return view(db,room,db.get(RoomOkey101,room.id),user)

@router.post('/{room_id}/okey101')
def mutate(room_id:str, payload:Action, db:Session=Depends(get_db), user:User=Depends(rooms.current_user_dependency)):
    room=resolve(db,room_id,user,lock=True)
    rooms.reject_ghost(db,user,'101 Okey oynamak')
    receipt_id=hashlib.sha256(f'{room.id}:{user.id}:{payload.request_key}'.encode()).hexdigest()
    fingerprint=hashlib.sha256(dumps(payload.model_dump()).encode()).hexdigest()
    receipt=db.get(Okey101Receipt,receipt_id)
    if receipt:
        if receipt.fingerprint!=fingerprint:
            raise HTTPException(409,'İstek anahtarı başka işlemde kullanılmış.')
        return json.loads(receipt.response_json)
    row=db.get(RoomOkey101,room.id)
    s=json.loads(row.state_json) if row else None
    if s and not {p['user_id'] for p in s['players']}.issubset(db.info['okey101_locked_users']):
        raise HTTPException(409,'Katılımcılar güncellendi; tekrar deneyin.')
    seats=occupants(db,room.id)
    seat=next((n for n,uid in seats.items() if uid==user.id),None)
    staff=can_manage(db,room,user)
    if payload.action in ('create','restart'):
        if room.level<4:
            raise HTTPException(403,'101 Okey 4. oda seviyesinde açılır.')
        if not staff and seat is None:
            raise HTTPException(403,'İlk dört koltuktan birine oturun.')
        if s and s['status'] in ('lobby','playing','hand_finished'):
            raise HTTPException(409,'Bu odada zaten açık bir oyun var.')
        from .uno_live import RoomUno
        uno = db.get(RoomUno, room.id)
        if uno and uno.status in ('lobby','playing','hand_finished'):
            raise HTTPException(409, 'Önce odadaki UNO oyununu kapatın.')
        from .ludo_live import RoomLudo
        other=db.get(RoomLudo,room.id)
        if other and other.status in ('lobby','playing','hand_finished'):
            raise HTTPException(409,'Önce odadaki Ludo oyununu kapatın.')
        if payload.action=='restart':
            if not s or s['status']!='finished' or payload.round_id!=s['round_id'] or payload.version!=s['version']:
                raise HTTPException(409,'Tekrar için tamamlanmış güncel oyun gerekli.')
            if not staff and not any(p['user_id']==user.id for p in s['players']):
                raise HTTPException(403,'Tekrarı oyuncular veya oda yönetimi başlatabilir.')
            settle(db,s)
            new_mode=s['mode']
            new_stake=next((p['stake'] for p in s['players'] if p['seat']==1),50)
        else:
            new_mode=payload.mode
            new_stake=50
        s=dict(round_id=str(uuid4()),status='lobby',mode=new_mode,default_stake=new_stake,host=user.id,
               rules_version=2,version=0,players=[],events=[],settled=False,expires=time.time()+600,
               penalties=(s.get('penalties',False) if payload.action=='restart' else payload.penalties),
               progressive=(s['progressive'] if payload.action=='restart' else payload.progressive),
               hand_count=(s['hand_count'] if payload.action=='restart' else payload.hand_count))
        rules.event(s,'lobby')
        if not row:
            row=RoomOkey101(room_id=room.id,round_id=s['round_id'],status='lobby',state_json=dumps(s))
            db.add(row)
        else:
            row.round_id=s['round_id']
    else:
        if not s or payload.round_id!=s['round_id'] or payload.version!=s['version']:
            raise HTTPException(409,'Oyun güncellendi; tekrar deneyin.')
        p=next((p for p in s['players'] if p['user_id']==user.id),None)
        if payload.action=='configure':
            if s['status']!='lobby' or (user.id!=s['host'] and not staff):
                raise HTTPException(403,'Ayarları oyun kurucusu veya oda yönetimi değiştirebilir.')
            if s['players']:
                raise HTTPException(409,'Ayarları değiştirmeden önce hazır oyuncular katılımlarını geri almalı.')
            s.update(mode=payload.mode,progressive=payload.progressive,hand_count=payload.hand_count,penalties=payload.penalties)
            rules.event(s,'configure')
        elif payload.action=='close':
            if not staff:
                raise HTTPException(403,'Oyunu sadece oda sahibi veya moderatör kapatabilir.')
            refund(db,s)
            s['status']='closed'
            rules.event(s,'close')
        elif payload.action in ('ready','withdraw'):
            if s['status']!='lobby':
                raise HTTPException(409,'Oyun başlamış.')

            if payload.action=='ready':
                if seat is None or seat not in (1,2,3,4):
                    raise HTTPException(400,'İlk dört koltuktan birine oturun.')
                if payload.stake not in rules.STAKES:
                    raise HTTPException(400,'50–300 Lidya seçeneklerinden birini seçin.')

                # 1. koltuk oyunun zorunlu bahis değerini belirler.
                seat1=next((q for q in s['players'] if q['seat']==1),None)

                if seat != 1:
                    if not seat1:
                        raise HTTPException(409,'Önce 1. koltuktaki oyuncu oyun bahsini belirlemeli.')
                    if payload.stake != seat1['stake']:
                        raise HTTPException(
                            409,
                            f'Bu oyunun bahsi {seat1["stake"]} Lidya. Farklı bahis seçemezsiniz.'
                        )

                if any(q['seat']==seat and q['user_id']!=user.id for q in s['players']):
                    raise HTTPException(409,'Bu koltuğun önceki oyuncusunun iadesi bekleniyor.')

            users=users_for_money(db,s)
            actor=users.get(user.id) or db.scalar(
                select(User)
                .where(User.id==user.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )

            old=p['stake'] if p else 0
            new=payload.stake if payload.action=='ready' else 0

            # 1. koltuk hazır durumdan çekilirse bahis sahibi değişeceği için
            # tüm hazır oyuncuların stake'i iade edilir ve hazır listesi sıfırlanır.
            if payload.action=='withdraw' and p and p['seat']==1:
                refund_users=users_for_money(db,s)
                for q in s['players']:
                    refund_users[q['user_id']].lidya += q['stake']
                s['players']=[]
                rules.event(s,'ready',seat=1,reset=True)
            else:
                if actor.lidya+old<new:
                    raise HTTPException(400,'Lidya bakiyeniz yetersiz.')

                actor.lidya+=old-new
                s['players']=[q for q in s['players'] if q['user_id']!=user.id]

                if new:
                    s['players'].append(dict(
                        seat=seat,
                        user_id=user.id,
                        name=user.nickname,
                        avatar=user.avatar,
                        stake=new,
                        hand=[],score=0,opened=None,
                        bot=False
                    ))
                    rules.event(s,'ready',seat=seat)

        elif payload.action=='start':
            if s['status']!='lobby' or user.id!=s['host'] and not staff:
                raise HTTPException(403,'Başlatmayı oyun kurucusu veya oda yönetimi yapar.')
            if not all(present(db,room.id,q,seats) for q in s['players']):
                raise HTTPException(409,'Hazır oyuncular ilk dört koltukta bulunmalı.')

            # Bahsi 1. koltuk belirler; tüm hazır oyuncular aynı bahisle başlamalı.
            seat1 = next((q for q in s['players'] if q['seat'] == 1), None)
            if not seat1:
                raise HTTPException(409,'Oyunu başlatmak için 1. koltuk dolu olmalı.')

            if any(q['stake'] != seat1['stake'] for q in s['players']):
                raise HTTPException(
                    409,
                    '1. koltuğun belirlediği bahis tüm oyuncular için zorunludur.'
                )

            if len({q['stake'] for q in s['players']}) != 1:
                raise HTTPException(409,'Tüm oyuncular aynı bahisle oynamalı.')

            try:
                rules.begin(s)
            except (ValueError,KeyError,TypeError,IndexError) as e:
                raise HTTPException(400,str(e)) from e
            s['pool']=sum(q['stake'] for q in s['players'])
            s['bot_due']=time.time()+2
        else:
            if s['status']!='playing' or not p or p['seat']!=s['turn'] or not present(db,room.id,p,seats):
                raise HTTPException(403,'Sıra size ait değil veya koltuğunuzda değilsiniz.')
            p['bot']=False
            try:
                if payload.action=='draw':rules.draw(s,p['seat'],payload.source)
                elif payload.action=='return_discard':rules.return_discard(s,p['seat'])
                elif payload.action=='open':rules.declare_open(s,p['seat'],payload.groups,payload.finish_tile)
                elif payload.action=='preview_lay':
                    rules.check_turn(s,p['seat'])
                    response=view(db,room,row,user)
                    response['processing_plan']=rules.auto_plan(s,p['seat'],payload.tiles)
                    db.add(Okey101Receipt(id=receipt_id,fingerprint=fingerprint,response_json=dumps(response)))
                    db.commit()
                    return response
                elif payload.action=='auto_lay':rules.auto_lay(s,p['seat'],payload.tiles,payload.plan)
                elif payload.action=='lay':rules.lay(s,p['seat'],payload.tile,payload.meld_id,payload.end,payload.face)
                elif payload.action=='replace':rules.replace(s,p['seat'],payload.tile,payload.meld_id,payload.index)
                elif payload.action=='discard':rules.discard(s,p['seat'],payload.tile)
                rules.invariant(s)
            except (ValueError,KeyError,TypeError,IndexError) as e:
                raise HTTPException(400,str(e)) from e
            s['bot_due']=time.time()+2
            settle(db,s)
    save(row,s)
    db.flush()
    response=view(db,room,row,user)
    db.add(Okey101Receipt(id=receipt_id,fingerprint=fingerprint,response_json=dumps(response)))
    db.commit()
    return response

def tick_room(rid, now):
    with SessionLocal() as db:
        preliminary=db.get(RoomOkey101,rid)
        if not preliminary or preliminary.status not in ('lobby','playing','hand_finished'):return
        previous=json.loads(preliminary.state_json)
        ids=sorted({p['user_id'] for p in previous['players']})
        list(db.scalars(select(User).where(User.id.in_(ids)).order_by(User.id).with_for_update().execution_options(populate_existing=True)))
        # Lock order is users, then room, in API actions and background workers.
        room=db.scalar(select(Room).where(Room.id==rid).with_for_update())
        db.expire(preliminary)
        row=db.get(RoomOkey101,rid)
        if not room or not row or row.status not in ('lobby','playing','hand_finished'):return
        s=json.loads(row.state_json)
        if not {p['user_id'] for p in s['players']}.issubset(ids):return
        old=dumps(s)
        seats=occupants(db,rid)
        house=rooms.couple_gifts.room_house(db,rid)
        if house and not house.active:
            refund(db,s)
            s['status']='closed'
            rules.event(s,'close',reason='Çift odası kapandı; Lidya iade edildi.')
        elif s['status']=='lobby':
            absent=[p for p in s['players'] if not present(db,rid,p,seats)]
            if now>=s['expires']:
                refund(db,s)
                s['status']='closed'
                rules.event(s,'close',reason='Hazırlık süresi doldu; Lidya iade edildi.')
            elif absent:
                users=users_for_money(db,s)

                # Bahsi belirleyen 1. koltuk kaybolduysa bütün hazır
                # oyuncuların stake'lerini iade edip lobiyi sıfırla.
                if any(p['seat']==1 for p in absent):
                    for p in s['players']:
                        users[p['user_id']].lidya += p['stake']
                    s['players']=[]
                    rules.event(s,'ready',seat=1,reset=True)
                else:
                    for p in absent:
                        users[p['user_id']].lidya += p['stake']
                        s['players'].remove(p)
                    rules.event(s,'ready')
        elif s['status']=='hand_finished':
            if now>=s['next_hand_at']:
                rules.advance(s)
                s['bot_due']=now+2
        else:
            for p in s['players']:
                bot=not present(db,rid,p,seats)
                if p['bot']!=bot:
                    p['bot']=bot
                    rules.event(s,'presence',seat=p['seat'],bot=bot)
            p=rules.player(s,s['turn'])
            if (p['bot'] and now>=s.get('bot_due',0)) or now>=s['deadline']:
                # A discarded tile not used before timeout must be returned; never keep a free tile.
                if s.get('taken') in p['hand']:
                    rules.penalty(s,p['seat'],'wrong_take',101,tile=s['taken'])
                    p['hand'].remove(s['taken'])
                    s['discards'][str((p['seat']-2)%4+1)].append(s['taken'])
                    s.update(taken=None,phase='draw')
                rules.bot_step(s,now)
                rules.invariant(s)
                s['bot_due']=now+2
                settle(db,s)
        if old!=dumps(s):
            save(row,s)
            db.commit()

def tick():
    with SessionLocal() as db:
        ids=list(db.scalars(select(RoomOkey101.room_id).where(RoomOkey101.status.in_(('lobby','playing','hand_finished')))))
    for rid in ids:
        try:tick_room(rid,time.time())
        except Exception:log.exception('Room 101 Okey tick failed: %s',rid)

async def routing_loop():
    while True:
        await asyncio.to_thread(tick)
        await asyncio.sleep(1)
