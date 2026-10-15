"""Live classic Slot: shared wallet, atomic receipts, resumable purchased spins."""
import json
from datetime import datetime, timezone
from uuid import UUID, uuid4
from fastapi import HTTPException
from pydantic import BaseModel, StrictInt
from sqlalchemy import ForeignKey, String, Text, Integer, BigInteger, select, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base
from .models import User
from .platform_models import GameBet, GameRound
from .wheel_rules import period_bounds
from .oyunlar import slot as engine

STAKES=(10,100,1000,10000,100000)
MULTIPLIERS=dict(cherry=5,lemon=7,bell=10,star=15,diamond=25,seven=50,crown=100)
BONUS_SPINS=10
BONUS_PRICE_MULTIPLIER=10
class SlotRequest(BaseModel):
    amount: StrictInt
    request_id: UUID
class SlotAccount(Base):
    __tablename__='classic_slot_accounts'
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id'),primary_key=True)
    remaining: Mapped[int]=mapped_column(Integer,default=0,nullable=False)
    stake: Mapped[int]=mapped_column(BigInteger,default=100,nullable=False)
class SlotReceipt(Base):
    __tablename__='classic_slot_receipts'
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id'),primary_key=True)
    request_id: Mapped[str]=mapped_column(String(36),primary_key=True)
    operation: Mapped[str]=mapped_column(String(16),nullable=False)
    amount: Mapped[int]=mapped_column(BigInteger,nullable=False)
    response: Mapped[str]=mapped_column(Text,nullable=False)

def state(db,user):
    a=db.get(SlotAccount,user.id)
    winners=db.execute(select(GameRound.id,User.nickname,User.public_id,GameBet.payout,GameRound.ends_at).join(GameBet,GameBet.round_id==GameRound.id).join(User,User.id==GameBet.user_id).where(GameRound.game_type=='slot',GameRound.status=='finished',GameBet.payout>0,User.is_active.is_(True)).order_by(GameRound.ends_at.desc(),GameRound.id.desc()).limit(10)).all()
    return dict(my_id=user.id,balance=int(db.scalar(select(User.lidya).where(User.id==user.id))),stakes=STAKES,remaining=a.remaining if a else 0,locked_stake=a.stake if a and a.remaining else None,bonus_spins=BONUS_SPINS,bonus_price_multiplier=BONUS_PRICE_MULTIPLIER,multipliers=MULTIPLIERS,winners=[dict(round_id=rid,nickname=name,public_id=pid,payout=int(payout),ended_at=ended) for rid,name,pid,payout,ended in winners])

def transact(db,user,payload,operation='spin'):
    # Same user row lock serializes wallet spending, bonus progress and UUID retries.
    u=db.scalar(select(User).where(User.id==user.id).with_for_update())
    rid=str(payload.request_id);receipt=db.get(SlotReceipt,(user.id,rid))
    if receipt:
        if (receipt.operation,receipt.amount)!=(operation,payload.amount):raise HTTPException(409,'İstek numarası başka işlemde kullanılmış.')
        out=json.loads(receipt.response);out.update(replayed=True,balance=u.lidya);return out
    if payload.amount < 10 or payload.amount % 10:raise HTTPException(422,'Bahis en az 10 Lidya ve 10’un katı olmalı.')
    a=db.get(SlotAccount,user.id)
    if not a:a=SlotAccount(user_id=user.id,remaining=0,stake=payload.amount);db.add(a)
    if operation=='bonus':
        if a.remaining:raise HTTPException(409,'Önce aktif ücretsiz çevirmeleri tamamla.')
        cost=payload.amount*BONUS_PRICE_MULTIPLIER
        if u.lidya<cost:raise HTTPException(400,'Yeterli Lidya yok.')
        u.lidya-=cost;a.remaining=BONUS_SPINS;a.stake=payload.amount
        out=dict(operation='bonus',cost=cost,payout=0,remaining=a.remaining,locked_stake=a.stake,balance=u.lidya)
    else:
        free=a.remaining>0
        if free and payload.amount!=a.stake:raise HTTPException(409,'Ücretsiz çevirmede bahis satın alınan tutarda kilitli.')
        cost=0 if free else payload.amount
        if u.lidya<cost:raise HTTPException(400,'Yeterli Lidya yok.')
        u.lidya-=cost
        if free:a.remaining-=1
        now=datetime.now(timezone.utc);round_id=str(uuid4())
        result,data=engine.play(None,None,dict(round_id=round_id,stake=payload.amount,free_spin=free))
        payout=payload.amount*MULTIPLIERS.get(result,0);u.lidya+=payout
        db.add(GameRound(id=round_id,user_id=user.id,game_type='slot',status='finished',result_key=result,started_at=now,ends_at=now,state_data=json.dumps(data)))
        db.flush();db.add(GameBet(round_id=round_id,user_id=user.id,choice='auto',amount=cost,payout=payout))
        out=dict(operation='spin',round_id=round_id,result=result,data=data,stake=payload.amount,cost=cost,payout=payout,remaining=a.remaining,locked_stake=a.stake if a.remaining else None,balance=u.lidya)
    db.add(SlotReceipt(user_id=user.id,request_id=rid,operation=operation,amount=payload.amount,response=json.dumps(out)))
    db.flush();out['replayed']=False;return out

def leaderboard(db,user,period='hour'):
    start,end=period_bounds(period)
    scores=(select(GameBet.user_id,func.sum(GameBet.payout).label('winnings')).join(GameRound,GameRound.id==GameBet.round_id).where(GameRound.game_type=='slot',GameRound.status=='finished',GameBet.payout>0,GameRound.ends_at>=start,GameRound.ends_at<end).group_by(GameBet.user_id).subquery())
    rows=db.execute(select(User,scores.c.winnings).join(scores,scores.c.user_id==User.id).where(User.is_active.is_(True)).order_by(scores.c.winnings.desc(),User.public_id.asc()).limit(50)).all()
    mine=db.scalar(select(scores.c.winnings).where(scores.c.user_id==user.id)) or 0
    return dict(game='slot',period=period,timezone='Europe/Istanbul',metric='paid_winnings',starts_at=start,ends_at=end,limit=50,my_winnings=int(mine),items=[dict(rank=i+1,user_id=u.id,public_id=u.public_id,nickname=u.nickname,avatar=u.avatar,avatar_asset=u.avatar_asset,frame_asset=u.frame_asset,winnings=int(n)) for i,(u,n) in enumerate(rows)])


