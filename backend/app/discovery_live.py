"""Shared online leases and personalized, live discovery snapshots."""
import asyncio
import hashlib
import json
import math
from datetime import datetime,timedelta,timezone
from uuid import uuid4
from zoneinfo import ZoneInfo
from fastapi import APIRouter,Depends,HTTPException,Query,WebSocket,WebSocketDisconnect
from pydantic import BaseModel,Field
from sqlalchemy import Boolean,DateTime,ForeignKey,String,delete,func,select
from sqlalchemy.orm import Mapped,Session,mapped_column
from .db import Base,get_db
from .models import User
from .room_models import Room,RoomMember,RoomGiftEvent
from .platform_models import UserLocation,UserPrivacy,DiscoveryPreference,UserFollow,UserBlock
from .admin_models import AdminRole,UserBan,RoomAdminBan
from .room_ban_models import RoomUserBan

class LiveConnection(Base):
    __tablename__='discovery_live_connections'
    id:Mapped[str]=mapped_column(String(64),primary_key=True)
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),index=True)

router=APIRouter(tags=['live-discovery'])
def now():return datetime.now(timezone.utc)
def utc(value):return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
def lease(db,user_id,key,active=True):
    row=db.get(LiveConnection,key)
    if row and row.user_id!=user_id:raise HTTPException(403,'Bağlantı anahtarı size ait değil.')
    if active:
        if not row:row=LiveConnection(id=key,user_id=user_id,expires_at=now());db.add(row)
        row.expires_at=now()+timedelta(seconds=65)
    elif row:db.delete(row)
    db.execute(delete(LiveConnection).where(LiveConnection.expires_at<now()))
    db.commit()

def online_ids(db):
    ids=set(db.scalars(select(LiveConnection.user_id).join(User,User.id==LiveConnection.user_id).where(LiveConnection.expires_at>now(),User.is_active.is_(True))))
    ghosts=set(db.scalars(select(AdminRole.user_id).where(AdminRole.role=='DA',AdminRole.ghost_mode.is_(True))))
    banned=set(db.scalars(select(UserBan.user_id).where(UserBan.active.is_(True),(UserBan.expires_at.is_(None))|(UserBan.expires_at>now()))))
    return ids-ghosts-banned

def blocked(db,uid):
    rows=list(db.execute(select(UserBlock.blocker_id,UserBlock.blocked_id).where((UserBlock.blocker_id==uid)|(UserBlock.blocked_id==uid))))
    return {b if a==uid else a for a,b in rows}

def rooms(db,user,following=False,limit=100,online=None):
    online=online_ids(db) if online is None else online
    if not online:return []
    counts=dict(db.execute(select(RoomMember.room_id,func.count(RoomMember.id)).where(RoomMember.user_id.in_(online),RoomMember.ghost.is_(False)).group_by(RoomMember.room_id)).all())
    hidden=blocked(db,user.id)
    banned_rooms=set(db.scalars(select(RoomUserBan.room_id).where(RoomUserBan.user_id==user.id,RoomUserBan.active.is_(True),(RoomUserBan.expires_at.is_(None))|(RoomUserBan.expires_at>now()))))
    admin=db.get(AdminRole,user.id)
    if not admin:banned_rooms.update(db.scalars(select(RoomAdminBan.room_id).where(RoomAdminBan.active.is_(True),(RoomAdminBan.expires_at.is_(None))|(RoomAdminBan.expires_at>now()))))
    followed=set(db.scalars(select(UserFollow.following_id).where(UserFollow.follower_id==user.id))) & (online-hidden) if following else set()
    followed_rooms=set(db.scalars(select(RoomMember.room_id).where(RoomMember.user_id.in_(followed),RoomMember.ghost.is_(False)))) if followed else set()
    day=now().astimezone(ZoneInfo('Europe/Istanbul')).replace(hour=0,minute=0,second=0,microsecond=0)
    start=day.astimezone(timezone.utc);end=(day+timedelta(days=1)).astimezone(timezone.utc)
    volumes=dict(db.execute(select(RoomGiftEvent.room_id,func.coalesce(func.sum(RoomGiftEvent.total_price),0)).where(RoomGiftEvent.created_at>=start,RoomGiftEvent.created_at<end).group_by(RoomGiftEvent.room_id)).all())
    rows=[]
    for room in db.scalars(select(Room).where(Room.is_active.is_(True),Room.id.in_(counts))):
        if room.owner_id in hidden or room.id in banned_rooms:continue
        if following and room.owner_id not in followed and room.id not in followed_rooms:continue
        locked=bool(room.locked and (not room.lock_expires_at or utc(room.lock_expires_at)>now()))
        rows.append({'id':room.id,'room_id':room.id,'public_id':room.public_id,'owner_id':room.owner_id,'name':room.name,'level':room.level,
            'member_count':counts[room.id],'locked':locked,'password_set':locked,'daily_gift_lidya':str(volumes.get(room.id,0))})
    rows.sort(key=lambda r:(-r['member_count'],-int(r['daily_gift_lidya']),r['id']))
    return rows[:limit]

