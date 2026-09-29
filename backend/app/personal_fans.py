"""All-time Lidya gifts across rooms and direct messages."""
from sqlalchemy import func, select, union_all
from .room_models import RoomGiftEvent
from .platform_models import DirectMessageGift
from .models import User
from .room_fan_levels import level_for_total


def gift_totals(db, sender_ids):
    ids=set(sender_ids)
    if not ids: return {}
    totals={uid: 0 for uid in ids}
    for uid, amount in db.execute(select(RoomGiftEvent.sender_id, func.sum(RoomGiftEvent.total_price))
            .where(RoomGiftEvent.sender_id.in_(ids)).group_by(RoomGiftEvent.sender_id)):
        totals[uid]+=int(amount or 0)
    for uid, amount in db.execute(select(DirectMessageGift.sender_id, func.sum(DirectMessageGift.unit_price))
            .where(DirectMessageGift.sender_id.in_(ids)).group_by(DirectMessageGift.sender_id)):
        totals[uid]+=int(amount or 0)
    return totals


def fan_leaderboard(db, recipient_id):
    gifts=union_all(
        select(RoomGiftEvent.sender_id.label('sender_id'),RoomGiftEvent.total_price.label('amount'))
            .where(RoomGiftEvent.recipient_id==recipient_id),
        select(DirectMessageGift.sender_id.label('sender_id'),DirectMessageGift.unit_price.label('amount'))
            .where(DirectMessageGift.recipient_id==recipient_id)
    ).subquery()
    total=func.sum(gifts.c.amount).label('total')
    rows=db.execute(select(User.id,User.nickname,User.avatar,User.avatar_asset,User.frame_asset,total)
        .join(gifts,gifts.c.sender_id==User.id)
        .group_by(User.id,User.nickname,User.avatar,User.avatar_asset,User.frame_asset)
        .order_by(total.desc(),User.id).limit(50)).all()
    return [{'rank':rank,'user_id':uid,'nickname':name,'avatar':avatar,
             'avatar_asset':asset,'frame_asset':frame,'total_lidya':int(amount),
             'fan_level':level_for_total(amount)}
            for rank,(uid,name,avatar,asset,frame,amount) in enumerate(rows,1)]


def fan_count(db, recipient_id):
    senders=union_all(
        select(RoomGiftEvent.sender_id.label("sender_id")).where(RoomGiftEvent.recipient_id==recipient_id),
        select(DirectMessageGift.sender_id.label("sender_id")).where(DirectMessageGift.recipient_id==recipient_id),
    ).subquery()
    return int(db.scalar(select(func.count(func.distinct(senders.c.sender_id)))) or 0)
