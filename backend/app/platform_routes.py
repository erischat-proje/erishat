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
    GameRound, Report, RoomAnnouncement, UserLocation, UserPrivacy, VipStatus,
)
from .room_models import Room, RoomGiftEvent, RoomMember

router = APIRouter(prefix="/v1", tags=["platform"])

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
    1: {"capacity": 30, "required": 0},
    2: {"capacity": 40, "required": 40_000},
    3: {"capacity": 50, "required": 100_000},
    4: {"capacity": 60, "required": 200_000},
    5: {"capacity": 70, "required": 350_000},
    6: {"capacity": 80, "required": 610_000},
    7: {"capacity": 90, "required": 890_000},
    8: {"capacity": 100, "required": 1_130_000},
    9: {"capacity": 110, "required": 1_500_000},
    10: {"capacity": 120, "required": 2_000_000},
    11: {"capacity": 130, "required": 2_600_000},
    12: {"capacity": 140, "required": 3_200_000},
}

ROULETTE = [
    {"key": "rose", "weight": 45.0, "multiplier": 0.0},
    {"key": "heart", "weight": 20.0, "multiplier": 1.1},
    {"key": "star", "weight": 12.0, "multiplier": 1.3},
    {"key": "diamond", "weight": 8.0, "multiplier": 1.6},
    {"key": "crown", "weight": 6.0, "multiplier": 2.0},
    {"key": "gift", "weight": 4.0, "multiplier": 2.5},
    {"key": "fire", "weight": 3.0, "multiplier": 3.0},
    {"key": "gem", "weight": 1.5, "multiplier": 4.0},
    {"key": "jackpot", "weight": 0.5, "multiplier": 6.0},
]
CUPS = {"cup_1", "cup_2", "cup_3", "cup_4"}


class PrivacyUpdate(BaseModel):
    hide_vip: bool | None = None
    hide_vip_badge: bool | None = None
    hide_vip_neon: bool | None = None
    hide_vip_entry: bool | None = None
    hide_vip_title: bool | None = None
    hide_location: bool | None = None


class LocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    city: str = Field(min_length=1, max_length=128)


class DiscoveryUpdate(BaseModel):
    gender_filter: str = Field(pattern="^(female|male|any)$")
    random_enabled: bool = True


class ReportCreate(BaseModel):
    target_user_id: str | None = None
    room_id: str | None = None
    message_id: int | None = None
    category: str = Field(min_length=1, max_length=32)
    reason: str = Field(min_length=3, max_length=2000)


class FamilyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class FamilyDonationCreate(BaseModel):
    amount: int = Field(ge=1, le=10_000_000)


class FamilyMemberUpdate(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)


class GameBetCreate(BaseModel):
    choice: str = Field(min_length=1, max_length=32)
    amount: int = Field(ge=1, le=1_000_000)


def vip_row(db: Session, user_id: str) -> VipStatus:
    row = db.get(VipStatus, user_id)
    if not row:
        row = VipStatus(user_id=user_id, level=0)
        db.add(row)
        db.flush()
    return row


def privacy_row(db: Session, user_id: str) -> UserPrivacy:
    row = db.get(UserPrivacy, user_id)
    if not row:
        row = UserPrivacy(user_id=user_id)
        db.add(row)
        db.flush()
    return row


def family_level(balance: int) -> int:
    level = 1
    for candidate, rule in FAMILY_LEVELS.items():
        if balance >= rule["required"]:
            level = candidate
    return level


def fan_level(total: int) -> int:
    level = 1
    for i, threshold in enumerate(FAN_THRESHOLDS, start=1):
        if total >= threshold:
            level = i
    return level


def distance_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def user_can_show_vip(db: Session, user_id: str, field: str) -> bool:
    privacy = db.get(UserPrivacy, user_id)
    if not privacy:
        return True
    return not bool(getattr(privacy, field, False))


