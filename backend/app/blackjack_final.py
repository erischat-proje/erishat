"""Blackjack stake policy and paid-winning rankings on the shared wallet."""
from fastapi import HTTPException
from sqlalchemy import func, select
from .models import User
from .staff_identity import STAFF, ROLES
from .platform_models import GameBet, GameRound
from .wheel_rules import period_bounds

STAKES = (10, 100, 1_000, 10_000, 100_000)

def validate_stake(value):
    if type(value) is not int or value < 10 or value % 10:
        raise HTTPException(422, 'Blackjack toplam bahsi 10 Lidya katlarıyla artırılmalı.')
    return value

def leaderboard(db, user, period='hour'):
    start, end = period_bounds(period)
    scores = (select(GameBet.user_id, func.sum(GameBet.payout).label('winnings'))
        .join(GameRound, GameRound.id == GameBet.round_id)
        .where(GameRound.game_type == 'blackjack', GameRound.status == 'finished',
               GameRound.result_key.in_(('win', 'blackjack')), GameBet.payout > 0,
               GameRound.ends_at >= start, GameRound.ends_at < end)
        .group_by(GameBet.user_id).subquery())
    rows = db.execute(select(User, scores.c.winnings).join(scores, scores.c.user_id == User.id)
        .where(User.is_active.is_(True), ~select(STAFF.c.user_id).where(STAFF.c.user_id == User.id, STAFF.c.role.in_(ROLES)).correlate(User).exists())
        .order_by(scores.c.winnings.desc(), User.public_id.asc()).limit(50)).all()
    mine = db.scalar(select(scores.c.winnings).where(scores.c.user_id == user.id)) or 0
    items = [dict(rank=i+1, user_id=u.id, public_id=u.public_id, nickname=u.nickname,
        avatar=u.avatar, avatar_asset=u.avatar_asset, frame_asset=u.frame_asset, winnings=int(n))
        for i, (u, n) in enumerate(rows)]
    return dict(game='blackjack', period=period, timezone='Europe/Istanbul', starts_at=start,
                ends_at=end, metric='paid_winnings', items=items, my_winnings=int(mine), limit=50)

