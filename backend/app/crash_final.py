"""Crash v5 stake receipts and paid-winnings rankings, using the shared wallet."""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, StrictInt
from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func, select
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base
from .models import User
from .platform_models import GameBet, GameRound
from .wheel_rules import period_bounds

STAKES = (10, 100, 1_000, 10_000, 100_000)

class CrashBetRequest(BaseModel):
    amount: StrictInt
    round_id: str
    request_id: UUID

class CrashCashoutAllRequest(BaseModel):
    round_id: str

class CrashBetReceipt(Base):
    __tablename__ = 'crash_bet_receipts'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    round_id: Mapped[str] = mapped_column(ForeignKey('game_rounds.id'), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    bet_id: Mapped[int] = mapped_column(ForeignKey('game_bets.id'), nullable=False)

class CrashPayoutTime(Base):
    __tablename__ = 'crash_payout_times'
    bet_id: Mapped[int] = mapped_column(ForeignKey('game_bets.id'), primary_key=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)


def place_bet(db, user, payload, get_round, clock=lambda:datetime.now(timezone.utc)):
    row=get_round(db)  # Existing advisory mutex also serializes retries and cashouts.
    rid=str(payload.request_id)
    receipt=db.get(CrashBetReceipt,(user.id,rid))
    if receipt:
        if (receipt.round_id,receipt.amount)!=(payload.round_id,payload.amount):
            raise HTTPException(409,'İstek numarası başka bahis için kullanılmış.')
        return dict(ok=True,replayed=True,round_id=receipt.round_id,bet_id=receipt.bet_id,
                    amount=receipt.amount,balance=db.scalar(select(User.lidya).where(User.id==user.id)))
    if not 10 <= payload.amount <= 1_000_000_000 or payload.amount % 10:
        raise HTTPException(422,'Bahis: 10, 100, 1.000, 10.000 veya 100.000 Lidya seç.')
    if row.id!=payload.round_id:
        raise HTTPException(409,'Tur değişti; yeni turu kontrol edip bahis yap.')
    ends=row.ends_at.replace(tzinfo=timezone.utc) if row.ends_at.tzinfo is None else row.ends_at
    if row.status!='open' or clock()>=ends:
        raise HTTPException(409,'Bahis süresi kapandı.')
    locked=db.scalar(select(User).where(User.id==user.id).with_for_update())
    if not locked or locked.lidya<payload.amount:
        raise HTTPException(400,'Yeterli Lidya yok.')
    locked.lidya-=payload.amount
    bet=GameBet(round_id=row.id,user_id=user.id,choice='cashout',amount=payload.amount,payout=0)
    db.add(bet);db.flush()
    db.add(CrashBetReceipt(user_id=user.id,request_id=rid,round_id=row.id,amount=payload.amount,bet_id=bet.id));db.flush()
    return dict(ok=True,replayed=False,round_id=row.id,bet_id=bet.id,amount=payload.amount,balance=locked.lidya)


def record_cashout(db,bet,at):
    if not db.get(CrashPayoutTime,bet.id):db.add(CrashPayoutTime(bet_id=bet.id,paid_at=at))


def leaderboard(db,user,period='hour'):
    start,end=period_bounds(period)
    paid=func.coalesce(CrashPayoutTime.paid_at,GameBet.created_at)
    scores=(select(GameBet.user_id,func.sum(GameBet.payout).label('winnings'))
        .join(GameRound,GameRound.id==GameBet.round_id)
        .outerjoin(CrashPayoutTime,CrashPayoutTime.bet_id==GameBet.id)
        .where(GameRound.game_type=='crash_live',GameBet.payout>0,paid>=start,paid<end)
        .group_by(GameBet.user_id).subquery())
    rows=db.execute(select(User,scores.c.winnings).join(scores,scores.c.user_id==User.id)
        .where(User.is_active.is_(True)).order_by(scores.c.winnings.desc(),User.public_id.asc()).limit(50)).all()
    mine=db.scalar(select(scores.c.winnings).where(scores.c.user_id==user.id)) or 0
    items=[dict(rank=i+1,user_id=u.id,public_id=u.public_id,nickname=u.nickname,avatar=u.avatar,
        avatar_asset=u.avatar_asset,frame_asset=u.frame_asset,winnings=int(amount)) for i,(u,amount) in enumerate(rows)]
    return dict(game='crash',period=period,timezone='Europe/Istanbul',starts_at=start,ends_at=end,
        metric='paid_winnings',items=items,my_winnings=int(mine),limit=50)

