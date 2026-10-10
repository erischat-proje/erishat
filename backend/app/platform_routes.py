from __future__ import annotations
import secrets

import json
import math
import os
import random
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from . import discovery_live
from .db import get_db
from .models import Conversation, ConversationMember, Message, User
from .platform_models import (
    DiscoveryPreference, Family, FamilyDonation, FamilyMember, FanProfile, GameBet, GamePlay,
    GameRound, Notification, ProfileVisit, Report, RoomAnnouncement, UserBlock, UserFollow, UserLocation, UserPrivacy, UserSocialPrivacy, VipStatus,
)
from .room_models import Room, RoomGiftEvent, RoomMember, RoomModerator, RoomChatMessage, RoomBan, RoomSeat
from .admin_models import AdminRole
from .moderation import active_ban, profile_notice, require_feature, require_chat_write
from .social_privacy import social_flags, require_social_visible
from .system_logs import record
from .system_data import LidyaGemLedger
from .oyunlar.registry import GAME_ENGINES, is_private_game, is_room_game
from .oyunlar.blackjack import available_actions, display_state

router = APIRouter(prefix="/v1", tags=["platform"])

from .vip_spending import THRESHOLDS as VIP_SPEND_THRESHOLDS

VIP_PERKS = {
    1: ["vip_badge", "custom_avatar", "custom_frame", "vip_profile_window", "vip_entry_effect"],
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
    hide_fans: bool | None = None
    hide_received_gifts: bool | None = None
    hide_notifications: bool | None = None
    hide_vip: bool | None = None; hide_vip_badge: bool | None = None; hide_vip_neon: bool | None = None
    hide_vip_entry: bool | None = None; hide_vip_title: bool | None = None; hide_location: bool | None = None
class LocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90); longitude: float = Field(ge=-180, le=180); city: str = Field(min_length=1, max_length=128)
class DiscoveryUpdate(BaseModel):
    gender_filter: str = Field(pattern="^(female|male|any)$"); random_enabled: bool | None = None
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
class RoomSeatUpdate(BaseModel):
    seat_number: int = Field(ge=1, le=12)
