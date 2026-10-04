"""Additive appearances, server-verified task rewards and independent room leases."""
import json
from functools import lru_cache
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import DateTime, ForeignKey, String, func, select
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base, get_db
from .models import User, UserCosmetic, Message

class TaskEvent(Base):
    __tablename__='appearance_task_events'
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),primary_key=True)
    kind:Mapped[str]=mapped_column(String(32),primary_key=True)
    event_key:Mapped[str]=mapped_column(String(128),primary_key=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class RoomAppearanceLease(Base):
    __tablename__='room_appearance_leases'
    room_id:Mapped[str]=mapped_column(ForeignKey('rooms.id',ondelete='CASCADE'),primary_key=True)
    asset_key:Mapped[str]=mapped_column(String(255),primary_key=True)
    paid_until:Mapped[datetime]=mapped_column(DateTime(timezone=True),nullable=False)

@lru_cache(maxsize=1)
def data():return json.loads(Path(__file__).with_name('shop_expansion.json').read_text(encoding='utf-8'))
def find(key,kind):return next((i for i in data()['items'] if i['asset_key']==key and i['type']==kind),None)
def owns(db,uid,key,kind):return db.scalar(select(UserCosmetic.id).where(UserCosmetic.user_id==uid,UserCosmetic.cosmetic_type==kind,UserCosmetic.asset_key==key)) is not None
def selected_entry(db,user):
    from .platform_models import VipStatus
    status=db.get(VipStatus,user.id);key=status.entry_effect if status else None;item=find(key,'entrance')
    return key if item and item['gender']==user.gender and owns(db,user.id,key,'entrance') else None
def record_event(db,uid,kind,key):
    # A per-user lock and composite key prevent duplicate progress on reconnects.
    db.scalar(select(User).where(User.id==uid).with_for_update())
    if not db.get(TaskEvent,(uid,kind,str(key))):db.add(TaskEvent(user_id=uid,kind=kind,event_key=str(key)))
def utc(value):return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
LABELS={'days':'Görev ekranını farklı günlerde aç','room_messages':'Odalarda mesaj gönder','messages':'Özel mesaj gönder','rooms':'Farklı odalara katıl','follows':'Farklı kullanıcıları takip et','room_follows':'Farklı odaları takip et','posts':'Gönderi paylaş','stories':'Hikâye paylaş'}
def progress(db,uid):
    from .platform_models import UserFollow,SocialPost,SocialStory
    from .room_models import RoomChatMessage,RoomFollow
    from .seat_workflow import RoomSystemEntry
    events=dict(db.execute(select(TaskEvent.kind,func.count()).where(TaskEvent.user_id==uid).group_by(TaskEvent.kind)).all())
    sources={'room_messages':(RoomChatMessage,RoomChatMessage.user_id),'messages':(Message,Message.sender_id),'follows':(UserFollow,UserFollow.follower_id),'room_follows':(RoomFollow,RoomFollow.user_id)}
    result={kind:int(events.get(kind,0)) for kind in ('days','rooms','posts','stories')}
    for metric,(model,column) in sources.items():
        q=select(func.count()).select_from(model).where(column==uid)
        if metric=='room_messages':q=q.where(func.length(func.trim(RoomChatMessage.text))>0,~select(RoomSystemEntry.message_id).where(RoomSystemEntry.message_id==RoomChatMessage.id).exists())
        if metric=='messages':q=q.where(func.length(func.trim(Message.text))>0)
        if metric=='follows':q=q.where(UserFollow.following_id!=uid)
        result[metric]=int(db.scalar(q) or 0)
    return result
def backfill_content(db,uid):
    # Existing posts/stories remain eligible; later content deletion does not erase progress.
    from .platform_models import SocialPost,SocialStory
    for kind,model in (('posts',SocialPost),('stories',SocialStory)):
        known=set(db.scalars(select(TaskEvent.event_key).where(TaskEvent.user_id==uid,TaskEvent.kind==kind)))
        for row_id in db.scalars(select(model.id).where(model.user_id==uid)):
            if str(row_id) not in known:db.add(TaskEvent(user_id=uid,kind=kind,event_key=str(row_id)))
def task_rows(db,user):
    values=progress(db,user.id);keys=set(db.scalars(select(UserCosmetic.asset_key).where(UserCosmetic.user_id==user.id,UserCosmetic.cosmetic_type=='title')))
    return [{**q,'description':LABELS[q['metric']],'progress':min(values[q['metric']],q['target']),'complete':values[q['metric']]>=q['target'],'claimed':q['reward']['asset_key'] in keys} for q in data()['quests']]
def room_inventory(db,user):
    from .room_models import Room,RoomWallpaper,RoomWallpaperState
    from .wallpapers import find as wall
    rows=db.execute(select(RoomAppearanceLease,Room.name,RoomWallpaper.asset_key,RoomWallpaperState.applied).join(Room,Room.id==RoomAppearanceLease.room_id).outerjoin(RoomWallpaper,RoomWallpaper.room_id==Room.id).outerjoin(RoomWallpaperState,RoomWallpaperState.room_id==Room.id).where(Room.owner_id==user.id)).all()
    now=datetime.now(timezone.utc);items=[]
    for lease,name,key,applied in rows:
        item=wall(lease.asset_key)
        if not item:continue
        expired=utc(lease.paid_until)<=now
        items.append(dict(type='room_wallpaper',asset_key=lease.asset_key,asset=item['asset'],name=item['name'],source='rental',room_id=lease.room_id,room_name=name,expires_at=utc(lease.paid_until),expired=expired,equipped=not expired and key==lease.asset_key and bool(applied),equip_key=lease.asset_key))
    return items

router=APIRouter(prefix='/v1',tags=['appearance-tasks'])
from .cosmetic_routes import current_cosmetic_user
@router.get('/me/appearance-tasks')
def list_tasks(user=Depends(current_cosmetic_user),db=Depends(get_db)):
    day=datetime.now(ZoneInfo('Europe/Istanbul')).date().isoformat();record_event(db,user.id,'days',day);backfill_content(db,user.id);db.flush();rows=task_rows(db,user);db.commit()
    return {'items':rows,'reset_timezone':'Europe/Istanbul'}
@router.post('/me/appearance-tasks/{task_id}/claim')
def claim_task(task_id:str,user=Depends(current_cosmetic_user),db=Depends(get_db)):
    user=db.scalar(select(User).where(User.id==user.id).with_for_update());quest=next((q for q in data()['quests'] if q['id']==task_id),None)
    if not quest:raise HTTPException(404,'Görev bulunamadı.')
    key=quest['reward']['asset_key']
    if owns(db,user.id,key,'title'):return {'ok':True,'already_claimed':True,'asset_key':key}
    backfill_content(db,user.id);db.flush()
    if progress(db,user.id)[quest['metric']]<quest['target']:raise HTTPException(403,'Görev henüz tamamlanmadı.')
    db.add(UserCosmetic(user_id=user.id,cosmetic_type='title',asset_key=key));db.commit()
    return {'ok':True,'already_claimed':False,'asset_key':key,'reward':quest['reward']}
