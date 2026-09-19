from __future__ import annotations

import json
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
    DiscoveryPreference, Family, FamilyDonation, FamilyMember, FanProfile, GameBet, GamePlay,
    GameRound, Notification, Report, RoomAnnouncement, UserBlock, UserFollow, UserLocation, UserPrivacy, VipStatus,
)
from .room_models import Room, RoomGiftEvent, RoomMember, RoomModerator, RoomMusic, RoomChatMessage, RoomBan, RoomSeat
from .admin_models import AdminRole
from .system_logs import record
from .system_data import LidyaGemLedger
from .oyunlar.registry import GAME_ENGINES, is_private_game, is_room_game
from .oyunlar.blackjack import available_actions, display_state

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
class AnnouncementCreate(BaseModel):
    message: str = Field(min_length=1, max_length=500)
class AnnouncementUpdate(BaseModel):
    message: str | None = Field(default=None, min_length=1, max_length=500)
    enabled: bool | None = None
    pinned: bool | None = None
class MusicCreate(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    source_url: str = Field(min_length=8, max_length=2000)
class RoomSeatUpdate(BaseModel):
    seat_number: int = Field(ge=1, le=12)
class RoomChatCreate(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
class MusicPlayback(BaseModel):
    action: str = Field(pattern="^(play|pause|stop|seek)$")
    position_seconds: int | None = Field(default=None, ge=0, le=86400)
class GameBetCreate(BaseModel):
    choice: str = Field(min_length=1, max_length=32); amount: int = Field(ge=1, le=1_000_000)
class BlackjackAction(BaseModel):
    action: str = Field(pattern="^(hit|stand|double|split)$")


class WalletExchange(BaseModel):
    direction: str = Field(pattern="^(lidya_to_gem|gem_to_lidya)$")
    amount: int = Field(ge=1, le=1_000_000_000_000)
    idempotency_key: str = Field(min_length=8, max_length=128)

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
    @router.get("/me/wallet")
    def my_wallet(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        return {"lidya": int(user.lidya or 0), "lidya_gem": int(getattr(user, "lidya_gem", 0) or 0), "exchange_rate": {"lidya_to_gem": 1, "gem_to_lidya": 1}}

    @router.post("/me/wallet/exchange")
    def exchange_wallet(payload: WalletExchange, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        existing = db.scalar(select(LidyaGemLedger).where(
            LidyaGemLedger.user_id == user.id,
            LidyaGemLedger.idempotency_key == payload.idempotency_key,
        ))
        if existing:
            locked = db.get(User, user.id)
            return {
                "success": True, "replayed": True, "direction": json.loads(existing.details).get("direction"),
                "amount": abs(int(existing.delta)), "rate": 1,
                "lidya": int(locked.lidya), "lidya_gem": int(locked.lidya_gem),
                "reference_id": existing.reference_id,
            }

        locked = db.scalar(select(User).where(User.id == user.id).with_for_update())
        if not locked:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        amount = int(payload.amount)
        direction = payload.direction
        before_lidya = int(locked.lidya or 0)
        before_gem = int(locked.lidya_gem or 0)
        if direction == "lidya_to_gem":
            if before_lidya < amount:
                raise HTTPException(status_code=400, detail="Yetersiz Lidya")
            locked.lidya = before_lidya - amount
            locked.lidya_gem = before_gem + amount
        else:
            if before_gem < amount:
                raise HTTPException(status_code=400, detail="Yetersiz Lidya Gem")
            locked.lidya_gem = before_gem - amount
            locked.lidya = before_lidya + amount

        reference_id = str(uuid4())
        details = json.dumps(
            {"direction": direction, "amount": amount, "rate": "1:1"},
            ensure_ascii=False, separators=(",", ":")
        )
        db.info["lidya_operation"] = "currency_exchange"
        db.info["lidya_actor_id"] = locked.id
        db.info["lidya_reference_id"] = reference_id
        db.info["lidya_details"] = details
        db.add(LidyaGemLedger(
            user_id=locked.id,
            delta=amount if direction == "lidya_to_gem" else -amount,
            balance_after=int(locked.lidya_gem),
            operation="currency_exchange",
            reference_id=reference_id,
            idempotency_key=payload.idempotency_key,
            details=details,
        ))
        try:
            db.commit()
        except Exception:
            db.rollback()
            replay = db.scalar(select(LidyaGemLedger).where(
                LidyaGemLedger.user_id == user.id,
                LidyaGemLedger.idempotency_key == payload.idempotency_key,
            ))
            if replay:
                current = db.get(User, user.id)
                data = json.loads(replay.details)
                return {
                    "success": True, "replayed": True, "direction": data["direction"],
                    "amount": abs(int(replay.delta)), "rate": 1,
                    "lidya": int(current.lidya), "lidya_gem": int(current.lidya_gem),
                    "reference_id": replay.reference_id,
                }
            raise
        db.refresh(locked)
        return {
            "success": True, "replayed": False, "direction": direction, "amount": amount, "rate": 1,
            "lidya": int(locked.lidya), "lidya_gem": int(locked.lidya_gem),
            "reference_id": reference_id,
        }

    @router.get("/rooms/{room_id}/rtc-config")
    def room_rtc_config(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room=db.get(Room,room_id)
        if not room: raise HTTPException(status_code=404,detail="Oda bulunamadı")
        member=db.scalar(select(RoomMember.id).where(RoomMember.room_id==room_id,RoomMember.user_id==user.id))
        ban=db.scalar(select(RoomBan.id).where(RoomBan.room_id==room_id,RoomBan.user_id==user.id))
        if not member or ban: raise HTTPException(status_code=403,detail="Odaya erişiminiz yok")
        return {"ice_servers":[{"urls":["stun:stun.l.google.com:19302"]}],"ice_transport_policy":"all"}

    @router.get("/rooms/{room_id}/seats")
    def room_seats(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = db.get(Room, room_id)
        if not room: raise HTTPException(status_code=404, detail="Oda bulunamadı")
        member = db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.user_id == user.id))
        if not member: raise HTTPException(status_code=403, detail="Odaya üye değilsiniz")
        rows = db.scalars(select(RoomSeat).where(RoomSeat.room_id == room_id).order_by(RoomSeat.seat_number)).all()
        occupied={r.seat_number:r for r in rows}
        return [{"seat_number":n,"user_id":occupied[n].user_id if n in occupied else None,"locked":occupied[n].locked if n in occupied else False,"muted":occupied[n].muted if n in occupied else False} for n in range(1,13)]

    @router.post("/rooms/{room_id}/seats")
    def room_take_seat(room_id: str, payload: RoomSeatUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room=db.get(Room,room_id)
        if not room: raise HTTPException(status_code=404,detail="Oda bulunamadı")
        if not db.scalar(select(RoomMember.id).where(RoomMember.room_id==room_id,RoomMember.user_id==user.id)): raise HTTPException(status_code=403,detail="Odaya üye değilsiniz")
        existing=db.scalar(select(RoomSeat).where(RoomSeat.room_id==room_id,RoomSeat.user_id==user.id))
        if existing: raise HTTPException(status_code=409,detail="Zaten bir koltuktasınız")
        seat=db.scalar(select(RoomSeat).where(RoomSeat.room_id==room_id,RoomSeat.seat_number==payload.seat_number))
        if seat and seat.locked: raise HTTPException(status_code=403,detail="Koltuk kilitli")
        if seat and seat.user_id: raise HTTPException(status_code=409,detail="Koltuk dolu")
        if not seat: seat=RoomSeat(room_id=room_id,seat_number=payload.seat_number,user_id=user.id); db.add(seat)
        else: seat.user_id=user.id
        db.commit()
        return {"seat_number":seat.seat_number,"user_id":seat.user_id,"muted":seat.muted,"locked":seat.locked}

    @router.delete("/rooms/{room_id}/seats")
    def room_leave_seat(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        seat=db.scalar(select(RoomSeat).where(RoomSeat.room_id==room_id,RoomSeat.user_id==user.id))
        if not seat: return {"released":False}
        db.delete(seat); db.commit(); return {"released":True}

    @router.patch("/rooms/{room_id}/seats/{seat_number}")
    def room_moderate_seat(room_id: str, seat_number: int, payload: dict, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        if seat_number < 1 or seat_number > 12: raise HTTPException(status_code=422, detail="Geçersiz koltuk")
        room=db.get(Room,room_id)
        if not room: raise HTTPException(status_code=404,detail="Oda bulunamadı")
        allowed = user.id == room.owner_id or db.scalar(select(RoomModerator.id).where(RoomModerator.room_id==room_id,RoomModerator.user_id==user.id))
        if not allowed: raise HTTPException(status_code=403,detail="Yetkiniz yok")
        seat=db.scalar(select(RoomSeat).where(RoomSeat.room_id==room_id,RoomSeat.seat_number==seat_number))
        if not seat:
            seat=RoomSeat(room_id=room_id,seat_number=seat_number); db.add(seat); db.flush()
        changed=False
        if "locked" in payload:
            seat.locked=bool(payload["locked"]); changed=True
        if "muted" in payload:
            seat.muted=bool(payload["muted"]); changed=True
        if not changed: raise HTTPException(status_code=422,detail="locked veya muted gerekli")
        record("room","room_seat_moderated",actor_id=user.id,target_id=room_id,seat_number=seat_number,locked=seat.locked,muted=seat.muted)
        db.commit()
        return {"seat_number":seat.seat_number,"user_id":seat.user_id,"locked":seat.locked,"muted":seat.muted}

    @router.get("/rooms/{room_id}/chat")
    def room_chat_list(room_id: str, before_id: int | None = Query(default=None, ge=1), limit: int = Query(default=50, ge=1, le=100), db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = db.get(Room, room_id)
        if not room: raise HTTPException(status_code=404, detail="Oda bulunamadı")
        member = db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.user_id == user.id))
        if not member: raise HTTPException(status_code=403, detail="Odaya üye değilsiniz")
        q = select(RoomChatMessage).where(RoomChatMessage.room_id == room_id)
        if before_id is not None: q = q.where(RoomChatMessage.id < before_id)
        rows = db.scalars(q.order_by(RoomChatMessage.id.desc()).limit(limit)).all()
        rows.reverse()
        return [{"id": x.id, "room_id": x.room_id, "user_id": x.user_id, "text": x.text, "created_at": x.created_at} for x in rows]

    @router.post("/rooms/{room_id}/chat")
    def room_chat_send(room_id: str, payload: RoomChatCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = db.get(Room, room_id)
        if not room: raise HTTPException(status_code=404, detail="Oda bulunamadı")
        member = db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.user_id == user.id))
        if not member: raise HTTPException(status_code=403, detail="Odaya üye değilsiniz")
        if not room.chat_enabled: raise HTTPException(status_code=403, detail="Oda sohbeti kapalı")
        ban = db.scalar(select(RoomBan.id).where(RoomBan.room_id == room_id, RoomBan.user_id == user.id))
        if ban: raise HTTPException(status_code=403, detail="Bu odada yasaklısınız")
        row = RoomChatMessage(room_id=room_id, user_id=user.id, text=payload.text.strip())
        db.add(row); db.flush()
        record("room", "room_chat_message_created", actor_id=user.id, target_id=room_id, message_id=row.id)
        db.commit()
        db.refresh(row)
        return {"id": row.id, "room_id": row.room_id, "user_id": row.user_id, "text": row.text, "created_at": row.created_at}

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
    def _require_room_announcement_manager(db: Session, room_id: str, user_id: str) -> Room:
        room = db.get(Room, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Oda bulunamadı")
        if room.owner_id != user_id:
            moderator = db.scalar(select(RoomModerator.id).where(RoomModerator.room_id == room_id, RoomModerator.user_id == user_id))
            if not moderator:
                raise HTTPException(status_code=403, detail="Duyuru yönetme yetkiniz yok")
        return room

    @router.get("/rooms/{room_id}/announcements")
    def list_announcements(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = db.get(Room, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Oda bulunamadı")
        member = db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.user_id == user.id))
        if not member:
            raise HTTPException(status_code=403, detail="Bu odaya erişiminiz yok")
        rows = list(db.scalars(select(RoomAnnouncement).where(RoomAnnouncement.room_id == room_id, RoomAnnouncement.enabled == True).order_by(RoomAnnouncement.pinned.desc(), RoomAnnouncement.created_at.desc()).limit(50)))
        return [{"id": r.id, "message": r.message, "enabled": r.enabled, "pinned": r.pinned, "created_at": r.created_at} for r in rows]

    @router.post("/rooms/{room_id}/announcements")
    def create_announcement(room_id: str, payload: AnnouncementCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        _require_room_announcement_manager(db, room_id, user.id)
        row = RoomAnnouncement(room_id=room_id, message=payload.message.strip(), enabled=True, pinned=False)
        db.add(row); db.commit(); db.refresh(row)
        record("system", "room_announcement_created", user_id=user.id, room_id=room_id, announcement_id=row.id)
        return {"id": row.id, "message": row.message, "enabled": row.enabled, "pinned": row.pinned, "created_at": row.created_at}

    @router.patch("/rooms/{room_id}/announcements/{announcement_id}")
    def update_announcement(room_id: str, announcement_id: int, payload: AnnouncementUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        _require_room_announcement_manager(db, room_id, user.id)
        row = db.get(RoomAnnouncement, announcement_id)
        if not row or row.room_id != room_id:
            raise HTTPException(status_code=404, detail="Duyuru bulunamadı")
        data = payload.model_dump(exclude_none=True)
        if "message" in data: row.message = data["message"].strip()
        for key in ("enabled", "pinned"):
            if key in data: setattr(row, key, data[key])
        if row.pinned:
            db.query(RoomAnnouncement).filter(RoomAnnouncement.room_id == room_id, RoomAnnouncement.id != row.id).update({"pinned": False}, synchronize_session=False)
        db.commit(); db.refresh(row)
        record("system", "room_announcement_updated", user_id=user.id, room_id=room_id, announcement_id=row.id)
        return {"id": row.id, "message": row.message, "enabled": row.enabled, "pinned": row.pinned, "created_at": row.created_at}

    @router.delete("/rooms/{room_id}/announcements/{announcement_id}")
    def delete_announcement(room_id: str, announcement_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        _require_room_announcement_manager(db, room_id, user.id)
        row = db.get(RoomAnnouncement, announcement_id)
        if not row or row.room_id != room_id:
            raise HTTPException(status_code=404, detail="Duyuru bulunamadı")
        db.delete(row); db.commit()
        record("system", "room_announcement_deleted", user_id=user.id, room_id=room_id, announcement_id=announcement_id)
        return {"deleted": True, "id": announcement_id}

    def _require_music_manager(db: Session, room_id: str, user_id: str) -> Room:
        room = db.get(Room, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Oda bulunamadı")
        if room.owner_id != user_id and not db.scalar(select(RoomModerator.id).where(RoomModerator.room_id == room_id, RoomModerator.user_id == user_id)):
            raise HTTPException(status_code=403, detail="Müzik yönetme yetkiniz yok")
        return room

    def _music_view(row: RoomMusic) -> dict:
        return {"id": row.id, "slot": row.slot, "title": row.title, "source_url": row.source_url, "position_seconds": int(row.position_seconds or 0), "is_playing": bool(row.is_playing), "started_at": row.started_at, "updated_at": row.updated_at}

    @router.get("/rooms/{room_id}/music")
    def music_queue(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = db.get(Room, room_id)
        if not room: raise HTTPException(status_code=404, detail="Oda bulunamadı")
        if not db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.user_id == user.id)): raise HTTPException(status_code=403, detail="Bu odaya erişiminiz yok")
        return [_music_view(row) for row in db.scalars(select(RoomMusic).where(RoomMusic.room_id == room_id).order_by(RoomMusic.slot, RoomMusic.id))]

    @router.post("/rooms/{room_id}/music")
    def music_add(room_id: str, payload: MusicCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        _require_music_manager(db, room_id, user.id)
        slot = int(db.scalar(select(func.max(RoomMusic.slot)).where(RoomMusic.room_id == room_id)) or 0) + 1
        row = RoomMusic(room_id=room_id, user_id=user.id, slot=slot, title=payload.title.strip(), source_url=payload.source_url.strip(), paid_until=datetime.now(timezone.utc))
        db.add(row); db.commit(); db.refresh(row); record("system", "room_music_added", user_id=user.id, room_id=room_id, music_id=row.id)
        return _music_view(row)

    @router.post("/rooms/{room_id}/music/{music_id}/playback")
    def music_playback(room_id: str, music_id: int, payload: MusicPlayback, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        _require_music_manager(db, room_id, user.id)
        row = db.get(RoomMusic, music_id)
        if not row or row.room_id != room_id: raise HTTPException(status_code=404, detail="Müzik bulunamadı")
        if payload.action == "play":
            db.query(RoomMusic).filter(RoomMusic.room_id == room_id, RoomMusic.id != row.id).update({"is_playing": False}, synchronize_session=False); row.is_playing=True; row.started_at=datetime.now(timezone.utc)
        elif payload.action == "pause": row.is_playing=False
        elif payload.action == "stop": row.is_playing=False; row.position_seconds=0; row.started_at=None
        else:
            if payload.position_seconds is None: raise HTTPException(status_code=422, detail="position_seconds gerekli")
            row.position_seconds=payload.position_seconds
        row.updated_at=datetime.now(timezone.utc); db.commit(); db.refresh(row)
        record("system", "room_music_playback", user_id=user.id, room_id=room_id, music_id=row.id, action=payload.action, position_seconds=row.position_seconds)
        return _music_view(row)

    @router.delete("/rooms/{room_id}/music/{music_id}")
    def music_delete(room_id: str, music_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        _require_music_manager(db, room_id, user.id); row=db.get(RoomMusic,music_id)
        if not row or row.room_id != room_id: raise HTTPException(status_code=404, detail="Müzik bulunamadı")
        db.delete(row); db.commit(); record("system","room_music_deleted",user_id=user.id,room_id=room_id,music_id=music_id); return {"deleted":True,"id":music_id}

    GAME_TYPES = {"roulette", "cups", "horse_race", "blackjack", "crash", "vault", "wheel"}
    ROOM_GAME_TYPES = {"roulette", "cups", "horse_race", "wheel"}
    PRIVATE_GAME_TYPES = {"blackjack", "crash", "vault"}
    GAME_PROFILES = {
        "roulette": {
            "results": [("rose", 45), ("heart", 20), ("star", 12), ("diamond", 8), ("crown", 6), ("gift", 4), ("fire", 3), ("gem", 1.5), ("jackpot", 0.5)],
            "description": "Ağırlıklı RNG ile tek sonuçlu rulet demosu.",
        },
        "cups": {"results": [(f"cup_{i}", 25) for i in range(1, 5)], "description": "Dört kupadan biri rastgele seçilir."},
        "horse_race": {"results": [(f"horse_{i}", w) for i, w in enumerate((30, 25, 18, 12, 8, 5, 2), 1)], "description": "Atların kazanma ağırlıkları birbirinden farklıdır."},
        "blackjack": {"results": [("blackjack", 4), ("win", 46), ("push", 10), ("loss", 40)], "description": "Tek elli blackjack demosu; deste ve sonuç RNG ile üretilir."},
        "crash": {"results": [("x1_00_1_49", 62), ("x1_50_1_99", 23), ("x2_00_4_99", 11), ("x5_00_9_99", 3), ("x10_plus", 1)], "description": "Rastgele crash çarpanı sınıfı; yatırım veya cash-out yoktur."},
        "vault": {"results": [("common", 70), ("rare", 20), ("epic", 8), ("legendary", 1.8), ("mythic", 0.2)], "description": "Ödül sınıfı RNG ile seçilir; parasal payout yoktur."},
        "wheel": {"results": [("small", 40), ("medium", 30), ("large", 20), ("special", 8), ("grand", 2)], "description": "Ağırlıklı şans çarkı sonucu."},
    }

    def _weighted_result(game_type: str):
        items = GAME_PROFILES[game_type]["results"]
        keys = [x[0] for x in items]; weights = [x[1] for x in items]
        return random.choices(keys, weights=weights, k=1)[0]

    def _save_game_play(db: Session, user: User, game_type: str, choice: str | None, result_key: str, result_data: dict):
        row = GamePlay(user_id=user.id, game_type=game_type, choice=choice, result_key=result_key, result_data=json.dumps(result_data, ensure_ascii=False, separators=(",", ":")))
        db.add(row); db.commit(); db.refresh(row)
        record("system", "game_played", user_id=user.id, game_type=game_type, choice=choice, result=result_key)
        return {"id": row.id, "game": game_type, "choice": choice, "result": result_key, "data": result_data, "created_at": row.created_at}

    @router.get("/games")
    def game_catalog(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        return [{"key": key, "description": value["description"], "weighted": True, "investment_required": False,
                 "scope": "room" if key in ROOM_GAME_TYPES else "private"} for key, value in GAME_PROFILES.items()]

    @router.get("/games/{game_type}/stats")
    def game_stats(game_type: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        _require_game_analytics_admin(db, user)
        game_type = game_type.strip().lower()
        if game_type not in GAME_TYPES:
            raise HTTPException(status_code=404, detail="Oyun bulunamadı")
        rows = list(db.scalars(select(GamePlay).where(GamePlay.game_type == game_type).order_by(GamePlay.created_at.desc()).limit(1000)))
        counts = {}
        for row in rows:
            counts[row.result_key] = counts.get(row.result_key, 0) + 1
        total = len(rows)
        return {"game": game_type, "scope": "room" if game_type in ROOM_GAME_TYPES else "private",
                "sample_size": total,
                "results": [{"key": k, "count": v, "rate": round(v / total * 100, 3) if total else 0} for k, v in sorted(counts.items())]}



    def _load_game_round_for_user(round_id: str, db: Session, user: User) -> GameRound:
        row = db.get(GameRound, round_id)
        if not row:
            raise HTTPException(status_code=404, detail="Oyun turu bulunamadı")
        if row.room_id:
            member = db.scalar(select(RoomMember.id).where(RoomMember.room_id == row.room_id, RoomMember.user_id == user.id))
            if not member:
                raise HTTPException(status_code=403, detail="Bu oyun turuna erişiminiz yok")
        return row

    def _blackjack_hand_total(hand: list[str]) -> int:
        values = {"J": 10, "Q": 10, "K": 10, "A": 11}
        total = 0
        aces = 0
        for card in hand:
            rank = card[:-1]
            total += values[rank] if rank in values else int(rank)
            aces += int(rank == "A")
        while total > 21 and aces:
            total -= 10
            aces -= 1
        return total

    @router.get("/games/rounds/{round_id}")
    def game_round_state(round_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = db.get(GameRound, round_id)
        if not row:
            raise HTTPException(status_code=404, detail="Oyun turu bulunamadı")
        if row.room_id:
            member = db.scalar(select(RoomMember.id).where(RoomMember.room_id == row.room_id, RoomMember.user_id == user.id))
            if not member:
                raise HTTPException(status_code=403, detail="Bu oyun turuna erişiminiz yok")
        try:
            state = json.loads(row.state_data or "{}")
        except (TypeError, json.JSONDecodeError):
            state = {}
        return {
            "round_id": row.id, "game": row.game_type, "room_id": row.room_id,
            "status": row.status, "started_at": row.started_at, "ends_at": row.ends_at,
            "result": row.result_key, "state": state,
        }

    @router.post("/games/blackjack/{round_id}/action")
    def blackjack_action(
        round_id: str,
        payload: BlackjackAction,
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        row = _load_game_round_for_user(round_id, db, user)
        if row.game_type != "blackjack":
            raise HTTPException(status_code=400, detail="Bu round blackjack değil")
        if row.status != "open":
            raise HTTPException(status_code=409, detail="Bu blackjack roundu kapalı")
        try:
            state = json.loads(row.state_data or "{}")
            result, state = GAME_ENGINES["blackjack"].action(state, payload.action)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        row.state_data = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        if result != "pending":
            row.status = "finished"
            row.result_key = result
            row.ends_at = datetime.now(timezone.utc)
        db.commit()
        return {"round_id": row.id, "status": row.status, "result": result, "state": display_state(state), "available_actions": available_actions(state)}

    @router.post("/games/{game_type}/play")
    def play_game(game_type: str, payload: dict | None = None, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        game_type = game_type.strip().lower()
        if game_type not in GAME_TYPES: raise HTTPException(status_code=404, detail="Oyun bulunamadı")
        payload = payload or {}
        room_id = str(payload.get("room_id") or "").strip() or None
        if room_id and is_private_game(game_type):
            raise HTTPException(status_code=400, detail="Bu oyun özel/kişisel modda çalışır")
        if is_room_game(game_type) and not room_id:
            raise HTTPException(status_code=400, detail="Bu oyun oda içinden başlatılmalıdır")
        if room_id:
            room = db.get(Room, room_id)
            if not room:
                raise HTTPException(status_code=404, detail="Oda bulunamadı")
            member = db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.user_id == user.id))
            if not member:
                raise HTTPException(status_code=403, detail="Bu oyunu oynayabilmek için odaya katılmanız gerekir")

        choice = str(payload.get("choice") or "").strip() or None
        if game_type == "cups" and choice not in CUPS:
            raise HTTPException(status_code=400, detail="Kupa seçimi cup_1..cup_4 olmalı")
        if game_type == "roulette" and choice and choice not in {x[0] for x in GAME_PROFILES["roulette"]["results"]}:
            raise HTTPException(status_code=400, detail="Geçersiz rulet seçimi")
        if game_type == "horse_race" and choice and choice not in {f"horse_{i}" for i in range(1, 8)}:
            raise HTTPException(status_code=400, detail="Geçersiz at seçimi")
        if game_type == "wheel" and choice and choice not in {x[0] for x in GAME_PROFILES["wheel"]["results"]}:
            raise HTTPException(status_code=400, detail="Geçersiz çark seçimi")
        engine = GAME_ENGINES[game_type]
        if game_type == "blackjack":
            result, data = engine.start({
                "free_play": True, "investment_required": False,
                "scope": "private", "room_id": room_id, "round_id": str(uuid4()),
                "engine_version": "games-v4",
            })
        else:
            data = {"free_play": True, "investment_required": False, "scope": "room" if game_type in ROOM_GAME_TYPES else "private", "room_id": room_id, "round_id": str(uuid4()), "engine_version": "games-v4", "animation": {"duration_ms": 1800, "reveal_ms": 1200}}
            try:
                result, data = engine.play(choice, GAME_PROFILES[game_type], data)
            except (KeyError, TypeError, ValueError) as exc:
                raise HTTPException(status_code=422, detail=f"Oyun motoru sonucu oluşturamadı: {exc}")
            if not result or not isinstance(data, dict):
                raise HTTPException(status_code=500, detail="Oyun motoru geçersiz sonuç üretti")
            data.setdefault("result", result)
        round_id = data["round_id"]
        now = datetime.now(timezone.utc)
        db.add(GameRound(
            id=round_id, room_id=room_id, game_type=game_type,
            status=("finished" if game_type != "blackjack" or result != "pending" else "open"),
            started_at=now, ends_at=now,
            result_key=(None if result == "pending" else result),
            state_data=json.dumps(data.get("state", data), ensure_ascii=False, separators=(",", ":")),
        ))
        db.flush()
        return _save_game_play(db, user, game_type, choice, result, data)
