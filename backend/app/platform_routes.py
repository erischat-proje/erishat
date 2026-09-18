from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Conversation, ConversationMember, Message, User
from .platform_models import (
    DiscoveryPreference, Family, FamilyDonation, FamilyMember, FanProfile, GameBet,
    GameRound, Notification, Report, RoomAnnouncement, UserBlock, UserFollow, UserLocation, UserPrivacy, VipStatus,
)
from .room_models import Room, RoomGiftEvent, RoomMember
from .admin_models import AdminRole
from .system_logs import record

router = APIRouter(prefix="/v1", tags=["platform"])

VIP_SPEND_THRESHOLDS = {1: 1_000, 2: 5_000, 3: 15_000, 4: 30_000, 5: 60_000, 6: 120_000, 7: 250_000, 8: 500_000, 9: 1_000_000, 10: 2_000_000, 11: 5_000_000, 12: 10_000_000}

VIP_PERKS = {
    1: ["vip_badge", "custom_avatar", "custom_frame"],
    2: ["vip_badge_2"],
    3: ["neon_name", "neon_palette_20"],
    4: ["vip_entry_message"],
    5: ["vip_entry_effect"],
    6: ["room_open_announcement"],
    7: ["vip_lidya_bonus_5000", "gender_change_10000"],
    8: ["room_lock_half_price"],
    9: ["moderator_kick_immunity"],
    10: ["knight_badge", "free_wallpaper"],
    11: ["free_locked_room"],
    12: ["respected_knight", "crown"],
}

FAN_THRESHOLDS = [100, 500, 2_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000]
FAMILY_LEVELS = {
    1: {"capacity": 30, "required": 0}, 2: {"capacity": 40, "required": 40_000}, 3: {"capacity": 50, "required": 100_000},
    4: {"capacity": 60, "required": 200_000}, 5: {"capacity": 70, "required": 350_000}, 6: {"capacity": 80, "required": 610_000},
    7: {"capacity": 90, "required": 890_000}, 8: {"capacity": 100, "required": 1_130_000}, 9: {"capacity": 110, "required": 1_500_000},
    10: {"capacity": 120, "required": 2_000_000}, 11: {"capacity": 130, "required": 2_600_000}, 12: {"capacity": 140, "required": 3_200_000},
}
ROULETTE = [
    {"key": "rose", "weight": 45.0, "multiplier": 0.0}, {"key": "heart", "weight": 20.0, "multiplier": 1.1},
    {"key": "star", "weight": 12.0, "multiplier": 1.3}, {"key": "diamond", "weight": 8.0, "multiplier": 1.6},
    {"key": "crown", "weight": 6.0, "multiplier": 2.0}, {"key": "gift", "weight": 4.0, "multiplier": 2.5},
    {"key": "fire", "weight": 3.0, "multiplier": 3.0}, {"key": "gem", "weight": 1.5, "multiplier": 4.0},
    {"key": "jackpot", "weight": 0.5, "multiplier": 6.0},
]
CUPS = {"cup_1", "cup_2", "cup_3", "cup_4"}

class PrivacyUpdate(BaseModel):
    hide_vip: bool | None = None; hide_vip_badge: bool | None = None; hide_vip_neon: bool | None = None
    hide_vip_entry: bool | None = None; hide_vip_title: bool | None = None; hide_location: bool | None = None
class LocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90); longitude: float = Field(ge=-180, le=180); city: str = Field(min_length=1, max_length=128)
class DiscoveryUpdate(BaseModel):
    gender_filter: str = Field(pattern="^(female|male|any)$"); random_enabled: bool = True
class ReportCreate(BaseModel):
    target_user_id: str | None = None; room_id: str | None = None; message_id: int | None = None
    category: str = Field(min_length=1, max_length=32); reason: str = Field(min_length=3, max_length=2000)
class FamilyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
class FamilyDonationCreate(BaseModel):
    amount: int = Field(ge=1, le=10_000_000)
