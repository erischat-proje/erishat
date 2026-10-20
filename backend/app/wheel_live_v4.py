"""Atomic live wheel bets, retry receipts and public top-50 paid-winnings rankings."""
import json
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID, uuid4

from fastapi import HTTPException
from pydantic import BaseModel, StrictInt
from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func, select, text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base
from .models import User
from .staff_identity import STAFF, ROLES
from .platform_models import GameBet, GameRound
from . import wheel_rules as rules

BET_SECONDS = 60
LOCK_SECONDS = 5
RESULT_SECONDS = 6


class WheelReceipt(Base):
    __tablename__ = 'wheel_bet_receipts'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    round_id: Mapped[str] = mapped_column(ForeignKey('game_rounds.id'), nullable=False)
    choice: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)


class WheelSettlement(Base):
    __tablename__ = 'wheel_settlements'
    round_id: Mapped[str] = mapped_column(ForeignKey('game_rounds.id'), primary_key=True)
    settled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)


class BetRequest(BaseModel):
    choice: str
    amount: StrictInt
    round_id: str
    request_id: UUID


def now():
    return datetime.now(timezone.utc)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def lock(db):
    if db.get_bind().dialect.name == 'postgresql':
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext('eris:wheel:live:v4'))"))


def state(row):
    return json.loads(row.state_data or '{}')


def round_rules(row):
    data = state(row)
    if data.get('version') == rules.VERSION:
        return data['weights'], data['multipliers'], rules.STAKES
    return rules.LEGACY_WEIGHTS, rules.LEGACY_MULTIPLIERS, rules.LEGACY_STAKES


def finish(db, row, at=None):
    # Called with the global mutex and locked round, making settlement idempotent.
    at = at or now()
    if row.status == 'finished' or utc(row.ends_at) > at:
        return row
    weights, multipliers, _ = round_rules(row)
    result = rules.choose(weights)
    bets = list(db.scalars(select(GameBet).where(GameBet.round_id == row.id).order_by(GameBet.id)))
    credits = {}
    for bet in bets:
        bet.payout = rules.payout(bet.choice, result, bet.amount, multipliers)
        if bet.payout:
            credits[bet.user_id] = credits.get(bet.user_id, 0) + bet.payout
    for uid in sorted(credits):
        bettor = db.scalar(select(User).where(User.id == uid).with_for_update())
        if bettor is None:
            raise HTTPException(409, 'Kazananın cüzdanı bulunamadı; tur henüz ödenmedi.')
        bettor.lidya += credits[uid]
    data = state(row)
    data.update(result=result, finished_at=at.isoformat(), bet_count=len(bets),
                winner_bets=sum(b.payout > 0 for b in bets), total_payout=sum(credits.values()))
    row.state_data = json.dumps(data, separators=(',', ':'))
    row.result_key = result
    row.status = 'finished'
    db.add(WheelSettlement(round_id=row.id, settled_at=at))
    db.flush()
    return row


def get_round(db, at=None):
    lock(db)
    at = at or now()
    row = db.scalar(select(GameRound).where(GameRound.game_type == 'wheel_live')
                    .order_by(GameRound.started_at.desc(), GameRound.id.desc()).limit(1).with_for_update())
    if row and row.status == 'open' and utc(row.ends_at) <= at:
        return finish(db, row, at)
    if row and row.status == 'finished':
        finished_at = datetime.fromisoformat(state(row).get('finished_at', utc(row.ends_at).isoformat()))
        if at < utc(finished_at) + timedelta(seconds=RESULT_SECONDS):
            return row
        row = None
    if row is None:
        row = GameRound(id=str(uuid4()), user_id=None, room_id=None, game_type='wheel_live', status='open',
            started_at=at, ends_at=at+timedelta(seconds=BET_SECONDS), result_key=None,
            state_data=json.dumps(dict(version=rules.VERSION, weights=rules.WEIGHTS, multipliers=rules.MULTIPLIERS)))
        db.add(row)
        db.flush()
    return row


def response(db, row, user):
    at = now()
    weights, multipliers, stakes = round_rules(row)
    bets = list(db.scalars(select(GameBet).where(GameBet.round_id == row.id).order_by(GameBet.id)))
    mine = {key: 0 for key in weights}
    totals = {key: 0 for key in weights}
    for bet in bets:
        if bet.choice in totals:
            totals[bet.choice] += bet.amount
            if bet.user_id == user.id:
                mine[bet.choice] += bet.amount
    remaining = max(0, int((utc(row.ends_at)-at).total_seconds()))
    recent = list(db.scalars(select(GameRound).where(GameRound.game_type == 'wheel_live', GameRound.status == 'finished')
                            .order_by(GameRound.ends_at.desc()).limit(100)))
    history = [{'round_id': r.id, 'result': r.result_key} for r in recent[:10]]
    misses = {}
    for key in weights:
        misses[key] = next((i for i,r in enumerate(recent) if r.result_key == key), len(recent))
    my_payout = sum(b.payout for b in bets if b.user_id == user.id) if row.status == 'finished' else 0
    data = state(row)
    return dict(my_id=user.id, round_id=row.id, version=data.get('version', 3), status=row.status,
        started_at=row.started_at, ends_at=row.ends_at, remaining_seconds=remaining,
        betting_open=row.status == 'open' and remaining > LOCK_SECONDS,
        lock_seconds=LOCK_SECONDS, result=row.result_key, symbols=list(weights), stakes=list(stakes),
        multipliers=multipliers, probabilities={k:v/sum(weights.values()) for k,v in weights.items()},
        my_bets=mine, my_payout=my_payout, my_total_bet=sum(mine.values()),
        balance=user.lidya, history=history, misses=misses,
        # Aggregated popularity is disclosed only after betting closes.
        totals=totals if remaining <= LOCK_SECONDS or row.status == 'finished' else None)