class RoomChatCreate(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
class GameBetCreate(BaseModel):
    choice: str = Field(min_length=1, max_length=32); amount: int = Field(ge=1, le=1_000_000)
class BlackjackAction(BaseModel):
    action: str = Field(pattern="^(hit|stand|double|split)$")

class CrashCashoutCreate(BaseModel):
    bet_id: int



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
    privacy = db.get(UserPrivacy, user_id); return True if not privacy else not bool(privacy.hide_vip or getattr(privacy, field, False))
def profile_stats(db: Session, target: User, viewer: User) -> dict:
    from .personal_fans import received_total
    from .relationship_routes import public_brief
    if active_ban(db, target.id):
        return {"followers_count": 0, "following_count": 0, "received_gift_lidya": 0,
                "vip_level": 0, "vip_badge_hidden": True, "vip_neon_hidden": True, "relationship": None}
    v = db.get(VipStatus, target.id)
    own = target.id == viewer.id
    flags = social_flags(db, target.id, viewer.id)
    visible = own or user_can_show_vip(db, target.id, "hide_vip")
    return {
        "followers_count": int(db.scalar(select(func.count(UserFollow.id)).where(UserFollow.following_id == target.id)) or 0),
        "following_count": int(db.scalar(select(func.count(UserFollow.id)).where(UserFollow.follower_id == target.id)) or 0),
        "received_gift_lidya": None if flags["gifts_hidden"] else received_total(db, target.id),
        **flags,
        "relationship": public_brief(db, target.id),
        "title_asset": target.title_asset,
        "profile_asset": target.profile_asset,
        "vip_level": int(v.level or 0) if v and visible else 0,
        "vip_badge_hidden": not own and not user_can_show_vip(db, target.id, "hide_vip_badge"),
        "vip_neon_hidden": not own and not user_can_show_vip(db, target.id, "hide_vip_neon"),
    }

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
        p=privacy_row(db,user.id); db.commit(); return {**{k:getattr(p,k) for k in ("hide_vip","hide_vip_badge","hide_vip_neon","hide_vip_entry","hide_vip_title","hide_location")}, **{k:bool(getattr(db.get(UserSocialPrivacy,user.id),k,False)) for k in ("hide_fans","hide_received_gifts")}, "hide_notifications": not user.notifications_enabled}
    @router.patch("/me/privacy")
    def update_privacy(payload: PrivacyUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        p=privacy_row(db,user.id)
        for key,value in payload.model_dump(exclude_none=True).items():
            if key == "hide_notifications": user.notifications_enabled = not value
            elif key in ("hide_fans", "hide_received_gifts"):
                social=db.get(UserSocialPrivacy,user.id)
                if social is None:
                    social=UserSocialPrivacy(user_id=user.id);db.add(social)
                setattr(social,key,value)
            else: setattr(p,key,value)
        if payload.hide_vip is not None:
            for key in ("hide_vip_badge", "hide_vip_neon", "hide_vip_entry", "hide_vip_title"):
                setattr(p, key, payload.hide_vip)
        db.commit(); return {**{k:getattr(p,k) for k in ("hide_vip","hide_vip_badge","hide_vip_neon","hide_vip_entry","hide_vip_title","hide_location")}, **{k:bool(getattr(db.get(UserSocialPrivacy,user.id),k,False)) for k in ("hide_fans","hide_received_gifts")}, "hide_notifications": not user.notifications_enabled}
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
        require_feature(db, user.id)
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
        current_level_spent = VIP_SPEND_THRESHOLDS.get(v.level, 0) if v.level > 0 else 0
        return {"level":v.level,"total_spent":int(v.total_spent or 0),"current_level_spent":current_level_spent,"next_level":v.level+1 if v.level < 12 else None,"next_level_spent":VIP_SPEND_THRESHOLDS.get(v.level+1),"perks":sorted({p for level in range(1,v.level+1) for p in VIP_PERKS.get(level,[])}),"neon_color":neon,"entry_effect":v.entry_effect,"entry_style":"male" if user.gender=="male" else "female","badge":badge,"title":title,"neon_enabled":v.level >= 3,"knight_badge_claimed":bool(v.knight_badge_claimed),"wallpaper_claimed":bool(v.wallpaper_claimed)}
    @router.post("/me/vip/claims/{claim}")
    def claim_vip_perk(claim: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        db.execute(text("SELECT id FROM users WHERE id=:uid FOR UPDATE"), {"uid": user.id}).first()
        v=vip_row(db,user.id)
        claim=claim.strip().lower()
        requirements={"knight_badge":10,"wallpaper":10}
        if claim not in requirements:
            raise HTTPException(status_code=404,detail="VIP claim bulunamadı")
        required=requirements[claim]
        if v.level < required:
            raise HTTPException(status_code=403,detail=f"VIP {required} gerekli")
        field="knight_badge_claimed" if claim=="knight_badge" else "wallpaper_claimed"
        already=bool(getattr(v,field))
        setattr(v,field,True)
        if claim=="wallpaper":
            wallpaper_key="vip_wallpaper_10"
            exists=db.execute(text("SELECT 1 FROM user_cosmetics WHERE user_id=:uid AND cosmetic_type='wallpaper' AND asset_key=:key"), {"uid":user.id,"key":wallpaper_key}).first()
            if not exists:
                db.execute(text("INSERT INTO user_cosmetics (user_id, cosmetic_type, asset_key) VALUES (:uid,'wallpaper',:key)"), {"uid":user.id,"key":wallpaper_key})
        db.commit()
        return {"claim":claim,"claimed":True,"already_claimed":already,"level":v.level,"wallpaper_asset_key":"vip_wallpaper_10" if claim=="wallpaper" else None}

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
        p.gender_filter=payload.gender_filter
        if payload.random_enabled is not None:p.random_enabled=payload.random_enabled
        db.commit(); return {"gender_filter":p.gender_filter,"random_enabled":p.random_enabled}
    @router.post("/reports",status_code=201)
    def create_report(payload: ReportCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        if not any((payload.target_user_id,payload.room_id,payload.message_id)): raise HTTPException(status_code=400,detail="Şikayet hedefi gerekli")
        report=Report(reporter_id=user.id,**payload.model_dump()); db.add(report); db.flush()
        from .support_models import SupportTicket
        from .support_workflow import initialize_ticket, dispatch
        ticket = SupportTicket(user_id=user.id, category="safety", subject=f"Şikayet #{report.id}", message=payload.reason)
        db.add(ticket); db.flush()
        initialize_ticket(db, ticket, room_id=payload.room_id)
        db.commit(); dispatch(db); db.refresh(report)
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
        return discovery_live.rooms(db,user,limit=offset+limit)[offset:offset+limit]
    def location_or_409(db:Session,user_id:str)->UserLocation:
        row=db.get(UserLocation,user_id)
        if not row: raise HTTPException(status_code=409,detail="Konum izni gerekli")
        return row
    def candidate_users(db:Session,user:User,max_km:float)->list[tuple[User,float]]:
        origin=location_or_409(db,user.id); pref=db.get(DiscoveryPreference,user.id); wanted=pref.gender_filter if pref else "any"; result=[]
        hidden_ids=set(db.scalars(select(UserBlock.blocked_id).where(UserBlock.blocker_id==user.id)))
        hidden_ids.update(db.scalars(select(UserBlock.blocker_id).where(UserBlock.blocked_id==user.id)))
        for loc in list(db.scalars(select(UserLocation).where(UserLocation.user_id!=user.id))):
            target=db.get(User,loc.user_id)
            if not target or not target.is_active or target.id in hidden_ids or (wanted!="any" and target.gender!=wanted): continue
            target_privacy=db.get(UserPrivacy,target.id)
            if target_privacy and target_privacy.hide_location: continue
            d=distance_km(origin.latitude,origin.longitude,loc.latitude,loc.longitude)
            if d<=max_km: result.append((target,d))
        result.sort(key=lambda item:item[1]); return result
    @router.get("/discover/nearby")
    def nearby(limit:int=Query(20,ge=1,le=50),db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        return discovery_live.people(db,user,limit)
    @router.post("/discover/random-chat")
    def random_chat(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        pref=db.get(DiscoveryPreference,user.id)
        if pref and not pref.random_enabled:
            raise HTTPException(status_code=403,detail="Rastgele sohbet keşif ayarlarında kapalı")
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
            visitors=int(db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id==room.id, RoomMember.user_id!=room.owner_id)) or 0)
            if visitors and not room.locked: candidates.append(room)
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
        require_chat_write(db,user.id)
        member=db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==user.id))
        if not member: raise HTTPException(status_code=403,detail="Bu konuşmaya erişiminiz yok")
        text=str(payload.get("text") or "").strip()
        if not text: raise HTTPException(status_code=400,detail="Mesaj boş olamaz")
        message=Message(conversation_id=conversation_id,sender_id=user.id,text=text); db.add(message); db.commit(); db.refresh(message); return message
    @router.get("/users/{user_id}")
    def public_user(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        target=db.get(User,user_id) or db.scalar(select(User).where(User.public_id == user_id))
        if not target or not target.is_active: raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        banned=active_ban(db,target.id)
        if banned:
            return {"id":target.id,"public_id":None,"nickname":target.nickname,"avatar":target.avatar,
                "avatar_asset":getattr(target,"avatar_asset",None),"frame_asset":getattr(target,"frame_asset",None),
                "bio":None,"followers_count":0,"following_count":0,"gift_fan_count":0,"fan_level":0,
                "is_self":target.id==user.id,"is_following":False,"banned":True,"ban_notice":profile_notice(banned)}
        if target.id != user.id:
            visit=db.scalar(select(ProfileVisit).where(ProfileVisit.profile_user_id==target.id,ProfileVisit.visitor_user_id==user.id))
            if visit: visit.visited_at=datetime.now(timezone.utc)
            else: db.add(ProfileVisit(profile_user_id=target.id,visitor_user_id=user.id))
            db.commit()
        admin = db.get(AdminRole, target.id)
        visible_public_id = target.public_id if target.id == user.id or not (admin and admin.role in {"SA", "UA", "FA", "DA"}) else None
        is_following = bool(db.scalar(select(UserFollow.id).where(UserFollow.follower_id==user.id,UserFollow.following_id==target.id)))
        you_blocked = bool(db.scalar(select(UserBlock.id).where(UserBlock.blocker_id==user.id,UserBlock.blocked_id==target.id)))
        blocked_by_them = bool(db.scalar(select(UserBlock.id).where(UserBlock.blocker_id==target.id,UserBlock.blocked_id==user.id)))
        from .personal_fans import fan_count, gift_totals
        from .room_fan_levels import level_for_total
        flags=social_flags(db,target.id,user.id)
        return {"id":target.id,"public_id":visible_public_id,"nickname":target.nickname,"admin_role":(admin.role if admin and admin.role in {"SA","UA","FA","DA"} else None),"avatar":target.avatar,"gender":target.gender,"bio":getattr(target,"bio",None),"avatar_asset":getattr(target,"avatar_asset",None),"frame_asset":getattr(target,"frame_asset",None),"gift_fan_count":None if flags["fans_hidden"] else fan_count(db,target.id),"fan_level":level_for_total(gift_totals(db,{target.id})[target.id]),"is_following":is_following,"is_self":target.id==user.id,"you_blocked":you_blocked,"blocked_by_them":blocked_by_them,**profile_stats(db,target,user)}
    @router.get("/users/{user_id}/profile-stats")
    def user_profile_stats(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        target = db.get(User, user_id) or db.scalar(select(User).where(User.public_id == user_id))
        if not target or not target.is_active:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        return profile_stats(db, target, user)

    @router.get("/me/profile-visitors")
    def profile_visitors(limit:int=Query(50,ge=1,le=100),db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        rows=list(db.scalars(select(ProfileVisit).where(ProfileVisit.profile_user_id==user.id).order_by(ProfileVisit.visited_at.desc()).limit(limit)))
        result=[]
        for visit in rows:
            visitor=db.get(User,visit.visitor_user_id)
            if visitor and visitor.is_active:
                result.append({"user_id":visitor.id,"nickname":visitor.nickname,"avatar":visitor.avatar,"avatar_asset":visitor.avatar_asset,
                               "frame_asset":visitor.frame_asset,"visited_at":visit.visited_at})
        return result
    @router.post("/users/{user_id}/follow", status_code=201)
    def follow_user(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        if user_id==user.id: raise HTTPException(status_code=400,detail="Kendinizi takip edemezsiniz")
        if not db.get(User,user_id): raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        require_feature(db,user.id,[user_id])
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
        if user_id != user.id:
            raise HTTPException(status_code=403,detail="Takipçi listesi yalnızca kendi profilinizde görüntülenebilir")
        if active_ban(db,user_id): return []
        rows=list(db.scalars(select(UserFollow).where(UserFollow.following_id==user_id).order_by(UserFollow.created_at.desc()).limit(200)))
        result=[]
        for r in rows:
            target=db.get(User,r.follower_id)
            if target and target.is_active:
                result.append({
                    "user_id":target.id,
                    "nickname":target.nickname,
                    "avatar":target.avatar,
                    "avatar_asset":target.avatar_asset,
                    "frame_asset":target.frame_asset,
                    "created_at":r.created_at,
                })
        return result

    @router.get("/users/{user_id}/following")
    def following(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        if user_id != user.id:
            raise HTTPException(status_code=403,detail="Takip listesi yalnızca kendi profilinizde görüntülenebilir")
        if active_ban(db,user_id): return []
        rows=list(db.scalars(select(UserFollow).where(UserFollow.follower_id==user_id).order_by(UserFollow.created_at.desc()).limit(200)))
        result=[]
        for r in rows:
            target=db.get(User,r.following_id)
            if target and target.is_active:
                result.append({
                    "user_id":target.id,
                    "nickname":target.nickname,
                    "avatar":target.avatar,
                    "avatar_asset":target.avatar_asset,
                    "frame_asset":target.frame_asset,
                    "created_at":r.created_at,
                })
        return result

    @router.delete("/users/{user_id}/follower")
    def remove_follower(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        row=db.scalar(select(UserFollow).where(
            UserFollow.follower_id==user_id,
            UserFollow.following_id==user.id
        ))
        if row:
            db.delete(row)
            db.commit()
        return {"removed":True}
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
        if not user.notifications_enabled: return []
        rows=list(db.scalars(select(Notification).where(Notification.user_id==user.id).order_by(Notification.created_at.desc()).limit(limit)))
        return [{"id":r.id,"kind":r.kind,"title":r.title,"body":r.body,"read":r.read,"created_at":r.created_at} for r in rows]
    @router.post("/me/notifications/{notification_id}/read")
    def mark_notification_read(notification_id:int,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        row=db.get(Notification,notification_id)
        if not row or row.user_id!=user.id: raise HTTPException(status_code=404,detail="Bildirim bulunamadı")
        row.read=True; db.commit(); return {"read":True}
    @router.get("/users/{user_id}/fans")
    def fans(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_social_visible(db,user_id,user.id,"fans")
        if active_ban(db,user_id): return {"user_id":user_id,"total":0,"level":0}
        total=int(db.scalar(select(func.count(UserFollow.id)).where(UserFollow.following_id==user_id)) or 0)
        return {"user_id":user_id,"total":total,"level":fan_level(total)}
    @router.get("/users/{user_id}/profile-gifts")
    def profile_gifts(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_social_visible(db,user_id,user.id,"gifts")
        require_social_visible(db,user_id,user.id,"fans")
        if active_ban(db,user_id): return []
        from .room_routes import GIFT_META
        rows=list(db.scalars(select(RoomGiftEvent).where(RoomGiftEvent.recipient_id==user_id).order_by(RoomGiftEvent.created_at.desc()).limit(100)))
        return [{"gift":r.gift_key,"amount":r.total_price,"image_url":GIFT_META.get(r.gift_key,{}).get("image_url"),"from_user_id":r.sender_id,"created_at":r.created_at} for r in rows]
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
        require_chat_write(db,user.id)
        _require_room_announcement_manager(db, room_id, user.id)
        row = RoomAnnouncement(room_id=room_id, message=payload.message.strip(), enabled=True, pinned=False)
        db.add(row); db.commit(); db.refresh(row)
        record("system", "room_announcement_created", user_id=user.id, room_id=room_id, announcement_id=row.id)
        return {"id": row.id, "message": row.message, "enabled": row.enabled, "pinned": row.pinned, "created_at": row.created_at}

    @router.patch("/rooms/{room_id}/announcements/{announcement_id}")
    def update_announcement(room_id: str, announcement_id: int, payload: AnnouncementUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        if payload.message is not None:require_chat_write(db,user.id)
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

    GAME_TYPES = {"slot", "cups", "horse_race", "blackjack", "crash", "vault", "wheel"}
    ROOM_GAME_TYPES = GAME_TYPES - {"blackjack", "crash", "vault", "slot"}
    PRIVATE_GAME_TYPES = {"blackjack", "crash", "vault", "slot"}
    GAME_PROFILES = {
        "slot": {
            "results": [(name, 1) for name in ("cherry", "lemon", "bell", "star", "diamond", "seven", "crown")],
            "description": "Üç makaralı Slot: üç aynı sembol ödül kazandırır.",
        },
        "cups": {"results": [(f"cup_{i}", 25) for i in range(1, 5)], "description": "Dört kupadan biri rastgele seçilir."},
        "horse_race": {"results": [(f"horse_{i}", w) for i, w in enumerate((30, 25, 18, 12, 8, 5, 2), 1)], "description": "Atların kazanma ağırlıkları birbirinden farklıdır."},
        "blackjack": {"results": [("blackjack", 4), ("win", 46), ("push", 10), ("loss", 40)], "description": "Kart çek veya dur; galibiyet 2 kat, blackjack 2,5 kat, beraberlik iade."},
        "crash": {"results": [("x1_00_1_49", 62), ("x1_50_1_99", 23), ("x2_00_4_99", 11), ("x5_00_9_99", 3), ("x10_plus", 1)], "description": "Otomatik hedef 2×; çarpan 2×'e erişirse bahis 2 kat döner."},
        "vault": {"results": [("common", 70), ("rare", 20), ("epic", 8), ("legendary", 1.8), ("mythic", 0.2)], "description": "Ödül sınıfı: sıradan 0, nadir 2, destansı 4, efsanevi 10, mitik 20 kat."},
        "wheel": {"results": [
        ("rose", 24), ("heart", 20), ("star", 16),
        ("diamond", 12), ("crown", 9), ("gift", 7),
        ("fire", 5), ("gem", 4), ("jackpot", 3)
    ], "description": "Yüksek çarpanlı sembollerin daha nadir geldiği dokuz sembollü şans çarkı."},
    }

    def game_payout(game_type: str, choice: str | None, result: str, stake: int, data: dict) -> int:
        if not stake or result == "pending": return 0
        if game_type == "blackjack":
            return {"blackjack":stake * 5 // 2,"win":stake * 2,"push":stake}.get(result,0)
        if game_type == "vault":
            return stake * {"common":0,"rare":2,"epic":4,"legendary":10,"mythic":20}.get(result,0)
        if game_type == "crash":
            return 0  # Legacy auto-cashout disabled; use live manual cashout.
        if game_type == "slot":
            multipliers = {
                "cherry": 5,
                "lemon": 7,
                "bell": 10,
                "star": 15,
                "diamond": 25,
                "seven": 50,
                "crown": 100,
            }
            return stake * multipliers.get(result, 0)
        if game_type == "wheel":
            if choice != result:
                return 0
            # Ödeme toplam geri dönüş miktarıdır.
            # .5 çarpanlar tam sayı Lidya olarak aşağı yuvarlanır.
            multipliers = {
                "rose": (3, 2),       # 1.5x
                "heart": (2, 1),      # 2x
                "star": (5, 2),       # 2.5x
                "diamond": (3, 1),    # 3x
                "crown": (7, 2),      # 3.5x
                "gift": (4, 1),       # 4x
                "fire": (9, 2),       # 4.5x
                "gem": (5, 1),        # 5x
                "jackpot": (6, 1),    # 6x
            }
            numerator, denominator = multipliers.get(result, (0, 1))
            return stake * numerator // denominator
        if choice != result: return 0
        weight = next((float(weight) for key,weight in GAME_PROFILES[game_type]["results"] if key == result),0)
        return min(stake * 20, int(stake * min(20, 90 / weight))) if weight else 0

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
                 "scope": "room_or_private"} for key, value in GAME_PROFILES.items()]

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
        return {"game": game_type, "scope": "room_or_private",
                "sample_size": total,
                "results": [{"key": k, "count": v, "rate": round(v / total * 100, 3) if total else 0} for k, v in sorted(counts.items())]}



    def _load_game_round_for_user(round_id: str, db: Session, user: User) -> GameRound:
        row = db.scalar(select(GameRound).where(GameRound.id == round_id).with_for_update())
        if not row:
            raise HTTPException(status_code=404, detail="Oyun turu bulunamadı")
        if row.user_id != user.id:
            raise HTTPException(status_code=403, detail="Bu oyun turuna erişiminiz yok")
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


    # ERIS_BJ_ACTIVE_ROUND_V1
    @router.get("/games/blackjack/active")
    def blackjack_active_round(
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        row = db.scalar(
            select(GameRound)
            .where(
                GameRound.user_id == user.id,
                GameRound.game_type == "blackjack",
                GameRound.status == "open",
            )
            .order_by(GameRound.started_at.desc(), GameRound.id.desc())
            .limit(1)
        )
        if row is None:
            return {"active": False, "round_id": None}

        try:
            state = json.loads(row.state_data or "{}")
        except (TypeError, json.JSONDecodeError):
            state = {}

        return {
            "active": True,
            "round_id": row.id,
            "state": display_state(state),
            "available_actions": [
                action for action in available_actions(state)
                if action in {"hit", "stand"}
            ],
        }


    @router.get("/games/blackjack/history")
    def blackjack_history(
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        rows = list(db.scalars(
            select(GameRound)
            .where(
                GameRound.game_type == "blackjack",
                GameRound.user_id == user.id,
                GameRound.status == "finished",
            )
            .order_by(GameRound.started_at.desc(), GameRound.id.desc())
            .limit(53)
        ))
        results = [
            {
                "round_id": row.id,
                "result": row.result_key,
                "started_at": row.started_at,
            }
            for row in rows
        ]
        return {
            "game": "blackjack",
            "sample_size": len(results),
            "wins": sum(r["result"] in ("win", "blackjack") for r in results),
            "losses": sum(r["result"] == "loss" for r in results),
            "pushes": sum(r["result"] == "push" for r in results),
            "rounds": results,
        }

    @router.get("/games/rounds/{round_id}")
    def game_round_state(round_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = _load_game_round_for_user(round_id, db, user)
        try:
            state = json.loads(row.state_data or "{}")
        except (TypeError, json.JSONDecodeError):
            state = {}
        # Açık Dört Kupa turunun gizli sonucu ortak API'den sızmamalı.
        if row.game_type == "cups" and row.status == "open":
            state = {
                key: value for key, value in state.items()
                if key not in {"winning_cup", "result"}
            }
        return {
            "round_id": row.id, "game": row.game_type, "room_id": row.room_id,
            "status": row.status, "started_at": row.started_at, "ends_at": row.ends_at,
            "result": row.result_key, "state": display_state(state) if row.game_type == "blackjack" else state,
        }

    @router.post("/games/blackjack/{round_id}/action")
    def blackjack_action(
        round_id: str,
        payload: BlackjackAction,
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        # ERIS_BJ_ROW_LOCK_V1
        row = db.scalar(
            select(GameRound)
            .where(GameRound.id == round_id, GameRound.user_id == user.id)
            .with_for_update()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Oyun turu bulunamadı")
        if row.game_type != "blackjack":
            raise HTTPException(status_code=400, detail="Bu round blackjack değil")
        if row.status != "open":
            raise HTTPException(status_code=409, detail="Bu blackjack roundu kapalı")
        if payload.action not in {"hit", "stand"}:
            raise HTTPException(status_code=400, detail="Blackjack için kart çek veya dur seçin")
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
            bet = db.scalar(select(GameBet).where(GameBet.round_id == row.id,GameBet.user_id == user.id))
            if bet:
                locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
                bet.payout = game_payout("blackjack", None, result, bet.amount, state)
                locked_user.lidya += bet.payout
        db.commit()
        return {"round_id": row.id, "status": row.status, "result": result, "state": display_state(state), "available_actions": [a for a in available_actions(state) if a in {"hit","stand"}], "payout": bet.payout if result != "pending" and bet else 0}


    # ===== WHEEL LIVE V3 =====
    # Herkes için ortak 60 saniyelik tur.
    # Crash Live — ortak global tur
    CRASH_LIVE_BET_SECONDS = 10
    CRASH_LIVE_RESULT_SECONDS = 5
    CRASH_LIVE_STAKES = {10,25,50,75,100,250,500,1000}

    WHEEL_LIVE_SECONDS = 60
    WHEEL_LOCK_SECONDS = 5
    WHEEL_LIVE_KEYS = (
        "rose", "heart", "star", "diamond", "crown",
        "gift", "fire", "gem", "jackpot",
    )
    WHEEL_LIVE_MULTIPLIERS = {
        "rose": 1.5,
        "heart": 2.0,
        "star": 2.5,
        "diamond": 3.0,
        "crown": 3.5,
        "gift": 4.0,
        "fire": 4.5,
        "gem": 5.0,
        "jackpot": 6.0,
    }

    def _crash_live_multiplier():
        """Kriptografik rastgele Crash sonucu; teorik RTP yaklaşık %97."""
        roll = secrets.randbelow(10**12) / 10**12
        if roll < 0.03:
            return 1.0

        # P(crash >= x) ~= 0.97 / x, x >= 1.
        value = 0.97 / (1.0 - roll)
        return max(1.0, min(1000.0, int(value * 100) / 100))

    def _crash_live_now():
        return datetime.now(timezone.utc)

    def _wheel_live_now():
        return datetime.now(timezone.utc)

    def _finish_wheel_live_round(row: GameRound, db: Session):
        if row.status == "finished" and row.result_key:
            return row

        now = _wheel_live_now()
        if row.ends_at > now:
            return row

        entries = GAME_PROFILES["wheel"]["results"]
        result = random.choices(
            [key for key, _ in entries],
            weights=[float(weight) for _, weight in entries],
            k=1,
        )[0]

        row.result_key = result
        row.status = "finished"

        bets = list(db.scalars(
            select(GameBet).where(GameBet.round_id == row.id)
        ))

        winners = 0
        total_payout = 0

        for bet in bets:
            payout = game_payout(
                "wheel", bet.choice, result, int(bet.amount or 0), {}
            )
            bet.payout = payout

            if payout > 0:
                bettor = db.scalar(
                    select(User)
                    .where(User.id == bet.user_id)
                    .with_for_update()
                )
                if bettor:
                    bettor.lidya += payout
                    winners += 1
                    total_payout += payout

        row.state_data = json.dumps({
            "result": result,
            "finished_at": now.isoformat(),
            "bet_count": len(bets),
            "winner_bets": winners,
            "total_payout": total_payout,
        }, ensure_ascii=False, separators=(",", ":"))

        db.flush()
        return row

    def _get_wheel_live_round(db: Session):
        now = _wheel_live_now()

        row = db.scalar(
            select(GameRound)
            .where(GameRound.game_type == "wheel_live")
            .order_by(GameRound.started_at.desc())
            .with_for_update()
        )

        if row and row.status == "open" and row.ends_at <= now:
            _finish_wheel_live_round(row, db)
            return row

        if row and row.status == "finished":
            if now < row.ends_at + timedelta(seconds=6):
                return row
            row = None

        if row is None:
            row = GameRound(
                id=str(uuid4()),
                user_id=None,
                room_id=None,
                game_type="wheel_live",
                status="open",
                started_at=now,
                ends_at=now + timedelta(seconds=WHEEL_LIVE_SECONDS),
                result_key=None,
                state_data="{}",
            )
            db.add(row)
            db.flush()

        return row

    def _wheel_live_response(row: GameRound, db: Session, user: User):
        now = _wheel_live_now()
        remaining = max(
            0,
            int((row.ends_at - now).total_seconds())
        )

        bets = list(db.scalars(
            select(GameBet).where(GameBet.round_id == row.id)
        ))

        totals = {key: 0 for key in WHEEL_LIVE_KEYS}
        my_bets = {key: 0 for key in WHEEL_LIVE_KEYS}

        for bet in bets:
            if bet.choice not in totals:
                continue

            totals[bet.choice] += int(bet.amount or 0)

            if bet.user_id == user.id:
                my_bets[bet.choice] += int(bet.amount or 0)

        betting_open = (
            row.status == "open"
            and remaining > WHEEL_LOCK_SECONDS
        )

        return {
            "round_id": row.id,
            "status": row.status,
            "started_at": row.started_at,
            "ends_at": row.ends_at,
            "remaining_seconds": remaining,
            "betting_open": betting_open,
            "lock_seconds": WHEEL_LOCK_SECONDS,
            "result": row.result_key,
            "multipliers": WHEEL_LIVE_MULTIPLIERS,
            "my_bets": my_bets,
            "recent_bets": [
                {"id": bet.id, "choice": bet.choice, "amount": int(bet.amount or 0)}
                for bet in bets[-12:]
            ],

            # Lobi toplamları sadece bahis kapandığında açılır.
            "totals": (
                totals
                if remaining <= WHEEL_LOCK_SECONDS
                or row.status == "finished"
                else None
            ),
        }

    def _get_crash_live_round(db: Session):
        # Serialize shared Crash round creation and transitions.
        if db.bind.dialect.name == "postgresql":
            from sqlalchemy import text
            db.execute(text("SELECT pg_advisory_xact_lock(731905241)"))
        now = _crash_live_now()

        row = db.scalar(
            select(GameRound)
            .where(GameRound.game_type == "crash_live")
            .order_by(GameRound.started_at.desc())
            .with_for_update()
        )

        if row:
            try:
                state = json.loads(row.state_data or "{}")
            except Exception:
                state = {}

            crash_at = float(state.get("crash_at") or 1.0)
            flight_seconds = float(state.get("flight_seconds") or 0)
            flight_start = row.ends_at
            crash_time = flight_start + timedelta(seconds=flight_seconds)

            if row.status == "open" and now >= flight_start:
                row.status = "running"

            if row.status == "running" and now >= crash_time:
                row.status = "finished"
                row.result_key = f"{crash_at:.2f}"
                state["finished_at"] = now.isoformat()
                row.state_data = json.dumps(
                    state, ensure_ascii=False, separators=(",", ":")
                )

            if row.status == "finished":
                if now < crash_time + timedelta(seconds=CRASH_LIVE_RESULT_SECONDS):
                    return row
                row = None

        if row is None:
            crash_at = _crash_live_multiplier()

            # Yaklaşık 1.00x -> crash_at büyüme süresi.
            # Aynı state bütün istemcilere gönderilir.
            flight_seconds = max(0.35, 3.0 * (crash_at - 1.0) ** 0.5)

            row = GameRound(
                id=str(uuid4()),
                user_id=None,
                room_id=None,
                game_type="crash_live",
                status="open",
                started_at=now,
                ends_at=now + timedelta(seconds=CRASH_LIVE_BET_SECONDS),
                result_key=None,
                state_data=json.dumps({
                    "crash_at": crash_at,
                    "flight_seconds": round(flight_seconds, 3),
                }, ensure_ascii=False, separators=(",", ":")),
            )
            db.add(row)
            db.flush()

        return row

    @router.get("/games/crash/live")
    def crash_live_state(
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        row = _get_crash_live_round(db)
        now = _crash_live_now()
        state = json.loads(row.state_data or "{}")

        crash_at = float(state.get("crash_at") or 1.0)
        flight_seconds = max(0.001, float(state.get("flight_seconds") or 1.0))
        betting_remaining = max(0, (row.ends_at - now).total_seconds())

        multiplier = 1.0
        if row.status in {"running", "finished"}:
            elapsed = max(0.0, (now - row.ends_at).total_seconds())
            progress = min(1.0, elapsed / flight_seconds)
            multiplier = 1.0 + (crash_at - 1.0) * (progress ** 2)

        if row.status == "finished":
            multiplier = crash_at

        bets = list(db.scalars(
            select(GameBet).where(
                GameBet.round_id == row.id,
                GameBet.user_id == user.id,
            )
        ))

        finished_rounds = db.scalars(
            select(GameRound)
            .where(
                GameRound.game_type == "crash_live",
                GameRound.status == "finished",
                GameRound.result_key.is_not(None),
            )
            .order_by(GameRound.started_at.desc())
            .limit(100)
        ).all()

        values = []
        recent_rounds = []
        for previous in finished_rounds:
            try:
                value = float(previous.result_key)
                if not (1.0 <= value <= 1000000.0):
                    continue
            except (ValueError, TypeError):
                continue
            values.append(value)
            if len(recent_rounds) < 12:
                recent_rounds.append({
                    "id": previous.id,
                    "multiplier": value,
                })

        count = len(values)
        crash_stats = {
            "sample_size": count,
            "above_2x": sum(x >= 2 for x in values),
            "above_5x": sum(x >= 5 for x in values),
            "below_2x": sum(x < 2 for x in values),
            "average": round(sum(values) / count, 2) if count else None,
            "highest": round(max(values), 2) if count else None,
        }

        payload = {
            "round_id": row.id,
            "recent_rounds": recent_rounds,
            "crash_stats": crash_stats,
            "status": row.status,
            "betting_remaining": int(betting_remaining + 0.999),
            "betting_open": row.status == "open" and betting_remaining > 0,
            "multiplier": round(multiplier, 2),
            "crash_at": crash_at if row.status == "finished" else None,
            "my_bets": [
                {
                    "id": bet.id,
                    "amount": int(bet.amount or 0),
                    "payout": int(bet.payout or 0),
                    "cashed_out": int(bet.payout or 0) > 0,
                }
                for bet in bets
            ],
        }

        db.commit()
        return payload

    @router.post("/games/crash/live/bet")
    def crash_live_bet(
        payload: GameBetCreate,
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        if payload.amount not in CRASH_LIVE_STAKES:
            raise HTTPException(status_code=422, detail="Geçersiz bahis miktarı")

        row = _get_crash_live_round(db)
        now = _crash_live_now()

        if row.status != "open" or now >= row.ends_at:
            raise HTTPException(status_code=409, detail="Bahis süresi kapandı")

        locked_user = db.scalar(
            select(User).where(User.id == user.id).with_for_update()
        )
        if not locked_user:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        if payload.amount > locked_user.lidya:
            raise HTTPException(status_code=400, detail="Yeterli Lidya yok")

        locked_user.lidya -= payload.amount

        bet = GameBet(
            round_id=row.id,
            user_id=user.id,
            choice="cashout",
            amount=payload.amount,
            payout=0,
        )
        db.add(bet)
        db.flush()

        result = {
            "ok": True,
            "round_id": row.id,
            "bet_id": bet.id,
            "amount": payload.amount,
            "balance": locked_user.lidya,
        }
        db.commit()
        return result

    @router.post("/games/crash/live/cashout")
    def crash_live_cashout(
        payload: CrashCashoutCreate,
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        row = _get_crash_live_round(db)
        now = _crash_live_now()

        if row.status != "running":
            raise HTTPException(status_code=409, detail="Şu anda çekim yapılamaz")

        state = json.loads(row.state_data or "{}")
        crash_at = float(state.get("crash_at") or 1.0)
        flight_seconds = max(0.001, float(state.get("flight_seconds") or 1.0))
        elapsed = max(0.0, (now - row.ends_at).total_seconds())

        if elapsed >= flight_seconds:
            raise HTTPException(status_code=409, detail="Crash! Çekim için geç kaldın")

        progress = min(1.0, elapsed / flight_seconds)
        multiplier = 1.0 + (crash_at - 1.0) * (progress ** 2)
        multiplier = max(1.0, round(multiplier, 2))

        bet = db.scalar(
            select(GameBet)
            .where(
                GameBet.id == payload.bet_id,
                GameBet.round_id == row.id,
                GameBet.user_id == user.id,
            )
            .with_for_update()
        )

        if not bet:
            raise HTTPException(status_code=404, detail="Aktif bahis bulunamadı")
        if int(bet.payout or 0) > 0:
            raise HTTPException(status_code=409, detail="Bu bahis zaten çekildi")

        # Recheck the deadline immediately before payout.
        now = _crash_live_now()
        elapsed = max(0.0, (now - row.ends_at).total_seconds())
        if elapsed >= flight_seconds:
            raise HTTPException(status_code=409, detail="Crash! Çekim için geç kaldın")

        progress = min(1.0, elapsed / flight_seconds)
        multiplier = max(
            1.0,
            round(1.0 + (crash_at - 1.0) * (progress ** 2), 2),
        )

        payout = int(int(bet.amount) * multiplier)
        bet.payout = payout
        bet.choice = f"x{multiplier:.2f}"

        locked_user = db.scalar(
            select(User).where(User.id == user.id).with_for_update()
        )
        if not locked_user:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

        locked_user.lidya += payout
        db.flush()

        result = {
            "ok": True,
            "round_id": row.id,
            "bet_id": bet.id,
            "multiplier": multiplier,
            "payout": payout,
            "balance": locked_user.lidya,
        }
        db.commit()
        return result

    # ERIS_CRASH_CASHOUT_ALL_V1
    @router.post("/games/crash/live/cashout-all")
    def crash_live_cashout_all(
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        row = _get_crash_live_round(db)
        if row.status != "running":
            raise HTTPException(status_code=409, detail="Çekim süresi kapalı")

        state = json.loads(row.state_data or "{}")
        crash_at = float(state.get("crash_at") or 1.0)
        flight_seconds = max(0.001, float(state.get("flight_seconds") or 1.0))

        bets = list(db.scalars(
            select(GameBet)
            .where(
                GameBet.round_id == row.id,
                GameBet.user_id == user.id,
                GameBet.payout == 0,
            )
            .order_by(GameBet.id)
            .with_for_update()
        ))

        if not bets:
            raise HTTPException(status_code=409, detail="Çekilecek aktif bahis bulunamadı")

        locked_user = db.scalar(
            select(User).where(User.id == user.id).with_for_update()
        )
        if not locked_user:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

        elapsed = max(0.0, (_crash_live_now() - row.ends_at).total_seconds())
        if elapsed >= flight_seconds:
            raise HTTPException(status_code=409, detail="Crash! Çekim için geç kaldın")

        progress = min(1.0, elapsed / flight_seconds)
        multiplier = max(
            1.0,
            round(1.0 + (crash_at - 1.0) * progress ** 2, 2),
        )

        total_payout = 0
        for bet in bets:
            payout = int(int(bet.amount) * multiplier)
            bet.payout = payout
            bet.choice = f"x{multiplier:.2f}"
            total_payout += payout

        locked_user.lidya += total_payout
        db.flush()

        result = {
            "ok": True,
            "round_id": row.id,
            "bet_count": len(bets),
            "multiplier": multiplier,
            "payout": total_payout,
            "balance": locked_user.lidya,
        }
        db.commit()
        return result


    # ERIS_HORSE_LIVE_API_V1
    from . import horse_race_live as horse_live

    @router.get("/games/horse_race/live")
    def horse_live_state(
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        row = horse_live.get_round(db)
        bets = list(db.scalars(
            select(GameBet).where(GameBet.round_id == row.id)
        ))
        remaining = max(0, int(
            (row.ends_at - horse_live.now()).total_seconds()
        ))
        my_bets = {
            key: sum(
                int(b.amount) for b in bets
                if b.user_id == user.id and b.choice == key
            )
            for key in horse_live.HORSES
        }
        response = {
            "round_id": row.id,
            "status": row.status,
            "remaining_seconds": remaining,
            "betting_open": (
                row.status == "open" and remaining > 0
            ),
            "result": row.result_key,
            "horses": list(horse_live.HORSES),
            "my_bets": my_bets,
            "multipliers": {
                key: horse_live.MULTIPLIER
                for key in horse_live.HORSES
            },
        }
        db.commit()
        return response

    @router.post("/games/horse_race/live/bet")
    def horse_live_bet(
        payload: GameBetCreate,
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        choice = payload.choice.strip().lower()
        if choice not in horse_live.HORSES:
            raise HTTPException(
                status_code=400,
                detail="Geçersiz at seçimi",
            )
        if (
            type(payload.amount) is not int
            or payload.amount not in horse_live.STAKES
        ):
            raise HTTPException(
                status_code=422,
                detail="Geçersiz bahis miktarı",
            )

        row = horse_live.get_round(db)
        if (
            row.status != "open"
            or row.ends_at <= horse_live.now()
        ):
            raise HTTPException(
                status_code=409,
                detail="Bahisler kapandı. Yeni turu bekle.",
            )

        locked_user = db.scalar(
            select(User)
            .where(User.id == user.id)
            .with_for_update()
        )
        if not locked_user:
            raise HTTPException(
                status_code=404,
                detail="Kullanıcı bulunamadı",
            )
        if int(locked_user.lidya or 0) < payload.amount:
            raise HTTPException(
                status_code=400,
                detail="Yeterli Lidya yok",
            )

        locked_user.lidya -= payload.amount
        db.add(GameBet(
            round_id=row.id,
            user_id=user.id,
            choice=choice,
            amount=payload.amount,
            payout=0,
        ))
        db.flush()
        balance = locked_user.lidya
        db.commit()
        return {
            "ok": True,
            "round_id": row.id,
            "choice": choice,
            "amount": payload.amount,
            "balance": balance,
        }


    # ERIS_VAULT_LIVE_API_V1
    from . import vault_live

    @router.get("/games/vault/live")
    def vault_live_state(
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        row = vault_live.get_round(db)
        bets = list(db.scalars(
            select(GameBet).where(GameBet.round_id == row.id)
        ))
        remaining = max(0, int(
            (row.ends_at - vault_live.now()).total_seconds()
        ))
        try:
            vault_version = json.loads(row.state_data or "{}").get("version", 1)
        except (ValueError, TypeError, AttributeError):
            vault_version = 1
        vault_prizes = vault_live.PRIZES if vault_version == 2 else vault_live.LEGACY_PRIZES
        vault_multipliers = vault_live.MULTIPLIERS if vault_version == 2 else vault_live.LEGACY_MULTIPLIERS
        my_bets = {
            key: sum(
                int(b.amount) for b in bets
                if b.user_id == user.id and b.choice == key
            )
            for key in vault_prizes
        }
        # ERIS_VAULT_PHASE_V1
        elapsed = max(0, (
            vault_live.now() - row.ends_at
        ).total_seconds())
        if row.status == "open":
            phase = "betting"
            phase_remaining = remaining
        elif elapsed < vault_live.OPEN_SECONDS:
            phase = "opening"
            phase_remaining = max(
                0, int(vault_live.OPEN_SECONDS - elapsed + 0.999)
            )
        else:
            phase = "result"
            phase_remaining = max(
                0, int(
                    vault_live.OPEN_SECONDS
                    + vault_live.RESULT_SECONDS
                    - elapsed + 0.999
                )
            )

        response = {
            "round_id": row.id,
            "status": row.status,
            "phase": phase,
            "phase_remaining": phase_remaining,
            "remaining_seconds": remaining,
            "betting_open": row.status == "open" and remaining > 0,
            "result": row.result_key if phase == "result" else None,
            "version": vault_version,
            "prizes": list(vault_prizes),
            "my_bets": my_bets,
            "multipliers": {
                key: vault_multipliers[key]
                for key in vault_prizes
            },
        }
        db.commit()
        return response

    @router.post("/games/vault/live/bet")
    def vault_live_bet(
        payload: GameBetCreate,
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        choice = payload.choice.strip().lower()
        if choice not in vault_live.PRIZES and choice not in vault_live.LEGACY_PRIZES:
            raise HTTPException(
                status_code=400,
                detail="Geçersiz kasa ödülü seçimi",
            )
        if (
            type(payload.amount) is not int
            or payload.amount not in vault_live.STAKES
        ):
            raise HTTPException(
                status_code=422,
                detail="Geçersiz bahis miktarı",
            )

        row = vault_live.get_round(db)
        if (
            row.status != "open"
            or row.ends_at <= vault_live.now()
        ):
            raise HTTPException(
                status_code=409,
                detail="Bahisler kapandı. Yeni turu bekle.",
            )

        try:
            vault_version = json.loads(row.state_data or "{}").get("version", 1)
        except (ValueError, TypeError, AttributeError):
            vault_version = 1
        allowed = vault_live.PRIZES if vault_version == 2 else vault_live.LEGACY_PRIZES
        if choice not in allowed:
            raise HTTPException(status_code=409, detail="Kasa turu değişti. Tekrar seçim yap.")

        locked_user = db.scalar(
            select(User)
            .where(User.id == user.id)
            .with_for_update()
        )
        if not locked_user:
            raise HTTPException(
                status_code=404,
                detail="Kullanıcı bulunamadı",
            )
        if int(locked_user.lidya or 0) < payload.amount:
            raise HTTPException(
                status_code=400,
                detail="Yeterli Lidya yok",
            )

        locked_user.lidya -= payload.amount
        db.add(GameBet(
            round_id=row.id,
            user_id=user.id,
            choice=choice,
            amount=payload.amount,
            payout=0,
        ))
        db.flush()
        balance = locked_user.lidya
        db.commit()
        return {
            "ok": True,
            "round_id": row.id,
            "choice": choice,
            "amount": payload.amount,
            "balance": balance,
        }

    @router.get("/games/wheel/live")
    def wheel_live_state(
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        row = _get_wheel_live_round(db)
        payload = _wheel_live_response(row, db, user)
        db.commit()
        return payload

    @router.post("/games/wheel/live/bet")
    def wheel_live_bet(
        payload: GameBetCreate,
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        choice = payload.choice.strip().lower()

        if choice not in WHEEL_LIVE_KEYS:
            raise HTTPException(
                status_code=400,
                detail="Geçersiz çark sembolü",
            )

        # Mevcut oyun merkezi limitiyle aynı.
        if payload.amount not in {10,25,50,75,100,250,500,1000}:
            raise HTTPException(
                status_code=422,
                detail="Tek bahis en fazla 10.000 Lidya olabilir",
            )

        row = _get_wheel_live_round(db)
        remaining = (row.ends_at - _wheel_live_now()).total_seconds()

        if row.status != "open" or remaining <= WHEEL_LOCK_SECONDS:
            raise HTTPException(
                status_code=409,
                detail="Bahisler kapandı. Yeni turu bekle.",
            )

        locked_user = db.scalar(
            select(User)
            .where(User.id == user.id)
            .with_for_update()
        )

        if not locked_user:
            raise HTTPException(
                status_code=404,
                detail="Kullanıcı bulunamadı",
            )

        if payload.amount > locked_user.lidya:
            raise HTTPException(
                status_code=400,
                detail="Yeterli Lidya yok",
            )

        locked_user.lidya -= payload.amount

        db.add(GameBet(
            round_id=row.id,
            user_id=user.id,
            choice=choice,
            amount=payload.amount,
            payout=0,
        ))

        db.flush()
        balance = locked_user.lidya
        db.commit()

        return {
            "ok": True,
            "round_id": row.id,
            "choice": choice,
            "amount": payload.amount,
            "balance": balance,
            "remaining_seconds": max(
                0,
                int((row.ends_at - _wheel_live_now()).total_seconds()),
            ),
        }


    # ERIS_CUPS_REAL_ROUND_V1
    # Sonuç sunucuda saklanır; seçim yapılana kadar açıklanmaz.

    @router.post("/games/cups/round/start")
    def cups_round_start(
        payload: dict | None = None,
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        payload = payload or {}
        stake = payload.get("stake")
        if type(stake) is not int or not 0 <= stake <= 10000:
            raise HTTPException(status_code=422, detail="Geçersiz bahis")

        room_id = str(payload.get("room_id") or "").strip() or None
        if room_id:
            room = db.get(Room, room_id)
            if not room:
                raise HTTPException(status_code=404, detail="Oda bulunamadı")
            member = db.scalar(
                select(RoomMember.id).where(
                    RoomMember.room_id == room_id,
                    RoomMember.user_id == user.id,
                )
            )
            if not member:
                raise HTTPException(status_code=403, detail="Odaya katılmalısın")

        locked_user = db.scalar(
            select(User).where(User.id == user.id).with_for_update()
        )
        existing = db.scalar(
            select(GameRound).where(
                GameRound.user_id == user.id,
                GameRound.game_type == "cups",
                GameRound.status == "open",
            ).limit(1)
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail="Önce açık Dört Kupa turunu tamamla",
            )
        if stake > locked_user.lidya:
            raise HTTPException(status_code=400, detail="Yeterli Lidya yok")

        # V3: Coin, yatay kupa değişimlerini gerçekten takip eder.
        initial_cup = secrets.randbelow(4)
        swaps = []
        coin_position = initial_cup
        for _ in range(35):
            a = secrets.randbelow(4)
            b = secrets.randbelow(3)
            if b >= a:
                b += 1
            swaps.append([a, b])
            if coin_position == a:
                coin_position = b
            elif coin_position == b:
                coin_position = a
        result = f"cup_{coin_position + 1}"
        round_id = str(uuid4())
        now = datetime.now(timezone.utc)
        state = {
            "winning_cup": result,
            "initial_cup": initial_cup + 1,
            "swaps": swaps,
            "stake": stake,
            "room_id": room_id,
            "created_at": now.isoformat(),
        }

        locked_user.lidya -= stake
        db.add(GameRound(
            id=round_id,
            user_id=user.id,
            room_id=room_id,
            game_type="cups",
            status="open",
            started_at=now,
            ends_at=now,
            result_key=None,
            state_data=json.dumps(
                state, ensure_ascii=False, separators=(",", ":")
            ),
        ))
        db.flush()
        db.commit()

        return {
            "round_id": round_id,
            "stake": stake,
            "balance": locked_user.lidya,
            "status": "open",
            "initial_cup": initial_cup + 1,
            "swaps": swaps,
        }

    @router.get("/games/cups/round/active")
    def cups_round_active(
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        row = db.scalar(
            select(GameRound).where(
                GameRound.user_id == user.id,
                GameRound.game_type == "cups",
                GameRound.status == "open",
            ).limit(1)
        )
        if not row:
            return {"active": False}
        state = json.loads(row.state_data or "{}")
        return {
            "active": True,
            "round_id": row.id,
            "stake": state.get("stake", 0),
            "initial_cup": state.get("initial_cup"),
            "swaps": state.get("swaps"),
        }


    # ERIS_CUPS_ROUND_STATUS_V1
    @router.get("/games/cups/round/{round_id}/status")
    def cups_round_status(
        round_id: str,
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        row = db.scalar(
            select(GameRound).where(
                GameRound.id == round_id,
                GameRound.user_id == user.id,
                GameRound.game_type == "cups",
            )
        )
        if not row:
            raise HTTPException(status_code=404, detail="Tur bulunamadı")

        state = json.loads(row.state_data or "{}")
        if row.status == "open":
            return {
                "status": "open",
                "round_id": round_id,
                "stake": state.get("stake", 0),
            }

        return {
            "status": "finished",
            "round_id": round_id,
            "stake": state.get("stake", 0),
            "choice": state.get("choice"),
            "winning_cup": state.get("winning_cup"),
            "payout": state.get("payout", 0),
        }

    @router.post("/games/cups/round/{round_id}/choose")
    def cups_round_choose(
        round_id: str,
        payload: dict | None = None,
        db: Session = Depends(get_db),
        user: User = Depends(current_user_dependency),
    ):
        payload = payload or {}
        choice = str(payload.get("choice") or "")
        if choice not in CUPS:
            raise HTTPException(status_code=422, detail="Geçersiz kupa")

        locked_user = db.scalar(
            select(User).where(User.id == user.id).with_for_update()
        )
        row = db.scalar(
            select(GameRound).where(
                GameRound.id == round_id,
                GameRound.user_id == user.id,
                GameRound.game_type == "cups",
            ).with_for_update()
        )
        if not row:
            raise HTTPException(status_code=404, detail="Tur bulunamadı")
        if row.status != "open":
            raise HTTPException(status_code=409, detail="Tur tamamlandı")

        if row.room_id:
            member = db.scalar(
                select(RoomMember.id).where(
                    RoomMember.room_id == row.room_id,
                    RoomMember.user_id == user.id,
                )
            )
            if not member:
                raise HTTPException(status_code=403, detail="Oda erişimi yok")

        state = json.loads(row.state_data or "{}")
        result = state["winning_cup"]
        stake = int(state["stake"])
        payout = game_payout("cups", choice, result, stake, state)

        row.status = "finished"
        row.result_key = result
        row.ends_at = datetime.now(timezone.utc)
        state.update({
            "choice": choice,
            "result": result,
            "payout": payout,
        })
        row.state_data = json.dumps(
            state, ensure_ascii=False, separators=(",", ":")
        )

        if stake:
            db.add(GameBet(
                round_id=round_id,
                user_id=user.id,
                choice=choice,
                amount=stake,
                payout=payout,
            ))
        locked_user.lidya += payout

        response = _save_game_play(
            db, user, "cups", choice, result, state
        )
        response.update({
            "round_id": round_id,
            "stake": stake,
            "payout": payout,
            "balance": locked_user.lidya,
            "winning_cup": result,
        })
        return response

    @router.post("/games/{game_type}/play")
    def play_game(game_type: str, payload: dict | None = None, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        game_type = game_type.strip().lower()
        if game_type not in GAME_TYPES: raise HTTPException(status_code=404, detail="Oyun bulunamadı")
        if game_type == "cups":
            raise HTTPException(
                status_code=410,
                detail="Dört Kupa için yeni tur başlatma ve kupa seçme API'sini kullanın."
            )
        if game_type == "crash":
            raise HTTPException(status_code=410, detail="Eski Crash kapatıldı. Canlı Crash sistemini kullanın.")
        payload = payload or {}
        room_id = str(payload.get("room_id") or "").strip() or None
        if game_type == "slot" and room_id:
            raise HTTPException(
                status_code=400,
                detail="Slot yalnızca bireysel oynanabilir."
            )
        if room_id:
            room = db.get(Room, room_id)
            if not room:
                raise HTTPException(status_code=404, detail="Oda bulunamadı")
            member = db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.user_id == user.id))
            if not member:
                raise HTTPException(status_code=403, detail="Bu oyunu oynayabilmek için odaya katılmanız gerekir")

        choice = str(payload.get("choice") or "").strip() or None
        raw_stake = payload.get("stake",0)
        if type(raw_stake) is not int or not 0 <= raw_stake <= 10000:
            raise HTTPException(status_code=422, detail="Bahis 0 ile 10.000 Lidya arasında tam sayı olmalı")
        stake = raw_stake
        if game_type == "cups" and choice not in CUPS:
            raise HTTPException(status_code=400, detail="Kupa seçimi cup_1..cup_4 olmalı")
        if game_type == "horse_race" and choice and choice not in {f"horse_{i}" for i in range(1, 8)}:
            raise HTTPException(status_code=400, detail="Geçersiz at seçimi")
        if game_type == "wheel" and choice and choice not in {x[0] for x in GAME_PROFILES["wheel"]["results"]}:
            raise HTTPException(status_code=400, detail="Geçersiz çark seçimi")
        if stake and game_type in {"cups", "horse_race", "wheel"} and not choice:
            raise HTTPException(status_code=422, detail="Bahis için sonuç seçimi gerekli")
        # ERIS_BJ_SINGLE_ACTIVE_V1
        # Kullanıcı satırını kilitledikten sonra açık eli kontrol et.
        # Böylece eşzamanlı iki yeni bahis aynı anda başlayamaz.
        locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
        if game_type == "blackjack":
            existing = db.scalar(
                select(GameRound.id)
                .where(
                    GameRound.user_id == user.id,
                    GameRound.game_type == "blackjack",
                    GameRound.status == "open",
                )
                .limit(1)
            )
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail="Önce açık Blackjack elini tamamla.",
                )
        if stake > locked_user.lidya:
            raise HTTPException(status_code=400, detail="Yeterli Lidya yok")
        locked_user.lidya -= stake
        engine = GAME_ENGINES[game_type]
        if game_type == "blackjack":
            result, data = engine.start({
                "free_play": stake == 0, "investment_required": stake > 0,
                "scope": "room" if room_id else "private", "room_id": room_id, "round_id": str(uuid4()),
                "engine_version": "games-v4",
            })
        else:
            data = {"free_play": stake == 0, "investment_required": stake > 0, "scope": "room" if room_id else "private", "room_id": room_id, "round_id": str(uuid4()), "engine_version": "games-v4", "animation": {"duration_ms": 1800, "reveal_ms": 1200}}
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
            id=round_id, user_id=user.id, room_id=room_id, game_type=game_type,
            status=("finished" if game_type != "blackjack" or result != "pending" else "open"),
            started_at=now, ends_at=now,
            result_key=(None if result == "pending" else result),
            state_data=json.dumps(data.get("state", data), ensure_ascii=False, separators=(",", ":")),
        ))
        db.flush()
        payout = game_payout(game_type, choice, result, stake, data)
        if stake:
            db.add(GameBet(round_id=round_id,user_id=user.id,choice=choice or "auto",amount=stake,payout=payout))
        locked_user.lidya += payout
        data["stake"] = stake
        data["payout"] = payout
        response = _save_game_play(db, user, game_type, choice, result, data)
        if game_type == "blackjack":
            response["data"] = {**data, "state":display_state(data["state"]), "dealer_hand":data["dealer_hand"] if result != "pending" else data["dealer_hand"][:1], "dealer_total":data["dealer_total"] if result != "pending" else None}
        response.update({"stake":stake,"payout":payout,"balance":locked_user.lidya})
        return response
