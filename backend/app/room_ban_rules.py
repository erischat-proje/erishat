from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select,or_
from .room_ban_models import RoomUserBan

ROOM_RESTRICTION_MESSAGE='Oda ban talebi ile ilgilenmediğiniz için işlemleriniz 3 dakikalığına kısıtlanmıştır.'

def active_room_user_ban(db,room_id,user_id):
    return db.scalar(select(RoomUserBan).where(RoomUserBan.room_id==room_id,RoomUserBan.user_id==user_id,
        RoomUserBan.active.is_(True),or_(RoomUserBan.expires_at.is_(None),RoomUserBan.expires_at>datetime.now(timezone.utc))).order_by(RoomUserBan.id.desc()))

def require_room_access(db,room_id,user_id):
    ban=active_room_user_ban(db,room_id,user_id)
    if ban:raise HTTPException(403,detail={'code':'room_user_banned','message':'Yönetim tarafından bu odadan yasaklandınız.','expires_at':ban.expires_at.isoformat() if ban.expires_at else None})