def place_bet(db, user, payload):
    lock(db)
    rid = str(payload.request_id)
    receipt = db.get(WheelReceipt, (user.id, rid))
    if receipt:
        if (receipt.round_id, receipt.choice, receipt.amount) != (payload.round_id, payload.choice, payload.amount):
            raise HTTPException(409, 'İstek numarası farklı bahis için kullanılmış.')
        balance = db.scalar(select(User.lidya).where(User.id == user.id))
        return dict(ok=True, replayed=True, round_id=receipt.round_id, choice=receipt.choice,
                    amount=receipt.amount, balance=balance, request_id=rid)
    row = get_round(db)
    if row.id != payload.round_id:
        raise HTTPException(409, 'Tur değişti; yeni turu kontrol edip tekrar bahis yap.')
    weights, _, stakes = round_rules(row)
    if payload.choice not in weights:
        raise HTTPException(422, 'Geçersiz çark sembolü.')
    if (payload.amount not in stakes if int(json.loads(row.state_data).get("version",1)) < 4 else payload.amount < 10 or payload.amount % 10):
        raise HTTPException(422, 'Bahis en az 10 Lidya ve 10’un katı olmalı.')
    if row.status != 'open' or (utc(row.ends_at)-now()).total_seconds() <= LOCK_SECONDS:
        raise HTTPException(409, 'Bahisler kapandı. Yeni turu bekle.')
    locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
    if not locked_user or payload.amount > locked_user.lidya:
        raise HTTPException(400, 'Yeterli Lidya yok.')
    locked_user.lidya -= payload.amount
    db.add(GameBet(round_id=row.id, user_id=user.id, choice=payload.choice, amount=payload.amount, payout=0))
    db.add(WheelReceipt(user_id=user.id, request_id=rid, round_id=row.id, choice=payload.choice, amount=payload.amount))
    db.flush()
    return dict(ok=True, replayed=False, round_id=row.id, choice=payload.choice, amount=payload.amount,
                balance=locked_user.lidya, request_id=rid)


def leaderboard(db, user, period='hour'):
    start, end = rules.period_bounds(period)
    settled = func.coalesce(WheelSettlement.settled_at, GameRound.ends_at)
    total = func.sum(GameBet.payout).label('winnings')
    scores = (select(GameBet.user_id, total).join(GameRound, GameRound.id == GameBet.round_id)
              .outerjoin(WheelSettlement, WheelSettlement.round_id == GameRound.id)
              .where(GameRound.game_type.in_(('wheel_live', 'wheel')), GameRound.status == 'finished',
                     GameBet.payout > 0, settled >= start, settled < end).group_by(GameBet.user_id).subquery())
    rows = db.execute(select(User, scores.c.winnings).join(scores, scores.c.user_id == User.id)
                      .where(User.is_active.is_(True), ~select(STAFF.c.user_id).where(STAFF.c.user_id == User.id, STAFF.c.role.in_(ROLES)).correlate(User).exists()).order_by(scores.c.winnings.desc(), User.public_id.asc())
                      .limit(50)).all()
    items = [dict(rank=i+1, user_id=u.id, public_id=u.public_id, nickname=u.nickname,
                  avatar=u.avatar, avatar_asset=u.avatar_asset, frame_asset=u.frame_asset,
                  winnings=int(amount)) for i,(u,amount) in enumerate(rows)]
    mine = db.scalar(select(scores.c.winnings).where(scores.c.user_id == user.id)) or 0
    return dict(game='wheel', period=period, timezone='Europe/Istanbul', starts_at=start, ends_at=end,
                metric='paid_winnings', items=items, my_winnings=int(mine), limit=50)


def records(db, user):
    stake = func.sum(GameBet.amount).label('stake')
    paid = func.sum(GameBet.payout).label('payout')
    rows = db.execute(select(GameRound.id, GameRound.ends_at, GameRound.result_key, stake, paid)
        .join(GameBet, GameBet.round_id == GameRound.id)
        .where(GameBet.user_id == user.id, GameRound.game_type.in_(('wheel_live','wheel')))
        .group_by(GameRound.id, GameRound.ends_at, GameRound.result_key)
        .order_by(GameRound.ends_at.desc()).limit(50)).all()
    start, end = rules.period_bounds('day')
    settled = func.coalesce(WheelSettlement.settled_at, GameRound.ends_at)
    total = db.scalar(select(func.sum(GameBet.payout)).join(GameRound, GameRound.id == GameBet.round_id)
        .outerjoin(WheelSettlement, WheelSettlement.round_id == GameRound.id)
        .where(GameBet.user_id == user.id, GameRound.game_type.in_(('wheel_live','wheel')),
               GameRound.status == 'finished', settled >= start, settled < end)) or 0
    return dict(today_winnings=int(total), items=[dict(round_id=rid, played_at=at, result=result,
        stake=int(amount), payout=int(payout)) for rid,at,result,amount,payout in rows])

