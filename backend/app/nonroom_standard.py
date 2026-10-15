"""Shared paid-winnings view for the thirteen non-room custom games."""
from fastapi import HTTPException
from sqlalchemy import select,func
from .models import User
from .platform_models import GameRound,GameBet
from .wheel_rules import period_bounds
CUSTOM_GAMES=frozenset(('dede','seker','balikci','prenses','dogparty','candy','kovboy','bastet','altin','kure','firavun','aztek','ares'))
def leaderboard(db,user,game,period='hour'):
    if game not in CUSTOM_GAMES:raise HTTPException(404,'Oyun bulunamadı')
    start,end=period_bounds(period)
    scores=(select(GameBet.user_id,func.sum(GameBet.payout).label('winnings')).join(GameRound,GameRound.id==GameBet.round_id).where(GameRound.game_type==game,GameRound.status=='finished',GameBet.payout>0,GameRound.ends_at>=start,GameRound.ends_at<end).group_by(GameBet.user_id).subquery())
    rows=db.execute(select(User,scores.c.winnings).join(scores,scores.c.user_id==User.id).where(User.is_active.is_(True)).order_by(scores.c.winnings.desc(),User.public_id.asc()).limit(50)).all()
    mine=db.scalar(select(scores.c.winnings).where(scores.c.user_id==user.id)) or 0
    return dict(game=game,period=period,timezone='Europe/Istanbul',metric='paid_winnings',limit=50,starts_at=start,ends_at=end,my_winnings=int(mine),items=[dict(rank=i+1,user_id=u.id,public_id=u.public_id,nickname=u.nickname,avatar=u.avatar,avatar_asset=u.avatar_asset,frame_asset=u.frame_asset,winnings=int(amount)) for i,(u,amount) in enumerate(rows)])