def distance(a,b):
    lat1,lat2=math.radians(a.latitude),math.radians(b.latitude)
    angle=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b.longitude-a.longitude)/2)**2
    return 6371*2*math.asin(math.sqrt(max(0,min(1,angle))))

def people(db,user,limit=100,online=None):
    origin=db.get(UserLocation,user.id)
    if not origin:raise HTTPException(409,'Yakındaki kişileri görmek için konum izni verin.')
    preference=db.get(DiscoveryPreference,user.id);gender=preference.gender_filter if preference else 'any'
    online=online_ids(db) if online is None else online;hidden=blocked(db,user.id)
    rows=[]
    # One joined query keeps location/privacy/role filtering consistent.
    query=select(User,UserLocation,UserPrivacy,AdminRole).join(UserLocation,UserLocation.user_id==User.id).outerjoin(UserPrivacy,UserPrivacy.user_id==User.id).outerjoin(AdminRole,AdminRole.user_id==User.id).where(User.id.in_(online-{user.id}-hidden))
    if gender!='any':query=query.where(User.gender==gender)
    for target,loc,privacy,admin in db.execute(query):
        if privacy and privacy.hide_location:continue
        d=distance(origin,loc)
        rows.append({'user_id':target.id,'public_id':None if admin else target.public_id,'nickname':target.nickname,'avatar':target.avatar,
            'avatar_asset':target.avatar_asset,'frame_asset':target.frame_asset,'gender':target.gender,'city':loc.city,'online':True,'distance_km':round(d,1),'_distance':d})
    rows.sort(key=lambda r:(r['_distance'],r['user_id']))
    for r in rows:r.pop('_distance')
    return rows[:limit]

def snapshot(db,user):
    online=online_ids(db);pref=db.get(DiscoveryPreference,user.id)
    data={'rooms':rooms(db,user,online=online),'following':rooms(db,user,True,online=online),'gender_filter':pref.gender_filter if pref else 'any','location_required':False}
    try:data['people']=people(db,user,online=online)
    except HTTPException as exc:
        if exc.status_code!=409:raise
        data.update(people=[],location_required=True,location_message=exc.detail)
    return data

class Presence(BaseModel):
    connection_id:str=Field(min_length=32,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')
    active:bool=True

def register_auth(current_user,engine,token_from_socket,user_from_token,session_active):
    @router.post('/v1/discover/presence')
    def presence(payload:Presence,db:Session=Depends(get_db),user:User=Depends(current_user)):
        lease(db,user.id,payload.connection_id,payload.active);return {'active':payload.active}

    @router.get('/v1/discover/snapshot')
    def get_snapshot(db:Session=Depends(get_db),user:User=Depends(current_user)):return snapshot(db,user)

    @router.get('/v1/discover/following')
    def following(limit:int=Query(100,ge=1,le=100),db:Session=Depends(get_db),user:User=Depends(current_user)):return rooms(db,user,True,limit)

    @router.websocket('/ws/discovery')
    async def live(ws:WebSocket):
        token=token_from_socket(ws)
        if not token or not session_active(token):await ws.close(code=1008);return
        key='ws_'+uuid4().hex
        with Session(engine) as db:
            user=user_from_token(db,token)
            if not user or not user.is_active:await ws.close(code=1008);return
            uid=user.id
            if db.scalar(select(UserBan).where(UserBan.user_id==uid,UserBan.active.is_(True),(UserBan.expires_at.is_(None))|(UserBan.expires_at>now()))):await ws.close(code=1008);return
            lease(db,uid,key)
        await ws.accept(subprotocol='erischat')
        previous='';last_lease=now();visible=True
        try:
            while True:
                if not session_active(token):await ws.close(code=1008);break
                with Session(engine) as db:
                    user=db.get(User,uid)
                    if not user or not user.is_active or db.scalar(select(UserBan).where(UserBan.user_id==uid,UserBan.active.is_(True),(UserBan.expires_at.is_(None))|(UserBan.expires_at>now()))):await ws.close(code=1008);break
                    if visible and (now()-last_lease).total_seconds()>=20:lease(db,uid,key);last_lease=now()
                    data=snapshot(db,user)
                digest=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
                if digest!=previous:
                    await ws.send_json({'type':'discovery_snapshot',**data});previous=digest
                try:
                    message=await asyncio.wait_for(ws.receive_json(),timeout=1)
                    if isinstance(message,dict) and message.get('type')=='presence':
                        visible=message.get('active') is True
                        with Session(engine) as db:lease(db,uid,key,visible)
                        last_lease=now()
                except asyncio.TimeoutError:pass
        except (WebSocketDisconnect,RuntimeError):pass
        finally:
            with Session(engine) as db:lease(db,uid,key,False)