class FamilyMemberUpdate(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
class GameBetCreate(BaseModel):
    choice: str = Field(min_length=1, max_length=32); amount: int = Field(ge=1, le=1_000_000)

def vip_level_from_spend(total_spent: int) -> int:
    level = 0
    for candidate, required in VIP_SPEND_THRESHOLDS.items():
        if total_spent >= required: level = candidate
    return level

def vip_row(db: Session, user_id: str) -> VipStatus:
    row = db.get(VipStatus, user_id)
    if not row: row = VipStatus(user_id=user_id, level=0, total_spent=0); db.add(row); db.flush()
    return row
def privacy_row(db: Session, user_id: str) -> UserPrivacy:
    row = db.get(UserPrivacy, user_id)
    if not row: row = UserPrivacy(user_id=user_id); db.add(row); db.flush()
    return row
def family_level(balance: int) -> int:
    level = 1
    for candidate, rule in FAMILY_LEVELS.items():
        if balance >= rule["required"]: level = candidate
    return level
def fan_level(total: int) -> int:
    level = 1
    for i, threshold in enumerate(FAN_THRESHOLDS, start=1):
        if total >= threshold: level = i
    return level
def distance_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    r = 6371.0088; p1, p2 = math.radians(a_lat), math.radians(b_lat); dp = math.radians(b_lat-a_lat); dl = math.radians(b_lon-a_lon)
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*r*math.asin(math.sqrt(h))
def user_can_show_vip(db: Session, user_id: str, field: str) -> bool:
    privacy = db.get(UserPrivacy, user_id); return True if not privacy else not bool(getattr(privacy, field, False))
def require_family_member(db: Session, family_id: str, user_id: str) -> Family:
    family = db.get(Family, family_id)
    if not family: raise HTTPException(status_code=404, detail="Aile bulunamadı")
    exists = db.scalar(select(FamilyMember.id).where(FamilyMember.family_id == family_id, FamilyMember.user_id == user_id))
    if not exists: raise HTTPException(status_code=403, detail="Bu ailenin üyesi değilsiniz")
    return family

@router.get("/me/privacy")
def get_privacy(db: Session = Depends(get_db), user: User = Depends(lambda: None)):
    raise HTTPException(status_code=500, detail="auth dependency not configured")

def register_platform_auth(current_user_dependency):
    for route in list(router.routes):
        if getattr(route, "path", "") == "/v1/me/privacy": router.routes.remove(route)
    @router.get("/me/privacy")
    def get_privacy_auth(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        p=privacy_row(db,user.id); db.commit(); return {k:getattr(p,k) for k in ("hide_vip","hide_vip_badge","hide_vip_neon","hide_vip_entry","hide_vip_title","hide_location")}
    @router.patch("/me/privacy")
    def update_privacy(payload: PrivacyUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        p=privacy_row(db,user.id)
        for key,value in payload.model_dump(exclude_none=True).items(): setattr(p,key,value)
        db.commit(); return {k:getattr(p,k) for k in ("hide_vip","hide_vip_badge","hide_vip_neon","hide_vip_entry","hide_vip_title","hide_location")}
    @router.get("/me/vip")
    def my_vip(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        v=vip_row(db,user.id); db.commit(); title = ("VIP Taç" if v.level >= 12 else "VIP Şövalye" if v.level >= 10 else "VIP Elit" if v.level >= 5 else "VIP Üye" if v.level >= 1 else "")
        badge = "👑" if v.level >= 12 else "♞" if v.level >= 10 else "💎" if v.level >= 1 else ""
        neon = v.neon_color or ("gold" if v.level >= 12 else "violet" if v.level >= 3 else None)
        return {"level":v.level,"total_spent":int(v.total_spent or 0),"next_level":v.level+1 if v.level < 12 else None,"next_level_spent":VIP_SPEND_THRESHOLDS.get(v.level+1),"perks":sorted({p for level in range(1,v.level+1) for p in VIP_PERKS.get(level,[])}),"neon_color":neon,"entry_effect":v.entry_effect,"badge":badge,"title":title,"neon_enabled":v.level >= 3}
    @router.get("/users/{user_id}/vip")
    def public_vip(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        target=db.get(User,user_id)
        if not target: raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        v=vip_row(db,user_id); p=privacy_row(db,user_id)
        if p.hide_vip: return {"level":0,"hidden":True,"perks":[]}
        return {"level":v.level,"hidden":False,"badge_hidden":p.hide_vip_badge,"neon_hidden":p.hide_vip_neon,"entry_hidden":p.hide_vip_entry,"title_hidden":p.hide_vip_title,"perks":sorted({x for level in range(1,v.level+1) for x in VIP_PERKS.get(level,[])})}
    @router.put("/me/location")
    def set_location(payload: LocationUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row=db.get(UserLocation,user.id)
        if not row: row=UserLocation(user_id=user.id,latitude=payload.latitude,longitude=payload.longitude,city=payload.city.strip()); db.add(row)
        else: row.latitude,row.longitude,row.city=payload.latitude,payload.longitude,payload.city.strip()
        db.commit(); return {"saved":True,"city":row.city}
    @router.get("/me/location")
    def get_location(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row=db.get(UserLocation,user.id)
        if not row: raise HTTPException(status_code=409,detail="Konum izni gerekli")
        return {"city":row.city}
    @router.get("/me/discovery")
    def get_discovery(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        p=db.get(DiscoveryPreference,user.id) or DiscoveryPreference(user_id=user.id)
        if not db.get(DiscoveryPreference,user.id): db.add(p); db.commit()
        return {"gender_filter":p.gender_filter,"random_enabled":p.random_enabled}
    @router.patch("/me/discovery")
    def update_discovery(payload: DiscoveryUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        p=db.get(DiscoveryPreference,user.id)
        if not p: p=DiscoveryPreference(user_id=user.id); db.add(p)
        p.gender_filter,p.random_enabled=payload.gender_filter,p.random_enabled; db.commit(); return {"gender_filter":p.gender_filter,"random_enabled":p.random_enabled}
    @router.post("/reports",status_code=201)
    def create_report(payload: ReportCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        if not any((payload.target_user_id,payload.room_id,payload.message_id)): raise HTTPException(status_code=400,detail="Şikayet hedefi gerekli")
        report=Report(reporter_id=user.id,**payload.model_dump()); db.add(report); db.commit(); db.refresh(report)
        record("report", "user_report_created", report_id=report.id, reporter_id=user.id, reporter_nickname=user.nickname,
               target_user_id=report.target_user_id, room_id=report.room_id, message_id=report.message_id,
               category=report.category, reason=report.reason, status=report.status)
        return {"id":report.id,"status":report.status}
    @router.get("/me/reports")
    def my_reports(limit:int=Query(50,ge=1,le=100),db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        rows=list(db.scalars(select(Report).where(Report.reporter_id==user.id).order_by(Report.created_at.desc()).limit(limit)))
        return [{"id":r.id,"target_user_id":r.target_user_id,"room_id":r.room_id,"message_id":r.message_id,"category":r.category,"reason":r.reason,"status":r.status,"created_at":r.created_at} for r in rows]
    @router.get("/discover/rooms")
    def discover_rooms(limit:int=Query(50,ge=1,le=100),offset:int=Query(0,ge=0),db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        rows=[]; rooms=list(db.scalars(select(Room).order_by(Room.created_at.desc()).limit(300)))
        for room in rooms:
            members=int(db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id==room.id)) or 0)
            if members<=0: continue
            rows.append({"room_id":room.id,"name":room.name,"owner_id":room.owner_id,"member_count":members,"level":room.level,"locked":room.locked})
        rows.sort(key=lambda x:(-x["member_count"],-x["level"],x["room_id"])); return rows[offset:offset+limit]
    def location_or_409(db:Session,user_id:str)->UserLocation:
        row=db.get(UserLocation,user_id)
        if not row: raise HTTPException(status_code=409,detail="Konum izni gerekli")
        return row
    def candidate_users(db:Session,user:User,max_km:float)->list[tuple[User,float]]:
        origin=location_or_409(db,user.id); pref=db.get(DiscoveryPreference,user.id); wanted=pref.gender_filter if pref else "any"; result=[]
        for loc in list(db.scalars(select(UserLocation).where(UserLocation.user_id!=user.id))):
            target=db.get(User,loc.user_id)
            if not target or not target.is_active or (wanted!="any" and target.gender!=wanted): continue
            d=distance_km(origin.latitude,origin.longitude,loc.latitude,loc.longitude)
            if d<=max_km: result.append((target,d))
        result.sort(key=lambda item:item[1]); return result
    @router.get("/discover/nearby")
    def nearby(limit:int=Query(20,ge=1,le=50),db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        result=candidate_users(db,user,20)[:limit]; return [{"user_id":u.id,"nickname":u.nickname,"avatar":u.avatar,"gender":u.gender,"city":db.get(UserLocation,u.id).city,"distance_km":round(d,1)} for u,d in result]
    @router.post("/discover/random-chat")
    def random_chat(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        candidates=candidate_users(db,user,30)
        if not candidates: raise HTTPException(status_code=404,detail="Uygun eşleşme bulunamadı")
        target,d=random.choice(candidates); conversation_id="dm_"+"_".join(sorted((user.id,target.id))); conversation=db.get(Conversation,conversation_id)
        if not conversation:
            conversation=Conversation(id=conversation_id); db.add(conversation); db.flush(); db.add_all([ConversationMember(conversation_id=conversation_id,user_id=user.id),ConversationMember(conversation_id=conversation_id,user_id=target.id)]); db.commit()
        return {"conversation_id":conversation.id,"user_id":target.id,"nickname":target.nickname,"distance_km":round(d,1)}
    @router.post("/discover/random-room")
    def random_room(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        rooms=list(db.scalars(select(Room).order_by(Room.created_at.desc()).limit(300))); candidates=[]
        for room in rooms:
            members=int(db.scalar(select(RoomMember.id).where(RoomMember.room_id==room.id).limit(1)) is not None)
            if members and not room.locked: candidates.append(room)
        if not candidates: raise HTTPException(status_code=404,detail="Uygun oda bulunamadı")
        room=random.choice(candidates); return {"room_id":room.id,"name":room.name,"member_count":int(db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id==room.id)) or 0)}
    @router.get("/conversations")
    def conversations(limit:int=Query(50,ge=1,le=100),offset:int=Query(0,ge=0),db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        ids=list(db.scalars(select(ConversationMember.conversation_id).where(ConversationMember.user_id==user.id).order_by(ConversationMember.conversation_id).offset(offset).limit(limit)))
        return [] if not ids else [db.get(Conversation,conversation_id) for conversation_id in ids]
    @router.get("/conversations/{conversation_id}")
    def conversation(conversation_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        conversation=db.get(Conversation,conversation_id)
        if not conversation: raise HTTPException(status_code=404,detail="Konuşma bulunamadı")
        member=db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==user.id))
        if not member: raise HTTPException(status_code=403,detail="Bu konuşmaya erişiminiz yok")
        return {"id":conversation.id,"members":[{"user_id":m.user_id} for m in conversation.members]}
    @router.post("/conversations")
    def create_conversation(payload:dict,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        participant_id=str(payload.get("participant_id") or "")
        if not participant_id or participant_id==user.id: raise HTTPException(status_code=400,detail="Geçerli katılımcı gerekli")
        target=db.get(User,participant_id)
        if not target: raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        conversation_id="dm_"+"_".join(sorted((user.id,target.id))); conversation=db.get(Conversation,conversation_id)
        if not conversation:
            conversation=Conversation(id=conversation_id); db.add(conversation); db.flush(); db.add_all([ConversationMember(conversation_id=conversation_id,user_id=user.id),ConversationMember(conversation_id=conversation_id,user_id=target.id)]); db.commit()
        return {"id":conversation.id,"members":[{"user_id":m.user_id} for m in conversation.members]}
    @router.get("/messages/{conversation_id}")
    def messages(conversation_id:str,limit:int=Query(100,ge=1,le=200),offset:int=Query(0,ge=0),db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        member=db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==user.id))
        if not member: raise HTTPException(status_code=403,detail="Bu konuşmaya erişiminiz yok")
        return list(db.scalars(select(Message).where(Message.conversation_id==conversation_id).order_by(Message.created_at.asc()).offset(offset).limit(limit)))
    @router.post("/messages/{conversation_id}")
    def send_message(conversation_id:str,payload:dict,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        member=db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==user.id))
        if not member: raise HTTPException(status_code=403,detail="Bu konuşmaya erişiminiz yok")
        text=str(payload.get("text") or "").strip()
        if not text: raise HTTPException(status_code=400,detail="Mesaj boş olamaz")
        message=Message(conversation_id=conversation_id,sender_id=user.id,text=text); db.add(message); db.commit(); db.refresh(message); return message
    @router.get("/users/{user_id}")
    def public_user(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        target=db.get(User,user_id)
        if not target: raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        admin = db.get(AdminRole, target.id)
        visible_public_id = None if admin and admin.role in {"SA", "UA", "DA"} else target.public_id
        return {"id":target.id,"public_id":visible_public_id,"nickname":target.nickname,"avatar":target.avatar,"gender":target.gender,"avatar_asset":getattr(target,"avatar_asset",None),"frame_asset":getattr(target,"frame_asset",None)}
    @router.post("/users/{user_id}/follow", status_code=201)
    def follow_user(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        if user_id==user.id: raise HTTPException(status_code=400,detail="Kendinizi takip edemezsiniz")
        if not db.get(User,user_id): raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        if db.scalar(select(UserFollow.id).where(UserFollow.follower_id==user.id,UserFollow.following_id==user_id)):
            return {"following":True,"created":False}
        row=UserFollow(follower_id=user.id,following_id=user_id); db.add(row)
        db.add(Notification(user_id=user_id,kind="follow",title="Yeni takipçi",body=user.nickname+" sizi takip etti.")); db.commit()
        return {"following":True,"created":True}
    @router.delete("/users/{user_id}/follow")
    def unfollow_user(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        row=db.scalar(select(UserFollow).where(UserFollow.follower_id==user.id,UserFollow.following_id==user_id))
        if row: db.delete(row); db.commit()
        return {"following":False}
    @router.get("/users/{user_id}/followers")
    def followers(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        rows=list(db.scalars(select(UserFollow).where(UserFollow.following_id==user_id).order_by(UserFollow.created_at.desc()).limit(200)))
        return [{"user_id":r.follower_id,"created_at":r.created_at} for r in rows]
    @router.get("/users/{user_id}/following")
    def following(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        rows=list(db.scalars(select(UserFollow).where(UserFollow.follower_id==user_id).order_by(UserFollow.created_at.desc()).limit(200)))
        return [{"user_id":r.following_id,"created_at":r.created_at} for r in rows]
    @router.post("/users/{user_id}/block")
    def block_user(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        if user_id==user.id: raise HTTPException(status_code=400,detail="Kendinizi engelleyemezsiniz")
        if not db.get(User,user_id): raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        if not db.scalar(select(UserBlock.id).where(UserBlock.blocker_id==user.id,UserBlock.blocked_id==user_id)):
            db.add(UserBlock(blocker_id=user.id,blocked_id=user_id)); db.commit()
        return {"blocked":True}
    @router.delete("/users/{user_id}/block")
    def unblock_user(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        row=db.scalar(select(UserBlock).where(UserBlock.blocker_id==user.id,UserBlock.blocked_id==user_id))
        if row: db.delete(row); db.commit()
        return {"blocked":False}
    @router.get("/me/blocks")
    def my_blocks(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        rows=list(db.scalars(select(UserBlock).where(UserBlock.blocker_id==user.id).order_by(UserBlock.created_at.desc())))
        return [{"user_id":r.blocked_id,"created_at":r.created_at} for r in rows]
    @router.get("/me/notifications")
    def notifications(limit:int=Query(50,ge=1,le=100),db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        rows=list(db.scalars(select(Notification).where(Notification.user_id==user.id).order_by(Notification.created_at.desc()).limit(limit)))
        return [{"id":r.id,"kind":r.kind,"title":r.title,"body":r.body,"read":r.read,"created_at":r.created_at} for r in rows]
    @router.post("/me/notifications/{notification_id}/read")
    def mark_notification_read(notification_id:int,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        row=db.get(Notification,notification_id)
        if not row or row.user_id!=user.id: raise HTTPException(status_code=404,detail="Bildirim bulunamadı")
        row.read=True; db.commit(); return {"read":True}
    @router.get("/users/{user_id}/fans")
    def fans(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        total=int(db.scalar(select(func.count(UserFollow.id)).where(UserFollow.following_id==user_id)) or 0)
        return {"user_id":user_id,"total":total,"level":fan_level(total)}
    @router.get("/users/{user_id}/profile-gifts")
    def profile_gifts(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        rows=list(db.scalars(select(RoomGiftEvent).where(RoomGiftEvent.recipient_id==user_id).order_by(RoomGiftEvent.created_at.desc()).limit(100)))
        return [{"gift":r.gift_key,"amount":r.total_price,"from_user_id":r.sender_id,"created_at":r.created_at} for r in rows]
    @router.post("/game/bet")
    def game_bet(payload:GameBetCreate,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        if payload.choice not in {"rose","heart","star","diamond","crown","gift","fire","gem","jackpot"}: raise HTTPException(status_code=400,detail="Geçersiz seçim")
        result=random.choices(ROULETTE,weights=[item["weight"] for item in ROULETTE],k=1)[0]; payout=int(payload.amount*result["multiplier"]); row=GameBet(user_id=user.id,choice=payload.choice,amount=payload.amount,result=result["key"],payout=payout); db.add(row); db.commit(); db.refresh(row); return {"id":row.id,"choice":row.choice,"result":row.result,"payout":row.payout}
    @router.post("/game/cups")
    def game_cups(payload:GameBetCreate,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        if payload.choice not in CUPS: raise HTTPException(status_code=400,detail="Geçersiz kupa")
        result=random.choice(sorted(CUPS)); payout=payload.amount*3 if result==payload.choice else 0; row=GameBet(user_id=user.id,choice=payload.choice,amount=payload.amount,result=result,payout=payout); db.add(row); db.commit(); db.refresh(row); return {"id":row.id,"choice":row.choice,"result":row.result,"payout":row.payout}
    @router.get("/rooms/{room_id}/announcement")
    def room_announcement(room_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        row=db.scalar(select(RoomAnnouncement).where(RoomAnnouncement.room_id==room_id).order_by(RoomAnnouncement.created_at.desc())); return {"room_id":room_id,"message":row.message if row else ""}
