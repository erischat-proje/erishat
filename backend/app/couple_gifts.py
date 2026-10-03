"""Atomic and replay-safe shared gift settlement."""
import secrets
from datetime import datetime,timezone
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import select
from .models import User
from .platform_models import VipStatus,Notification
from .relationship_models import Couple,CoupleGift,CoupleRoom
from .room_models import RoomGiftEvent,RoomChatMessage
from . import seat_workflow


def room_house(db,room_id):
    link=db.scalar(select(CoupleRoom).where(CoupleRoom.room_id==room_id))
    return db.get(Couple,link.couple_id) if link else None


def split_amount(unit_price,quantity,percent):
    # Apply threshold to each gift's unit price, then floor once at payout.
    gross=unit_price*quantity
    eligible_numerator=gross*2 if unit_price>30 else gross*3
    return eligible_numerator*percent//600


def process_gift(db,house,user,gift_key,quantity,request_key,room_id=None):
    from .room_routes import GIFT_CATALOG
    from .platform_routes import vip_level_from_spend
    old=db.scalar(select(CoupleGift).where(CoupleGift.sender_id==user.id,CoupleGift.request_key==request_key))
    if old:
        if (old.couple_id,old.gift_key,old.quantity)!=(house.id,gift_key,quantity):raise HTTPException(409,'İşlem anahtarı başka hediyede kullanılmış.')
        return old,True
    price=GIFT_CATALOG.get(gift_key)
    if price is None:raise HTTPException(400,'Geçersiz hediye.')
    gross=price*quantity
    if int(user.lidya or 0)<gross:raise HTTPException(402,'Yeterli Lidya yok.')
    user.lidya-=gross
    percent=secrets.randbelow(100)+1
    each=split_amount(price,quantity,percent)
    for uid in (house.male_id,house.female_id):
        db.get(User,uid).lidya+=each
        db.add(Notification(user_id=uid,kind='couple_gift',title='Çiftinize hediye',body=f'{user.nickname} çiftinize {gross} Lidya hediye gönderdi.'))
    vip=db.get(VipStatus,user.id)
    if not vip:vip=VipStatus(user_id=user.id,level=0,total_spent=0);db.add(vip)
    vip.total_spent=int(vip.total_spent or 0)+gross;vip.level=vip_level_from_spend(vip.total_spent)
    row=CoupleGift(id=str(uuid4()),couple_id=house.id,sender_id=user.id,request_key=request_key,gift_key=gift_key,quantity=quantity,gross=gross,percent=percent,each_amount=each,room_id=room_id)
    db.add(row)
    link=db.get(CoupleRoom,house.id)
    # Also keep existing personal fan and received-gift history; split gross exactly.
    for i,uid in enumerate((house.male_id,house.female_id)):
        db.add(RoomGiftEvent(room_id=room_id or (link.room_id if link else None),sender_id=user.id,recipient_id=uid,gift_key=gift_key,unit_price=price,quantity=quantity,total_price=gross//2+(gross%2 if i==0 else 0),recipient_percent=percent,recipient_amount=each))
    msg=RoomChatMessage(room_id=link.room_id,user_id=user.id,text=f'{user.nickname} isimli kullanıcı çiftimize {gross} Lidya hediye gönderdi.')
    db.add(msg);db.flush();db.add(seat_workflow.RoomSystemEntry(message_id=msg.id));row.chat_message_id=msg.id
    db.flush();return row,False


async def broadcast_gift(db,row,user):
    from .main import _broadcast_room_chat,_broadcast_global_gift_announcement
    from .room_routes import gift_presentation,gift_visual
    from .room_models import Room
    link=db.get(CoupleRoom,row.couple_id)
    if not link:return
    msg=db.get(RoomChatMessage,row.chat_message_id)
    text=msg.text
    await _broadcast_room_chat(link.room_id,{'type':'room_chat','system':True,'id':msg.id,'room_id':link.room_id,'user_id':user.id,'nickname':'ErisChat','text':text,'lidya_amount':row.gross,'created_at':datetime.now(timezone.utc).isoformat()})

    presentation=gift_presentation(row.gross//row.quantity)
    house=db.get(Couple,row.couple_id)
    event={'type':'room_gift','id':row.id,'room_id':link.room_id,'sender_id':user.id,'recipient_id':house.male_id,'sender_nickname':user.nickname,'recipient_nickname':'Çiftimiz','gift_key':row.gift_key,'quantity':row.quantity,'total_price':row.gross,'recipient_amount':row.each_amount*2,**presentation,**gift_visual(row.gift_key)}
    event['id']=row.id
    await _broadcast_room_chat(link.room_id,event)
    if presentation['global_announcement']:
        room=db.get(Room,link.room_id)
        await _broadcast_global_gift_announcement({**event,'room_name':room.name,'room_public_id':room.public_id})
