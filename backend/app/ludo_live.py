"""Persistent room-only Ludo, transactional escrow, restart-safe bot scheduler."""
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
from . import ludo_engine as rules, room_routes as rooms

router = APIRouter(prefix='/v1/rooms', tags=['room-ludo'])
log = logging.getLogger('erischat.ludo')

class RoomLudo(Base):
    __tablename__ = 'room_ludo'
    room_id: Mapped[str] = mapped_column(ForeignKey('rooms.id', ondelete='CASCADE'), primary_key=True)
    round_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    state_json: Mapped[str] = mapped_column(Text, nullable=False)

class LudoReceipt(Base):
    __tablename__ = 'room_ludo_receipts'
    # Includes round and actor: a retry can never mutate a different match.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    response_json: Mapped[str] = mapped_column(Text, nullable=False)

class Action(BaseModel):
    action: Literal['create','ready','withdraw','start','roll','move','close']
    round_id: str = Field(default='', max_length=36)
    version: int = Field(default=0, ge=0)
    request_key: str = Field(min_length=16, max_length=64)
    mode: Literal['solo','paired'] = 'solo'
    stake: int = 50
    token: int = Field(default=0, ge=0, le=3)

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
    assert winners and pool % len(winners)==0
    for p in winners:
        users[p['user_id']].lidya += pool//len(winners)
    s.update(settled=True,payout=pool//len(winners),pool=pool)

def view(db, room, row, user):
    state=json.loads(row.state_json) if row else None
    seats=occupants(db,room.id)
    cards=[]
    for seat,uid in seats.items():
        u=db.get(User,uid)
        if u and rooms.is_member(db,room.id,uid) and not rooms.ghost_active(db,uid):
            cards.append(dict(seat=seat,user_id=uid,name=u.nickname,avatar=u.avatar))
    legal=[]
    if state and state['status']=='playing':
        p=rules.player(state,state['turn'])
        if p['user_id']==user.id and present(db,room.id,p,seats) and not p.get('bot'):
            legal=rules.legal(state,state['turn'])
    return dict(state=state,seats=cards,my_id=user.id,balance=user.lidya,
                can_manage=can_manage(db,room,user),unlocked=room.level>=4,
                legal=legal,server_time=time.time())

def resolve(db,rid,user,lock=False):
    # Existing room lookup refreshes authoritative level before locking.
    room=rooms.get_room_or_404(db,rid)
    if not rooms.is_member(db,room.id,user.id):
        raise HTTPException(403,'Ludo yalnızca odanın üyelerine açıktır.')
    if lock:
        preliminary=db.get(RoomLudo,room.id)
        previous=json.loads(preliminary.state_json) if preliminary else {'players':[]}
        ids=sorted({user.id,*[p['user_id'] for p in previous['players']]})
        # Currency rows precede the room mutex, matching the other gift/payment flows.
        list(db.scalars(select(User).where(User.id.in_(ids)).order_by(User.id).with_for_update().execution_options(populate_existing=True)))
        db.info['ludo_locked_users']=set(ids)
        room=db.scalar(select(Room).where(Room.id==room.id).with_for_update().execution_options(populate_existing=True))
        if preliminary:db.expire(preliminary)
        # Membership may have changed while waiting for the room lock.
        if not rooms.is_member(db,room.id,user.id):
            raise HTTPException(403,'Önce odaya katılın.')
    return room

@router.get('/{room_id}/ludo')
def snapshot(room_id:str, db:Session=Depends(get_db), user:User=Depends(rooms.current_user_dependency)):
    room=resolve(db,room_id,user)
    return view(db,room,db.get(RoomLudo,room.id),user)

@router.post('/{room_id}/ludo')
def mutate(room_id:str, payload:Action, db:Session=Depends(get_db), user:User=Depends(rooms.current_user_dependency)):
    room=resolve(db,room_id,user,lock=True)
    rooms.reject_ghost(db,user,'Ludo oynamak')
    receipt_id=hashlib.sha256(f'{room.id}:{user.id}:{payload.request_key}'.encode()).hexdigest()
    fingerprint=hashlib.sha256(dumps(payload.model_dump()).encode()).hexdigest()
    receipt=db.get(LudoReceipt,receipt_id)
    if receipt:
        if receipt.fingerprint!=fingerprint:
            raise HTTPException(409,'İstek anahtarı başka işlemde kullanılmış.')
        return json.loads(receipt.response_json)
    row=db.get(RoomLudo,room.id)
    s=json.loads(row.state_json) if row else None
    if s and not {p['user_id'] for p in s['players']}.issubset(db.info['ludo_locked_users']):
        raise HTTPException(409,'Katılımcılar güncellendi; tekrar deneyin.')
    seats=occupants(db,room.id)
    seat=next((n for n,uid in seats.items() if uid==user.id),None)
    staff=can_manage(db,room,user)
    if payload.action=='create':
        if room.level<4:
            raise HTTPException(403,'Ludo 4. oda seviyesinde açılır.')
        if not staff and seat is None:
            raise HTTPException(403,'İlk dört koltuktan birine oturun.')
        if s and s['status'] in ('lobby','playing'):
            raise HTTPException(409,'Bu odada zaten açık bir oyun var.')
        s=dict(round_id=str(uuid4()),status='lobby',mode=payload.mode,host=user.id,
               version=0,players=[],events=[],settled=False,expires=time.time()+600)
        rules.event(s,'lobby')
        if not row:
            row=RoomLudo(room_id=room.id,round_id=s['round_id'],status='lobby',state_json=dumps(s))
            db.add(row)
        else:
            row.round_id=s['round_id']
    else:
        if not s or payload.round_id!=s['round_id'] or payload.version!=s['version']:
            raise HTTPException(409,'Oyun güncellendi; tekrar deneyin.')
        p=next((p for p in s['players'] if p['user_id']==user.id),None)
        if payload.action=='close':
            if not staff:
                raise HTTPException(403,'Oyunu sadece oda sahibi veya moderatör kapatabilir.')
            refund(db,s)
            s['status']='closed'
            rules.event(s,'close')
        elif payload.action in ('ready','withdraw'):
            if s['status']!='lobby':
                raise HTTPException(409,'Oyun başlamış.')
            if payload.action=='ready' and (seat is None or payload.stake not in rules.STAKES):
                raise HTTPException(400,'İlk dört koltuk ve 50–300 Lidya seçeneklerinden birini seçin.')
            users=users_for_money(db,s)
            actor=users.get(user.id) or db.scalar(select(User).where(User.id==user.id).with_for_update().execution_options(populate_existing=True))
            old=p['stake'] if p else 0
            new=payload.stake if payload.action=='ready' else 0
            if actor.lidya+old<new:
                raise HTTPException(400,'Lidya bakiyeniz yetersiz.')
            if new and any(q['seat']==seat and q['user_id']!=user.id for q in s['players']):
                raise HTTPException(409,'Bu koltuğun önceki oyuncusunun iadesi bekleniyor.')
            actor.lidya+=old-new
            s['players']=[q for q in s['players'] if q['user_id']!=user.id]
            if new:
                s['players'].append(dict(seat=seat,user_id=user.id,name=user.nickname,avatar=user.avatar,
                                         stake=new,tokens=[-1]*4,bot=False))
            rules.event(s,'ready',seat=seat)
        elif payload.action=='start':
            if s['status']!='lobby' or user.id!=s['host'] and not staff:
                raise HTTPException(403,'Başlatmayı oyun kurucusu veya oda yönetimi yapar.')
            if not all(present(db,room.id,q,seats) for q in s['players']):
                raise HTTPException(409,'Hazır oyuncular ilk dört koltukta bulunmalı.')
            try:
                rules.begin(s)
            except ValueError as e:
                raise HTTPException(400,str(e)) from e
            s['pool']=sum(q['stake'] for q in s['players'])
            s['bot_due']=time.time()+2
        else:
            if s['status']!='playing' or not p or p['seat']!=s['turn'] or not present(db,room.id,p,seats):
                raise HTTPException(403,'Sıra size ait değil veya koltuğunuzda değilsiniz.')
            p['bot']=False
            try:
                if payload.action=='roll':rules.roll(s)
                elif payload.action=='move':rules.move(s,payload.token)
            except ValueError as e:
                raise HTTPException(400,str(e)) from e
            s['bot_due']=time.time()+2
            settle(db,s)
    save(row,s)
    db.flush()
    response=view(db,room,row,user)
    db.add(LudoReceipt(id=receipt_id,fingerprint=fingerprint,response_json=dumps(response)))
    db.commit()
    return response

def tick_room(rid, now):
    with SessionLocal() as db:
        preliminary=db.get(RoomLudo,rid)
        if not preliminary or preliminary.status not in ('lobby','playing'):return
        previous=json.loads(preliminary.state_json)
        ids=sorted({p['user_id'] for p in previous['players']})
        list(db.scalars(select(User).where(User.id.in_(ids)).order_by(User.id).with_for_update().execution_options(populate_existing=True)))
        # Lock order is users, then room, in API actions and background workers.
        room=db.scalar(select(Room).where(Room.id==rid).with_for_update())
        db.expire(preliminary)
        row=db.get(RoomLudo,rid)
        if not room or not row or row.status not in ('lobby','playing'):return
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
                for p in absent:
                    users[p['user_id']].lidya+=p['stake']
                    s['players'].remove(p)
                rules.event(s,'ready')
        else:
            for p in s['players']:
                bot=not present(db,rid,p,seats)
                if p['bot']!=bot:
                    p['bot']=bot
                    rules.event(s,'presence',seat=p['seat'],bot=bot)
            p=rules.player(s,s['turn'])
            if (p['bot'] and now>=s.get('bot_due',0)) or now>=s['deadline']:
                rules.bot_step(s,now)
                s['bot_due']=now+2
                settle(db,s)
        if old!=dumps(s):
            save(row,s)
            db.commit()

def tick():
    with SessionLocal() as db:
        ids=list(db.scalars(select(RoomLudo.room_id).where(RoomLudo.status.in_(('lobby','playing')))))
    for rid in ids:
        try:tick_room(rid,time.time())
        except Exception:log.exception('Room Ludo tick failed: %s',rid)

async def routing_loop():
    while True:
        await asyncio.to_thread(tick)
        await asyncio.sleep(1)