def require_family_member(db: Session, family_id: str, user_id: str) -> Family:
    family = db.get(Family, family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Aile bulunamadı")
    exists = db.scalar(select(FamilyMember.id).where(FamilyMember.family_id == family_id, FamilyMember.user_id == user_id))
    if not exists:
        raise HTTPException(status_code=403, detail="Bu ailenin üyesi değilsiniz")
    return family


@router.get("/me/privacy")
def get_privacy(db: Session = Depends(get_db), user: User = Depends(lambda: None)):
    raise HTTPException(status_code=500, detail="auth dependency not configured")


def register_platform_auth(current_user_dependency):
    for route in list(router.routes):
        if getattr(route, "path", "") == "/v1/me/privacy":
            router.routes.remove(route)

    @router.get("/me/privacy")
    def get_privacy_auth(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        p = privacy_row(db, user.id)
        db.commit()
        return {k: getattr(p, k) for k in ("hide_vip", "hide_vip_badge", "hide_vip_neon", "hide_vip_entry", "hide_vip_title", "hide_location")}

    @router.patch("/me/privacy")
    def update_privacy(payload: PrivacyUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        p = privacy_row(db, user.id)
        for key, value in payload.model_dump(exclude_none=True).items():
            setattr(p, key, value)
        db.commit()
        return {k: getattr(p, k) for k in ("hide_vip", "hide_vip_badge", "hide_vip_neon", "hide_vip_entry", "hide_vip_title", "hide_location")}

    @router.get("/me/vip")
    def my_vip(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        v = vip_row(db, user.id)
        db.commit()
        return {"level": v.level, "perks": sorted({p for level in range(1, v.level + 1) for p in VIP_PERKS.get(level, [])}), "neon_color": v.neon_color, "entry_effect": v.entry_effect}

    @router.get("/users/{user_id}/vip")
    def public_vip(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        target = db.get(User, user_id)
        if not target:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        v = vip_row(db, user_id)
        p = privacy_row(db, user_id)
        if p.hide_vip:
            return {"level": 0, "hidden": True, "perks": []}
        return {"level": v.level, "hidden": False, "badge_hidden": p.hide_vip_badge, "neon_hidden": p.hide_vip_neon, "entry_hidden": p.hide_vip_entry, "title_hidden": p.hide_vip_title, "perks": sorted({x for level in range(1, v.level + 1) for x in VIP_PERKS.get(level, [])})}

    @router.put("/me/location")
    def set_location(payload: LocationUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = db.get(UserLocation, user.id)
        if not row:
            row = UserLocation(user_id=user.id, latitude=payload.latitude, longitude=payload.longitude, city=payload.city.strip())
            db.add(row)
        else:
            row.latitude, row.longitude, row.city = payload.latitude, payload.longitude, payload.city.strip()
        db.commit()
        return {"saved": True, "city": row.city}

    @router.get("/me/location")
    def get_location(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = db.get(UserLocation, user.id)
        if not row:
            raise HTTPException(status_code=409, detail="Konum izni gerekli")
        return {"city": row.city}

    @router.get("/me/discovery")
    def get_discovery(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        p = db.get(DiscoveryPreference, user.id) or DiscoveryPreference(user_id=user.id)
        if not db.get(DiscoveryPreference, user.id):
            db.add(p); db.commit()
        return {"gender_filter": p.gender_filter, "random_enabled": p.random_enabled}

    @router.patch("/me/discovery")
    def update_discovery(payload: DiscoveryUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        p = db.get(DiscoveryPreference, user.id)
        if not p:
            p = DiscoveryPreference(user_id=user.id); db.add(p)
        p.gender_filter, p.random_enabled = payload.gender_filter, payload.random_enabled
        db.commit()
        return {"gender_filter": p.gender_filter, "random_enabled": p.random_enabled}

    @router.post("/reports", status_code=201)
    def create_report(payload: ReportCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        if not any((payload.target_user_id, payload.room_id, payload.message_id)):
            raise HTTPException(status_code=400, detail="Şikayet hedefi gerekli")
        report = Report(reporter_id=user.id, **payload.model_dump())
        db.add(report); db.commit(); db.refresh(report)
        return {"id": report.id, "status": report.status}

    @router.get("/discover/rooms")
    def discover_rooms(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        rows = []
        rooms = list(db.scalars(select(Room).order_by(Room.created_at.desc()).offset(offset).limit(300)))
        for room in rooms:
            members = int(db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id == room.id)) or 0)
            if members <= 0:
                continue
            rows.append({"room_id": room.id, "name": room.name, "owner_id": room.owner_id, "member_count": members, "level": room.level, "locked": room.locked})
        rows.sort(key=lambda x: (-x["member_count"], -x["level"], x["room_id"]))
        return rows[offset:offset + limit]

    def location_or_409(db: Session, user_id: str) -> UserLocation:
        row = db.get(UserLocation, user_id)
        if not row:
            raise HTTPException(status_code=409, detail="Konum izni gerekli")
        return row

    def candidate_users(db: Session, user: User, max_km: float) -> list[tuple[User, float]]:
        origin = location_or_409(db, user.id)
        pref = db.get(DiscoveryPreference, user.id)
        wanted = pref.gender_filter if pref else "any"
        result = []
        locations = list(db.scalars(select(UserLocation).where(UserLocation.user_id != user.id)))
        for loc in locations:
            target = db.get(User, loc.user_id)
            if not target or not target.is_active:
                continue
            if wanted != "any" and target.gender != wanted:
                continue
            d = distance_km(origin.latitude, origin.longitude, loc.latitude, loc.longitude)
            if d <= max_km:
                result.append((target, d))
        result.sort(key=lambda item: item[1])
        return result

    @router.get("/discover/nearby")
    def nearby(limit: int = Query(20, ge=1, le=50), db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        result = candidate_users(db, user, 20)[:limit]
        return [{"user_id": u.id, "nickname": u.nickname, "avatar": u.avatar, "gender": u.gender, "city": db.get(UserLocation, u.id).city, "distance_km": round(d, 1)} for u, d in result]

    @router.post("/discover/random-chat")
    def random_chat(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        candidates = candidate_users(db, user, 30)
        if not candidates:
            raise HTTPException(status_code=404, detail="Uygun eşleşme bulunamadı")
        target, d = random.choice(candidates)
        conversation_id = "dm_" + "_".join(sorted((user.id, target.id)))
        conversation = db.get(Conversation, conversation_id)
        if not conversation:
            conversation = Conversation(id=conversation_id, type="dm")
            db.add(conversation); db.flush()
            db.add_all([ConversationMember(conversation_id=conversation_id, user_id=user.id), ConversationMember(conversation_id=conversation_id, user_id=target.id)])
            db.commit()
        return {"matched_user_id": target.id, "conversation_id": conversation_id, "city": db.get(UserLocation, target.id).city, "distance_km": round(d, 1)}

    @router.post("/discover/random-room")
    def random_room(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        rooms = []
        for room in db.scalars(select(Room)):
            count = int(db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id == room.id)) or 0)
            if count < 1:
                continue
            rooms.append(room)
        if not rooms:
            raise HTTPException(status_code=404, detail="Aktif oda bulunamadı")
        room = random.choice(rooms)
        if not db.scalar(select(RoomMember.id).where(RoomMember.room_id == room.id, RoomMember.user_id == user.id)):
            db.add(RoomMember(room_id=room.id, user_id=user.id)); db.commit()
        return {"room_id": room.id, "name": room.name}

    @router.get("/users/{user_id}/fans")
    def fans(user_id: str, db: Session = Depends(get_db), viewer: User = Depends(current_user_dependency)):
        target = db.get(User, user_id)
        if not target:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        rows = list(db.execute(select(RoomGiftEvent.sender_id, func.sum(RoomGiftEvent.total_price).label("amount")).where(RoomGiftEvent.recipient_id == user_id).group_by(RoomGiftEvent.sender_id).order_by(func.sum(RoomGiftEvent.total_price).desc()).limit(30)).all())
        result = []
        for sender_id, amount in rows:
            sender = db.get(User, sender_id)
            if not sender: continue
            level = fan_level(int(amount))
            fp = db.get(FanProfile, sender_id)
            if not fp:
                fp = FanProfile(user_id=sender_id, fan_level=level); db.add(fp)
            elif fp.fan_level != level:
                fp.fan_level = level
            gift_rows = db.execute(select(RoomGiftEvent.gift_key, func.sum(RoomGiftEvent.quantity).label("quantity"), func.sum(RoomGiftEvent.total_price).label("spent")).where(RoomGiftEvent.sender_id == sender_id, RoomGiftEvent.recipient_id == user_id).group_by(RoomGiftEvent.gift_key).order_by(func.sum(RoomGiftEvent.total_price).desc())).all()
            result.append({"user_id": sender.id, "nickname": sender.nickname, "avatar": sender.avatar, "fan_level": level, "lidya": int(amount), "gifts": [{"gift_key": g, "quantity": int(q), "lidya": int(s)} for g, q, s in gift_rows]})
        db.commit()
        return {"items": result}

    @router.post("/families", status_code=201)
    def create_family(payload: FamilyCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        if db.scalar(select(Family.id).where(Family.owner_id == user.id)):
            raise HTTPException(status_code=409, detail="Zaten bir aileniz var")
        locked = db.execute(select(User.lidya).where(User.id == user.id).with_for_update()).scalar_one()
        if locked < 10_000:
            raise HTTPException(status_code=400, detail="Aile açmak için 10.000 Lidya gerekli")
        conversation_id = "family_" + uuid4().hex
        db.add(Conversation(id=conversation_id, type="family")); db.flush()
        family = Family(id="family_" + uuid4().hex, owner_id=user.id, name=payload.name.strip(), level=1, balance=0, chat_conversation_id=conversation_id)
        db.add(family); db.add(FamilyMember(family_id=family.id, user_id=user.id)); db.add(ConversationMember(conversation_id=conversation_id, user_id=user.id))
        db.execute(select(User).where(User.id == user.id).with_for_update())
        user.lidya -= 10_000
        db.commit(); db.refresh(family)
        return {"id": family.id, "name": family.name, "level": 1, "capacity": 30, "chat_conversation_id": conversation_id}

    @router.get("/families/{family_id}")
    def get_family(family_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        family = require_family_member(db, family_id, user.id)
        family.level = family_level(family.balance)
        count = int(db.scalar(select(func.count(FamilyMember.id)).where(FamilyMember.family_id == family.id)) or 0)
        db.commit()
        return {"id": family.id, "name": family.name, "owner_id": family.owner_id, "level": family.level, "capacity": FAMILY_LEVELS[family.level]["capacity"], "balance": family.balance, "member_count": count, "chat_conversation_id": family.chat_conversation_id}

    @router.post("/families/{family_id}/donate")
    def donate_family(family_id: str, payload: FamilyDonationCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        family = require_family_member(db, family_id, user.id)
        locked = db.execute(select(User).where(User.id == user.id).with_for_update()).scalar_one()
        if locked.lidya < payload.amount:
            raise HTTPException(status_code=400, detail="Yeterli Lidya yok")
        locked.lidya -= payload.amount
        family.balance += payload.amount
        family.level = family_level(family.balance)
        db.add(FamilyDonation(family_id=family.id, user_id=user.id, amount=payload.amount)); db.commit()
        return {"family_balance": family.balance, "level": family.level, "capacity": FAMILY_LEVELS[family.level]["capacity"], "donated": payload.amount}

    @router.post("/families/{family_id}/members")
    def add_family_member(family_id: str, payload: FamilyMemberUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        family = require_family_member(db, family_id, user.id)
        if family.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Sadece aile sahibi üye ekleyebilir")
        target = db.get(User, payload.user_id)
        if not target or not target.is_active: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        count = int(db.scalar(select(func.count(FamilyMember.id)).where(FamilyMember.family_id == family.id)) or 0)
        if count >= FAMILY_LEVELS[family.level]["capacity"]: raise HTTPException(status_code=409, detail="Aile kapasitesi dolu")
        if not db.scalar(select(FamilyMember.id).where(FamilyMember.family_id == family.id, FamilyMember.user_id == target.id)):
            db.add(FamilyMember(family_id=family.id, user_id=target.id)); db.add(ConversationMember(conversation_id=family.chat_conversation_id, user_id=target.id)); db.commit()
        return {"joined": True, "family_id": family.id}

    @router.get("/families/{family_id}/chat")
    def family_chat(family_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        family = require_family_member(db, family_id, user.id)
        return {"conversation_id": family.chat_conversation_id, "type": "family"}

    @router.post("/rooms/{room_id}/games/{game_type}", status_code=201)
    def start_game(room_id: str, game_type: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        if game_type not in {"roulette", "cups"}: raise HTTPException(status_code=400, detail="Geçersiz oyun")
        if not db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.user_id == user.id)):
            raise HTTPException(status_code=403, detail="Önce odaya katılın")
        now = datetime.now(timezone.utc)
        active = db.scalar(select(GameRound).where(GameRound.room_id == room_id, GameRound.game_type == game_type, GameRound.status == "open", GameRound.ends_at > now))
        if active: return {"round_id": active.id, "game_type": active.game_type, "ends_at": active.ends_at}
        round_row = GameRound(id="game_" + uuid4().hex, room_id=room_id, game_type=game_type, ends_at=now + timedelta(seconds=90))
        db.add(round_row); db.commit()
        return {"round_id": round_row.id, "game_type": game_type, "ends_at": round_row.ends_at, "house_edge_disclosed": True}

    @router.post("/games/{round_id}/bet")
    def place_game_bet(round_id: str, payload: GameBetCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        round_row = db.get(GameRound, round_id)
        if not round_row or round_row.status != "open": raise HTTPException(status_code=404, detail="Tur bulunamadı")
        if round_row.ends_at <= datetime.now(timezone.utc): raise HTTPException(status_code=400, detail="Bahis süresi doldu")
        if not db.scalar(select(RoomMember.id).where(RoomMember.room_id == round_row.room_id, RoomMember.user_id == user.id)): raise HTTPException(status_code=403, detail="Odaya üye değilsiniz")
        if round_row.game_type == "cups" and payload.choice not in CUPS: raise HTTPException(status_code=400, detail="Geçersiz bardak")
        if round_row.game_type == "roulette" and payload.choice not in {x["key"] for x in ROULETTE}: raise HTTPException(status_code=400, detail="Geçersiz çark seçimi")
        locked = db.execute(select(User).where(User.id == user.id).with_for_update()).scalar_one()
        if locked.lidya < payload.amount: raise HTTPException(status_code=400, detail="Yeterli Lidya yok")
        locked.lidya -= payload.amount
        db.add(GameBet(round_id=round_row.id, user_id=user.id, choice=payload.choice, amount=payload.amount)); db.commit()
        return {"accepted": True, "amount": payload.amount, "round_id": round_row.id}

    @router.post("/games/{round_id}/settle")
    def settle_game(round_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        round_row = db.get(GameRound, round_id)
        if not round_row: raise HTTPException(status_code=404, detail="Tur bulunamadı")
        if round_row.status == "settled": return {"settled": True, "result": round_row.result_key}
        if round_row.ends_at > datetime.now(timezone.utc): raise HTTPException(status_code=400, detail="Tur henüz bitmedi")
        if round_row.game_type == "roulette":
            result = random.choices([x["key"] for x in ROULETTE], weights=[x["weight"] for x in ROULETTE], k=1)[0]
            multiplier = {x["key"]: x["multiplier"] for x in ROULETTE}[result]
        else:
            result = random.choice(sorted(CUPS)); multiplier = 3.5
        round_row.result_key = result; round_row.status = "settled"
        bets = list(db.scalars(select(GameBet).where(GameBet.round_id == round_row.id)))
        for bet in bets:
            payout = int(bet.amount * multiplier) if bet.choice == result else 0
            bet.payout = payout
            if payout:
                recipient = db.execute(select(User).where(User.id == bet.user_id).with_for_update()).scalar_one()
                recipient.lidya += payout
        db.commit()
        return {"settled": True, "result": result, "multiplier": multiplier, "house_edge_disclosed": True}

    @router.get("/users/{user_id}/profile-gifts")
    def profile_gifts(user_id: str, db: Session = Depends(get_db), viewer: User = Depends(current_user_dependency)):
        if not db.get(User, user_id): raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        received = db.execute(select(RoomGiftEvent.gift_key, func.sum(RoomGiftEvent.quantity).label("quantity"), func.sum(RoomGiftEvent.total_price).label("lidya")).where(RoomGiftEvent.recipient_id == user_id).group_by(RoomGiftEvent.gift_key).order_by(func.sum(RoomGiftEvent.total_price).desc())).all()
        return {"top_gifts": [{"gift_key": g, "quantity": int(q), "lidya": int(a)} for g, q, a in received]}
