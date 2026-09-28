from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4
from pathlib import Path
import json
import os
from collections import defaultdict, deque
from typing import Literal
import time
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Header, File, Form, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .room_models import Room, RoomBan, RoomChatMute, RoomFollow, RoomGiftEvent, RoomMember, RoomModerator, RoomMusic, RoomMusicAccess, RoomSeat, RoomPassword, RoomWallpaper, RoomWallpaperState, RoomInvitation
from .platform_models import Notification, UserBlock, UserFollow, VipStatus
from .platform_routes import vip_level_from_spend
from .admin_models import AdminRole, RoomAdminBan, UserBan
from .system_data import RoomIdRegistry
from .system_logs import record
from .support_models import SupportTicket
from .support_routes import SupportCreate
from .wallpapers import catalog as wallpaper_catalog, find as find_wallpaper

router = APIRouter(prefix="/v1/rooms", tags=["rooms"])

def _room_auth_unconfigured():
    raise HTTPException(status_code=500, detail="Room auth dependency is not configured")

_room_auth_impl = _room_auth_unconfigured

def _room_auth_dependency(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    return _room_auth_impl(db, authorization)

current_user_dependency = _room_auth_dependency


LEVELS = {1: {"capacity": 35, "moderators": 2, "seats": 8, "required_spend": 0}, 2: {"capacity": 45, "moderators": 3, "seats": 8, "required_spend": 220_000}, 3: {"capacity": 55, "moderators": 4, "seats": 8, "required_spend": 410_000}, 4: {"capacity": 65, "moderators": 5, "seats": 8, "required_spend": 630_000}, 5: {"capacity": 75, "moderators": 6, "seats": 12, "required_spend": 840_000}, 6: {"capacity": 85, "moderators": 8, "seats": 12, "required_spend": 1_000_000}, 7: {"capacity": 95, "moderators": 10, "seats": 16, "required_spend": 1_240_000}, 8: {"capacity": 105, "moderators": 12, "seats": 16, "required_spend": 1_560_000}}
GIFT_RECIPIENT_PERCENT = 70
GIFT_ITEMS = json.loads(Path(__file__).with_name("gift_catalog.json").read_text(encoding="utf-8"))
GIFT_META = {gift["name"]: gift for gift in GIFT_ITEMS}
GIFT_CATALOG = {gift["name"]: gift["price"] for gift in GIFT_ITEMS}

def gift_visual(key: str) -> dict:
    gift = GIFT_META.get(key, {})
    return {"id": gift.get("id"), "gift_id": gift.get("id"), "name": gift.get("name", key), "image_url": gift.get("image_url"),
            "tier": gift.get("tier"), "sound": gift.get("sound"),
            "animation_description": gift.get("animation")}

class RoomCreate(BaseModel): name: str = Field(min_length=1, max_length=16)
class RoomPasswordUpdate(BaseModel): password: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")
class RoomWallpaperUpdate(BaseModel): asset_key: str = Field(min_length=1, max_length=255); days: Literal[1, 7, 30]
class RoomJoinPayload(BaseModel): password: str | None = Field(default=None, max_length=4)
class RoomChatUpdate(BaseModel): enabled: bool
class RoomNameUpdate(BaseModel): name: str = Field(min_length=1, max_length=16)
class RoomThemeUpdate(BaseModel): theme: str = Field(min_length=1, max_length=32)
class RoomSeatCountUpdate(BaseModel): seat_count: int
class ModeratorUpdate(BaseModel): user_id: str = Field(min_length=1, max_length=64)
class BanUpdate(BaseModel): user_id: str = Field(min_length=1, max_length=64)
class RoomReportInput(BaseModel):
    reason: str = Field(min_length=1, max_length=200)
    attachments: list[str] = Field(default_factory=list, max_length=3)
class MusicPlaybackUpdate(BaseModel):
    playback_action: str = Field(alias="action")
    position_seconds: int = Field(default=0, ge=0, le=86400)
    model_config = {"populate_by_name": True}
class RoomInvite(BaseModel): user_id: str = Field(min_length=1, max_length=64)
class GiftSend(BaseModel):
    recipient_id: str = Field(min_length=1, max_length=64); gift_key: str = Field(min_length=1, max_length=64); quantity: int = Field(ge=1, le=99)
class MusicCreate(BaseModel):
    title: str = Field(min_length=1, max_length=128); source_url: str = Field(min_length=1, max_length=2000)
class RTCSignal(BaseModel):
    target_id: str = Field(min_length=1, max_length=64)
    type: Literal["offer", "answer", "ice-candidate", "leave"]
    payload: dict = Field(default_factory=dict)
_RTC_SIGNAL_TTL = 60.0
_RTC_SIGNAL_LIMIT = 100
_rtc_signals: dict[str, deque] = defaultdict(deque)

def _prune_rtc_signals(room_id: str) -> deque:
    queue = _rtc_signals[room_id]
    cutoff = time.monotonic() - _RTC_SIGNAL_TTL
    while queue and queue[0]["ts"] < cutoff:
        queue.popleft()
    while len(queue) > _RTC_SIGNAL_LIMIT:
        queue.popleft()
    return queue

def level_for_spend(spend: int) -> int:
    current = 1
    for level, rule in LEVELS.items():
        if spend >= rule["required_spend"]: current = level
    return current

def gift_level_for_price(price: int) -> int:
    if price <= 29: return 1
    if price <= 99: return 2
    if price <= 499: return 3
    if price <= 999: return 4
    if price <= 9_999: return 5
    if price <= 19_999: return 6
    if price <= 49_999: return 7
    if price <= 89_999: return 8
    return 9

GIFT_ANIMATION_PROFILES = {
    1: {"name": "none", "intensity": 0, "duration_ms": 0},
    2: {"name": "soft", "intensity": 1, "duration_ms": 900},
    3: {"name": "spark", "intensity": 2, "duration_ms": 1100},
    4: {"name": "flare", "intensity": 3, "duration_ms": 1300},
    5: {"name": "royal", "intensity": 4, "duration_ms": 1500},
    6: {"name": "treasure", "intensity": 5, "duration_ms": 1700},
    7: {"name": "grand", "intensity": 6, "duration_ms": 2100},
    8: {"name": "mythic", "intensity": 7, "duration_ms": 2500},
    9: {"name": "kroisos", "intensity": 8, "duration_ms": 3000},
}

def gift_presentation(price: int) -> dict:
    level = gift_level_for_price(int(price))
    profile = GIFT_ANIMATION_PROFILES[level]
    return {"level": level, "animation": level > 1, "animation_profile": profile["name"], "animation_intensity": profile["intensity"], "animation_duration_ms": profile["duration_ms"], "global_announcement": level >= 7}


def refresh_level(db: Session, room: Room) -> int:
    spend = db.scalar(select(func.coalesce(func.sum(RoomGiftEvent.total_price), 0)).where(RoomGiftEvent.room_id == room.id)) or 0
    new_level = level_for_spend(int(spend))
    if room.level != new_level:
        previous = room.level
        room.level = new_level
        db.add(Notification(user_id=room.owner_id, kind="room_level", title="Oda seviyesi yükseldi", body=f"{room.name} odası seviye {new_level} oldu."))
        db.commit()
    return new_level

def generate_room_public_id(db: Session) -> str:
    while True:
        candidate = f"{uuid4().int % 1_000_000_000_000:012d}"
        if not db.scalar(select(Room.id).where(Room.public_id == candidate)) and not db.scalar(select(RoomIdRegistry.room_id).where(RoomIdRegistry.public_id == candidate)):
            return candidate


def get_room_or_404(db: Session, room_id: str) -> Room:
    room = db.get(Room, room_id) or db.scalar(select(Room).where(Room.public_id == room_id))
    if not room: raise HTTPException(status_code=404, detail="Oda bulunamadı")
    refresh_level(db, room); return room

def require_owner(db: Session, room: Room, user: User) -> None:
    if room.owner_id != user.id: raise HTTPException(status_code=403, detail="Sadece oda sahibi yapabilir")

def require_staff(db: Session, room: Room, user: User) -> None:
    if room.owner_id == user.id: return
    moderator = db.scalar(select(RoomModerator.id).where(RoomModerator.room_id == room.id, RoomModerator.user_id == user.id))
    if not moderator or not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Oda sahibi veya aktif moderatör olmalısınız")

def require_manageable_guest(db: Session, room: Room, actor: User, target_id: str) -> None:
    if target_id == room.owner_id:
        raise HTTPException(status_code=403, detail="Oda sahibi yönetilemez")
    if actor.id != room.owner_id and db.scalar(select(RoomModerator.id).where(
        RoomModerator.room_id == room.id, RoomModerator.user_id == target_id)):
        raise HTTPException(status_code=403, detail="Moderatörü yalnızca oda sahibi yönetebilir")


def is_member(db: Session, room_id: str, user_id: str) -> bool:
    return bool(db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)))

def ensure_seats(db: Session, room: Room) -> None:
    count = db.scalar(select(func.count(RoomSeat.id)).where(RoomSeat.room_id == room.id)) or 0
    target = LEVELS[room.level]["seats"]
    if count >= target: return
    for number in range(1, target + 1):
        if not db.scalar(select(RoomSeat.id).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == number)): db.add(RoomSeat(room_id=room.id, seat_number=number))
    db.commit()

def room_view(db: Session, room: Room, user: User | None = None) -> dict:
    ensure_seats(db, room)
    spend = db.scalar(select(func.coalesce(func.sum(RoomGiftEvent.total_price), 0)).where(RoomGiftEvent.room_id == room.id)) or 0
    members = db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id == room.id)) or 0
    moderators = list(db.scalars(select(RoomModerator.user_id).where(RoomModerator.room_id == room.id)))
    seats = list(db.scalars(select(RoomSeat).where(RoomSeat.room_id == room.id).order_by(RoomSeat.seat_number)))
    current_id = str(user.id) if user else ""
    is_owner = bool(user and str(room.owner_id) == current_id)
    is_moderator = bool(user and any(str(x) == current_id for x in moderators))
    current_seat = next((s.seat_number for s in seats if user and str(s.user_id or "") == current_id), None)
    can_manage = bool(is_owner or is_moderator)
    public_seats = []
    for s in seats:
        seat_user = db.get(User, s.user_id) if s.user_id else None
        public_seats.append({"seat_number": s.seat_number, "user_id": s.user_id, "user_name": (getattr(seat_user, "nickname", None) or getattr(seat_user, "username", None) or str(s.user_id)) if seat_user else None, "avatar": getattr(seat_user, "avatar", None) if seat_user else None, "avatar_asset": getattr(seat_user, "avatar_asset", None) if seat_user else None, "frame_asset": getattr(seat_user, "frame_asset", None) if seat_user else None, "locked": bool(s.locked), **({"muted": bool(s.muted)} if can_manage else {})})
    wallpaper = db.get(RoomWallpaper, room.id)
    wallpaper_expiry = wallpaper.paid_until if wallpaper and wallpaper.paid_until.tzinfo else (wallpaper.paid_until.replace(tzinfo=timezone.utc) if wallpaper else None)
    wallpaper_active = bool(wallpaper_expiry and wallpaper_expiry > datetime.now(timezone.utc))
    wallpaper_state = db.get(RoomWallpaperState, room.id)
    wallpaper_applied = bool(wallpaper_state.applied) if wallpaper_state else wallpaper_active
    wallpaper_item = find_wallpaper(wallpaper.asset_key) if wallpaper_active and wallpaper else None
    is_following = bool(user and db.scalar(select(RoomFollow.id).where(RoomFollow.room_id == room.id, RoomFollow.user_id == user.id)))
    return {"id": room.id, "public_id": room.public_id, "name": room.name, "owner_id": room.owner_id, "owner_name": (getattr(db.get(User, room.owner_id), "nickname", None) or getattr(db.get(User, room.owner_id), "username", None) or str(room.owner_id)), "level": room.level,
        "seat_count": int(room.seat_count or LEVELS[room.level]["seats"]),
        "theme": room.theme, "is_active": room.is_active, "is_following": is_following, "capacity": LEVELS[room.level]["capacity"], "chat_enabled": room.chat_enabled, "locked": bool(room.locked and (room.lock_expires_at is None or room.lock_expires_at > datetime.now(timezone.utc))), "password_set": db.get(RoomPassword, room.id) is not None, "member_count": members, "spent_lidya": int(spend), "wallpaper_asset": wallpaper.asset_key if wallpaper_active and wallpaper_applied else None, "wallpaper_asset_path": wallpaper_item["asset"] if wallpaper_active and wallpaper_applied and wallpaper_item else None, "wallpaper_owned_asset": wallpaper.asset_key if wallpaper_active else None, "wallpaper_owned_asset_path": wallpaper_item["asset"] if wallpaper_active and wallpaper_item else None, "wallpaper_applied": bool(wallpaper_active and wallpaper_applied), "wallpaper_expires_at": wallpaper.paid_until if wallpaper_active else None, "moderators": moderators if can_manage else [], "seats": public_seats, "current_user_id": current_id or None, "current_user_seat": current_seat, "is_owner": is_owner, "is_moderator": is_moderator, "can_manage": can_manage, "management": {"rename": can_manage and is_owner, "lock_room": can_manage, "password": can_manage, "moderators": is_owner, "seat_controls": can_manage, "chat_settings": can_manage}}

@router.post("", status_code=201)
def create_room_placeholder(payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(lambda: None)):
    raise HTTPException(status_code=500, detail="room auth dependency not configured")

def register_room_auth(current_user_dependency):
    global _room_auth_impl
    _room_auth_impl = current_user_dependency
    router.dependencies.clear()
    for route in list(router.routes):
        if getattr(route, "path", None) == "/v1/rooms" and getattr(route, "methods", set()) == {"POST"}: router.routes.remove(route)
    @router.post("", status_code=201)
    def create_room(payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        name = payload.name.strip()
        if not name: raise HTTPException(status_code=400, detail="Oda adı boş olamaz")
        if len(name) > 16: raise HTTPException(status_code=422, detail="Oda adı en fazla 16 karakter olabilir")
        # Her kullanıcı yalnızca tek bir odanın sahibi olabilir.
        existing_owned_room = db.scalar(select(Room.id).where(Room.owner_id == user.id).limit(1))
        if existing_owned_room:
            raise HTTPException(status_code=409, detail="Zaten bir odanız var. Her kullanıcı yalnızca 1 oda oluşturabilir.")
        room = Room(id="room_" + uuid4().hex, public_id=generate_room_public_id(db), owner_id=user.id, name=name, is_active=False)
        db.add(room); db.flush()
        db.add(RoomIdRegistry(room_id=room.id, public_id=room.public_id))
        db.add(RoomMember(room_id=room.id, user_id=user.id))
        ensure_seats(db, room); db.commit(); db.refresh(room)
        record("room_id", "room_public_id_created", room_id=room.id, public_id=room.public_id, owner_id=user.id, owner_nickname=user.nickname)
        return room_view(db, room, user)
    @router.get("")
    def list_rooms(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        # Keşfette aynı kullanıcının eski/test kaynaklı mükerrer sahiplik kayıtlarını tekrar göstermiyoruz.
        # Başka kullanıcıların odaları normal şekilde görünür; moderatörlük sahiplik sayısına dahil değildir.
        rooms = list(db.scalars(select(Room).where(Room.is_active.is_(True)).order_by(Room.created_at.desc())))
        seen_owner: set[str] = set()
        visible = []
        for room in rooms:
            owner_id = str(room.owner_id)
            if owner_id == str(user.id):
                if owner_id in seen_owner:
                    continue
                seen_owner.add(owner_id)
            visible.append(room)
        return [room_view(db, room, user) for room in visible]
    @router.get("/me/rooms")
    def list_my_rooms(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        # Eski test/veri kayıtlarında aynı kullanıcıya ait birden fazla sahiplik kalmış olabilir.
        # Kullanıcı arayüzünde yalnızca tek sahip olunan oda gösterilir; moderatör olunan odalar ayrıca listelenir.
        owned_room = db.scalar(select(Room).where(Room.owner_id == user.id).order_by(Room.created_at.desc()).limit(1))
        moderated_rooms = list(db.scalars(
            select(Room)
            .where(Room.id.in_(select(RoomModerator.room_id).where(RoomModerator.user_id == user.id)), Room.owner_id != user.id)
            .order_by(Room.created_at.desc())
        ))
        rooms = ([owned_room] if owned_room else []) + moderated_rooms
        result = []
        for room in rooms:
            view = room_view(db, room, user)
            view["role"] = "owner" if view["is_owner"] else "moderator"
            result.append(view)
        return result
    @router.get("/following")
    def list_followed_rooms(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        rooms = list(db.scalars(select(Room).join(RoomFollow, RoomFollow.room_id == Room.id)
            .where(RoomFollow.user_id == user.id).order_by(RoomFollow.created_at.desc())))
        result = []
        for room in rooms:
            view = room_view(db, room, user)
            view["is_following"] = True
            result.append(view)
        return result
    @router.post("/{room_id}/follow", status_code=201)
    def follow_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if room.owner_id == user.id:
            raise HTTPException(status_code=400, detail="Kendi odanızı takip edemezsiniz")
        existing = db.scalar(select(RoomFollow.id).where(RoomFollow.room_id == room.id, RoomFollow.user_id == user.id))
        if existing:
            return {"following": True, "room_id": room.id, "is_following": True}
        db.add(RoomFollow(room_id=room.id, user_id=user.id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if not db.scalar(select(RoomFollow.id).where(RoomFollow.room_id == room.id, RoomFollow.user_id == user.id)):
                raise
        return {"following": True, "room_id": room.id, "is_following": True}
    @router.delete("/{room_id}/follow")
    def unfollow_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        db.execute(delete(RoomFollow).where(RoomFollow.room_id == room.id, RoomFollow.user_id == user.id))
        db.commit()
        return {"following": False, "room_id": room.id, "is_following": False}
    @router.get("/{room_id}")
    def get_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)): return room_view(db, get_room_or_404(db, room_id), user)
    @router.patch("/{room_id}/name")
    def rename_room(room_id: str, payload: RoomNameUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        require_owner(db, room, user)
        name = payload.name.strip()
        if not name or len(name) > 16:
            raise HTTPException(status_code=422, detail="Oda adı 1-16 karakter olmalıdır")
        old_name = room.name
        room.name = name
        db.commit()
        record("room", "room_name_changed", room_id=room.id, public_id=room.public_id, actor_id=user.id, old_name=old_name, new_name=name)
        return room_view(db, room, user)
    @router.post("/{room_id}/join")
    def join_room(room_id: str, payload: RoomJoinPayload | None = None, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        admin = db.get(AdminRole, user.id)
        admin_mode = bool(admin and admin.role in {"SA", "UA", "DA"})
        stored = db.get(RoomPassword, room.id)
        if stored and room.owner_id != user.id:
            supplied = (payload.password if payload else None) or ""
            if not supplied or hashlib.sha256(supplied.encode()).hexdigest() != stored.password_hash:
                raise HTTPException(status_code=403, detail="Oda kilitli. 4 haneli şifre gerekli.")
        if db.scalar(select(RoomBan.id).where(RoomBan.room_id == room.id, RoomBan.user_id == user.id)): raise HTTPException(status_code=403, detail="Bu odadan atıldınız")
        active_admin_ban = db.scalar(select(RoomAdminBan).where(RoomAdminBan.room_id == room.id, RoomAdminBan.active.is_(True), (RoomAdminBan.expires_at.is_(None)) | (RoomAdminBan.expires_at > datetime.now(timezone.utc))))
        if active_admin_ban and not admin_mode: raise HTTPException(status_code=403, detail="Oda yönetim tarafından yasaklandı")
        active_user_ban = db.scalar(select(UserBan).where(UserBan.user_id == user.id, UserBan.active.is_(True), (UserBan.expires_at.is_(None)) | (UserBan.expires_at > datetime.now(timezone.utc))))
        if active_user_ban and not admin_mode: raise HTTPException(status_code=403, detail="Hesabınız yasaklı")
        if room.locked and not stored and room.lock_expires_at and room.lock_expires_at > datetime.now(timezone.utc) and room.owner_id != user.id and not admin_mode: raise HTTPException(status_code=403, detail="Oda kilitli")
        if not is_member(db, room.id, user.id):
            count = db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id == room.id)) or 0
            if count >= LEVELS[room.level]["capacity"]: raise HTTPException(status_code=409, detail="Oda dolu")
            db.add(RoomMember(room_id=room.id, user_id=user.id))
        room.is_active = True
        db.commit()
        return room_view(db, room, user)
    @router.post("/{room_id}/call-followers")
    def call_followers(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id):
            raise HTTPException(status_code=403, detail="Takipçilerini çağırmak için odada olmalısın")
        now = datetime.now(timezone.utc)
        recent = db.scalar(select(RoomInvitation.id).where(
            RoomInvitation.room_id == room.id,
            RoomInvitation.sender_id == user.id,
            RoomInvitation.created_at > now - timedelta(hours=6),
        ).limit(1))
        if recent:
            raise HTTPException(status_code=429, detail="Takipçilerini yeniden çağırmak için 6 saat bekle")
        follower_ids = db.scalars(select(UserFollow.follower_id).where(
            UserFollow.following_id == user.id
        ).limit(200)).all()
        sent = 0
        for follower_id in follower_ids:
            if follower_id == user.id or is_member(db, room.id, follower_id):
                continue
            blocked = db.scalar(select(UserBlock.id).where(
                ((UserBlock.blocker_id == user.id) & (UserBlock.blocked_id == follower_id)) |
                ((UserBlock.blocker_id == follower_id) & (UserBlock.blocked_id == user.id))
            ).limit(1))
            if blocked:
                continue
            follower = db.get(User, follower_id)
            if not follower or not follower.is_active:
                continue
            db.add(RoomInvitation(
                room_id=room.id, sender_id=user.id, recipient_id=follower_id,
                status="pending", expires_at=now + timedelta(minutes=15)
            ))
            sent += 1
        db.commit()
        return {"sent": sent, "room_id": room.id}

    @router.get("/invites/pending")
    def pending_room_invitations(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        now = datetime.now(timezone.utc)
        rows = db.scalars(select(RoomInvitation).where(
            RoomInvitation.recipient_id == user.id,
            RoomInvitation.status == "pending",
            RoomInvitation.expires_at > now
        ).order_by(RoomInvitation.created_at.desc()).limit(10)).all()
        result = []
        for invite in rows:
            room = db.get(Room, invite.room_id)
            sender = db.get(User, invite.sender_id)
            if room and sender and sender.is_active:
                result.append({
                    "id": invite.id, "room_id": room.id, "room_name": room.name,
                    "sender_name": sender.nickname, "expires_at": invite.expires_at
                })
        return result

    @router.post("/invites/{invite_id}/accept")
    def accept_room_invitation(invite_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        invite = db.get(RoomInvitation, invite_id)
        if not invite or invite.recipient_id != user.id:
            raise HTTPException(status_code=404, detail="Davet bulunamadı")
        if invite.status != "pending" or invite.expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=409, detail="Davet artık geçerli değil")
        invite.status = "accepted"
        db.commit()
        return {"room_id": invite.room_id}

    @router.post("/invites/{invite_id}/reject")
    def reject_room_invitation(invite_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        invite = db.get(RoomInvitation, invite_id)
        if not invite or invite.recipient_id != user.id:
            raise HTTPException(status_code=404, detail="Davet bulunamadı")
        if invite.status != "pending":
            raise HTTPException(status_code=409, detail="Davet zaten yanıtlandı")
        invite.status = "rejected"
        db.commit()
        return {"rejected": True}

    @router.post("/{room_id}/invite", status_code=201)
    def invite_to_room(room_id: str, payload: RoomInvite, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        require_staff(db, room, user)
        target = db.get(User, payload.user_id)
        if not target: raise HTTPException(status_code=404, detail="Davet edilecek kullanıcı bulunamadı")
        if target.id == user.id: raise HTTPException(status_code=400, detail="Kendinize davet gönderemezsiniz")
        if is_member(db, room.id, target.id): raise HTTPException(status_code=409, detail="Kullanıcı zaten odada")
        db.add(Notification(user_id=target.id, kind="room_invite", title="Oda daveti", body=f"{room.name} odasına davet edildiniz."))
        db.commit()
        return {"invited": True, "room_id": room.id, "user_id": target.id}

    @router.post("/{room_id}/leave")
    def leave_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        db.execute(delete(RoomMember).where(RoomMember.room_id == room.id, RoomMember.user_id == user.id)); db.execute(delete(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id))
        remaining = int(db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id == room.id)) or 0)
        room.is_active = remaining > 0
        db.commit(); return {"left": True, "is_active": room.is_active}
    @router.post("/{room_id}/seats/{seat_number}/join")
    def join_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Önce odaya katılmalısınız")
        if seat_number < 1 or seat_number > LEVELS[room.level]["seats"]: raise HTTPException(status_code=400, detail="Bu seviyede bu koltuk yok")
        seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == seat_number))
        if not seat: raise HTTPException(status_code=404, detail="Koltuk bulunamadı")
        if seat.locked: raise HTTPException(status_code=409, detail="Bu koltuk kilitli")
        occupied = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id).with_for_update())
        if seat.user_id and seat.user_id != user.id: raise HTTPException(status_code=409, detail="Bu koltuk dolu")
        if occupied and occupied.id != seat.id:
            occupied.user_id = None
            occupied.muted = False
            db.flush()
        if seat.user_id != user.id:
            seat.muted = False
        seat.user_id = user.id; db.commit(); return {"seat_number": seat_number, "user_id": user.id}
    @router.delete("/{room_id}/seats/leave")
    def leave_seat(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); db.query(RoomSeat).filter(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id).update({"user_id": None, "muted": False}, synchronize_session=False); db.commit(); return {"left_seat": True}
    @router.patch("/{room_id}/theme")
    def set_theme(room_id: str, payload: RoomThemeUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        require_owner(db, room, user)
        theme = payload.theme.strip().lower()
        if theme not in {"normal", "vip"}:
            raise HTTPException(status_code=422, detail="Geçersiz oda teması")
        room.theme = theme
        db.commit()
        return {"theme": room.theme}

    @router.patch("/{room_id}/seats")
    def set_seat_count(room_id: str, payload: RoomSeatCountUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        require_staff(db, room, user)
        target = int(payload.seat_count)
        allowed = LEVELS[room.level]["seats"]
        if target not in {8, 12, 16} or target > allowed:
            raise HTTPException(status_code=422, detail=f"Bu oda seviyesinde en fazla {allowed} koltuk kullanılabilir")
        occupied = db.scalar(
            select(func.count(RoomSeat.id)).where(
                RoomSeat.room_id == room.id,
                RoomSeat.seat_number > target,
                RoomSeat.user_id.is_not(None)
            )
        ) or 0
        if occupied:
            raise HTTPException(status_code=409, detail="Kullanılan koltukları kapatamazsınız")
        db.query(RoomSeat).filter(
            RoomSeat.room_id == room.id,
            RoomSeat.seat_number > target
        ).delete(synchronize_session=False)
        for number in range(1, target + 1):
            if not db.scalar(select(RoomSeat.id).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == number)):
                db.add(RoomSeat(room_id=room.id, seat_number=number))
        room.seat_count = target
        db.commit()
        return {"seat_count": target}

    @router.patch("/{room_id}/chat")
    def set_chat(room_id: str, payload: RoomChatUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); room.chat_enabled = payload.enabled; db.commit(); return {"chat_enabled": room.chat_enabled}
    @router.put("/{room_id}/password")
    def set_room_password(room_id: str, payload: RoomPasswordUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        row = db.get(RoomPassword, room.id)
        hashed = hashlib.sha256(payload.password.encode()).hexdigest()
        if row: row.password_hash = hashed
        else: db.add(RoomPassword(room_id=room.id, password_hash=hashed))
        room.locked = True; room.lock_expires_at = datetime.now(timezone.utc) + timedelta(days=3650)
        db.commit()
        return {"locked": True, "password_set": True}

    @router.delete("/{room_id}/password")
    def clear_room_password(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        db.query(RoomPassword).filter(RoomPassword.room_id == room.id).delete(synchronize_session=False)
        room.locked = False; room.lock_expires_at = None; db.commit()
        return {"locked": False, "password_set": False}

    @router.get("/{room_id}/wallpaper")
    def get_room_wallpaper(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id) and room.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        view = room_view(db, room, user)
        return {"asset_key": view["wallpaper_owned_asset"], "asset_path": view["wallpaper_owned_asset_path"], "applied": view["wallpaper_applied"], "paid_until": view["wallpaper_expires_at"], "is_owner": room.owner_id == user.id,
                "prices": {1: 1000, 7: 5000, 30: 18000}, "items": wallpaper_catalog()}

    @router.post("/{room_id}/wallpaper")
    def buy_room_wallpaper(room_id: str, payload: RoomWallpaperUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        require_owner(db, room, user)
        item = find_wallpaper(payload.asset_key)
        if not item:
            raise HTTPException(status_code=404, detail="Duvar kağıdı bulunamadı")
        if item["tier"] == "vip":
            vip = db.get(VipStatus, user.id)
            if int(vip.level if vip else 0) < int(item["vip_level"]):
                raise HTTPException(status_code=403, detail=f"Oda duvar kağıdı için VIP {item['vip_level']} gerekli")
        price = {1: 1000, 7: 5000, 30: 18000}[payload.days]
        locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
        if not locked_user or int(locked_user.lidya or 0) < price:
            raise HTTPException(status_code=400, detail=f"Bu süre için {price:,} Lidya gerekli")
        now = datetime.now(timezone.utc)
        row = db.get(RoomWallpaper, room.id)
        locked_user.lidya -= price
        row_expiry = row.paid_until if row and row.paid_until.tzinfo else (row.paid_until.replace(tzinfo=timezone.utc) if row else None)
        expires_from = row_expiry if row and row.asset_key == payload.asset_key and row_expiry > now else now
        paid_until = expires_from + timedelta(days=payload.days)
        if row:
            row.asset_key = payload.asset_key
            row.paid_until = paid_until
        else:
            db.add(RoomWallpaper(room_id=room.id, asset_key=payload.asset_key, paid_until=paid_until))
        state = db.get(RoomWallpaperState, room.id)
        if state:
            state.applied = True
        else:
            db.add(RoomWallpaperState(room_id=room.id, applied=True))
        db.commit()
        return {"ok": True, "asset_key": payload.asset_key, "asset_path": item["asset"], "paid_until": paid_until, "spent": price, "days": payload.days}

    @router.post("/{room_id}/wallpaper/apply")
    def apply_room_wallpaper(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        require_owner(db, room, user)
        row = db.get(RoomWallpaper, room.id)
        expiry = row.paid_until if row and row.paid_until.tzinfo else (row.paid_until.replace(tzinfo=timezone.utc) if row else None)
        if not row or not expiry or expiry <= datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Uygulanabilir süreli oda duvar kâğıdı yok")
        state = db.get(RoomWallpaperState, room.id)
        if state:
            state.applied = True
        else:
            db.add(RoomWallpaperState(room_id=room.id, applied=True))
        db.commit()
        item = find_wallpaper(row.asset_key)
        return {"applied": True, "asset_key": row.asset_key, "asset_path": item["asset"] if item else None, "paid_until": row.paid_until}

    @router.delete("/{room_id}/wallpaper")
    def reset_room_wallpaper(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        require_owner(db, room, user)
        state = db.get(RoomWallpaperState, room.id)
        if not state:
            state = RoomWallpaperState(room_id=room.id, applied=False)
            db.add(state)
        else:
            state.applied = False
        db.commit()
        return {"applied": False, "asset_key": None}

    @router.post("/{room_id}/reports", status_code=201)
    def report_room(room_id: str, payload: RoomReportInput,
        db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id):
            raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        reason = payload.reason.strip()
        if not reason:
            raise HTTPException(status_code=400, detail="Şikâyet nedenini yazın")
        attachments = SupportCreate._attachments(payload.attachments)
        ticket = SupportTicket(
            user_id=user.id, category="room",
            subject=f"Oda şikâyeti: {room.name} (ID: {room.public_id})"[:120],
            message=reason, attachments_json=json.dumps(attachments),
        )
        db.add(ticket); db.commit(); db.refresh(ticket)
        record("support", "room_report_created", ticket_id=ticket.id,
               room_id=room.id, room_public_id=room.public_id, reporter_id=user.id)
        return {"id": ticket.id, "status": ticket.status}

    @router.get("/{room_id}/moderators")
    def list_moderators(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        require_staff(db, room, user)
        owner = db.get(User, room.owner_id)
        rows = [{"user_id": room.owner_id, "nickname": owner.nickname if owner else room.owner_id, "role": "owner"}]
        for moderator_id in db.scalars(select(RoomModerator.user_id).where(RoomModerator.room_id == room.id).order_by(RoomModerator.user_id)):
            moderator = db.get(User, moderator_id)
            rows.append({"user_id": moderator_id, "nickname": moderator.nickname if moderator else moderator_id, "role": "moderator"})
        return rows

    @router.get("/{room_id}/members")
    def list_members(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id):
            raise HTTPException(status_code=403, detail="Önce odaya katılmalısınız")
        moderator_ids = set(db.scalars(select(RoomModerator.user_id).where(RoomModerator.room_id == room.id)))
        seats = {seat.user_id: seat.seat_number for seat in db.scalars(
            select(RoomSeat).where(RoomSeat.room_id == room.id)) if seat.user_id}
        result = []
        for member in db.scalars(select(RoomMember).where(
            RoomMember.room_id == room.id).order_by(RoomMember.joined_at)):
            person = db.get(User, member.user_id)
            if person:
                result.append({
                    "user_id": member.user_id, "nickname": person.nickname,
                    "avatar": person.avatar, "avatar_asset": person.avatar_asset,
                    "role": "owner" if member.user_id == room.owner_id else (
                        "moderator" if member.user_id in moderator_ids else "user"),
                    "seat_number": seats.get(member.user_id),
                })
        return result
    @router.post("/{room_id}/moderators")
    def add_moderator(room_id: str, payload: ModeratorUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_owner(db, room, user)
        if payload.user_id == room.owner_id: raise HTTPException(status_code=400, detail="Oda sahibi moderatör olarak eklenemez")
        if not db.get(User, payload.user_id): raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        if db.scalar(select(RoomBan.id).where(RoomBan.room_id == room.id, RoomBan.user_id == payload.user_id)): raise HTTPException(status_code=409, detail="Atılmış kullanıcı moderatör olamaz")
        current = db.scalar(select(func.count(RoomModerator.id)).where(RoomModerator.room_id == room.id)) or 0
        if current >= LEVELS[room.level]["moderators"]: raise HTTPException(status_code=409, detail="Bu oda seviyesindeki moderatör sınırına ulaşıldı")
        if not db.scalar(select(RoomModerator.id).where(RoomModerator.room_id == room.id, RoomModerator.user_id == payload.user_id)): db.add(RoomModerator(room_id=room.id, user_id=payload.user_id)); db.commit()
        return room_view(db, room, user)
    @router.delete("/{room_id}/moderators/{moderator_id}")
    def remove_moderator(room_id: str, moderator_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_owner(db, room, user); db.execute(delete(RoomModerator).where(RoomModerator.room_id == room.id, RoomModerator.user_id == moderator_id)); db.commit(); return {"removed": True}
    @router.post("/{room_id}/bans")
    def add_ban(room_id: str, payload: BanUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        require_manageable_guest(db, room, user, payload.user_id)
        if not db.get(User, payload.user_id): raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        if not db.scalar(select(RoomBan.id).where(RoomBan.room_id == room.id, RoomBan.user_id == payload.user_id)):
            db.add(RoomBan(room_id=room.id, user_id=payload.user_id, banned_by=user.id)); db.execute(delete(RoomMember).where(RoomMember.room_id == room.id, RoomMember.user_id == payload.user_id)); db.execute(delete(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.user_id == payload.user_id)); db.execute(delete(RoomModerator).where(RoomModerator.room_id == room.id, RoomModerator.user_id == payload.user_id)); db.execute(delete(RoomChatMute).where(RoomChatMute.room_id == room.id, RoomChatMute.user_id == payload.user_id)); db.commit()
        return {"banned": True}
    @router.get("/{room_id}/bans")
    def list_bans(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        rows = list(db.scalars(select(RoomBan).where(RoomBan.room_id == room.id).order_by(RoomBan.id.desc())))
        result = []
        for ban in rows:
            banned_user = db.get(User, ban.user_id)
            result.append({"user_id": ban.user_id, "display_name": getattr(banned_user, "nickname", None) or ban.user_id, "banned_by": ban.banned_by})
        return result
    @router.delete("/{room_id}/bans/{banned_user_id}")
    def remove_ban(room_id: str, banned_user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); db.execute(delete(RoomBan).where(RoomBan.room_id == room.id, RoomBan.user_id == banned_user_id)); db.commit(); return {"removed": True}
    @router.get("/{room_id}/chat-mutes")
    def list_chat_mutes(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        result = []
        for row in db.scalars(select(RoomChatMute).where(
            RoomChatMute.room_id == room.id).order_by(RoomChatMute.created_at.desc())):
            target = db.get(User, row.user_id)
            result.append({"user_id": row.user_id, "nickname": target.nickname if target else row.user_id})
        return result

    @router.post("/{room_id}/chat-mutes/{target_id}")
    def mute_room_chat(room_id: str, target_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        require_manageable_guest(db, room, user, target_id)
        if not is_member(db, room.id, target_id):
            raise HTTPException(status_code=404, detail="Kullanıcı odada değil")
        if not db.scalar(select(RoomChatMute.id).where(
            RoomChatMute.room_id == room.id, RoomChatMute.user_id == target_id)):
            db.add(RoomChatMute(room_id=room.id, user_id=target_id, muted_by=user.id))
            db.commit()
        return {"muted": True}

    @router.delete("/{room_id}/chat-mutes/{target_id}")
    def unmute_room_chat(room_id: str, target_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        require_manageable_guest(db, room, user, target_id)
        db.execute(delete(RoomChatMute).where(
            RoomChatMute.room_id == room.id, RoomChatMute.user_id == target_id))
        db.commit()
        return {"muted": False}

    @router.post("/{room_id}/seats/{seat_number}/lock")
    def lock_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        if seat_number < 1 or seat_number > LEVELS[room.level]["seats"]: raise HTTPException(status_code=400, detail="Geçersiz koltuk")
        seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == seat_number))
        if not seat: raise HTTPException(status_code=404, detail="Koltuk bulunamadı")
        if seat.user_id: raise HTTPException(status_code=409, detail="Yalnızca boş koltuk kilitlenebilir")
        seat.locked = True; seat.muted = False; db.commit(); return {"locked": True}
    @router.delete("/{room_id}/seats/{seat_number}/lock")
    def unlock_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == seat_number))
        if not seat: raise HTTPException(status_code=404, detail="Koltuk bulunamadı")
        seat.locked = False; db.commit(); return {"locked": False}
    @router.post("/{room_id}/seats/{seat_number}/mute")
    def mute_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == seat_number))
        if not seat: raise HTTPException(status_code=404, detail="Koltuk bulunamadı")
        if not seat.user_id: raise HTTPException(status_code=409, detail="Koltukta kullanıcı yok")
        require_manageable_guest(db, room, user, seat.user_id)
        seat.muted = True; db.commit(); return {"muted": True}
    @router.delete("/{room_id}/seats/{seat_number}/mute")
    def unmute_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == seat_number))
        if not seat: raise HTTPException(status_code=404, detail="Koltuk bulunamadı")
        if seat.user_id: require_manageable_guest(db, room, user, seat.user_id)
        seat.muted = False; db.commit(); return {"muted": False}
    @router.post("/{room_id}/lock")
    def lock_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_owner(db, room, user); now = datetime.now(timezone.utc)
        if room.level >= 4: room.locked = True; room.lock_expires_at = None
        else:
            if user.lidya < 150: raise HTTPException(status_code=400, detail="Odayı kilitlemek için 150 Lidya gerekli")
            user.lidya -= 150; room.locked = True; room.lock_expires_at = now + timedelta(hours=24)
        db.commit(); return {"locked": True, "lock_expires_at": room.lock_expires_at}
    @router.delete("/{room_id}/lock")
    def unlock_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_owner(db, room, user); room.locked = False; room.lock_expires_at = None; db.commit(); return {"locked": False}
    @router.get("/{room_id}/rtc-config")
    def rtc_config(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id):
            raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        if db.scalar(select(RoomBan.id).where(RoomBan.room_id == room.id, RoomBan.user_id == user.id)):
            raise HTTPException(status_code=403, detail="Odaya erişiminiz yok")
        def seat_status():
            seat = db.scalar(select(RoomSeat).where(
                RoomSeat.room_id == room.id, RoomSeat.user_id == user.id
            ))
            return {
                "seat_number": seat.seat_number if seat else None,
                "muted": bool(seat.muted) if seat else False,
            }

        raw = os.getenv("ERIS_WEBRTC_ICE_SERVERS_JSON", "").strip()
        if raw:
            try: value = json.loads(raw)
            except json.JSONDecodeError: raise HTTPException(status_code=500, detail="WebRTC ICE yapılandırması geçersiz")
            if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
                raise HTTPException(status_code=500, detail="WebRTC ICE yapılandırması geçersiz")
            return {"ice_servers": value, **seat_status()}
        from .config import settings
        servers = [{"urls": ["stun:stun.l.google.com:19302"]}]
        turn_url = settings.rtc_turn_url or os.getenv("ERISCHAT_TURN_URL", "")
        turn_user = settings.rtc_turn_username or os.getenv("ERISCHAT_TURN_USERNAME", "")
        turn_password = settings.rtc_turn_credential or os.getenv("ERISCHAT_TURN_PASSWORD", "")
        if turn_url and turn_user and turn_password:
            servers.append({"urls":[turn_url],"username":turn_user,"credential":turn_password})
        return {"ice_servers": servers, **seat_status()}

    @router.post("/{room_id}/rtc-signals")
    def send_rtc_signal(room_id: str, payload: RTCSignal, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id):
            raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        if payload.target_id == user.id:
            raise HTTPException(status_code=400, detail="Sinyal hedefi gönderen kullanıcı olamaz")
        if not is_member(db, room.id, payload.target_id):
            raise HTTPException(status_code=404, detail="Sinyal hedefi odada değil")
        queue = _prune_rtc_signals(room.id)
        queue.append({"id": uuid4().hex, "ts": time.monotonic(), "sender_id": user.id, "target_id": payload.target_id, "type": payload.type, "payload": payload.payload})
        return {"queued": True}

    @router.get("/{room_id}/rtc-signals")
    def receive_rtc_signals(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id):
            raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        queue = _prune_rtc_signals(room.id)
        messages = [x for x in queue if x["target_id"] == user.id]
        if messages:
            ids = {x["id"] for x in messages}
            queue_copy = [x for x in queue if x["id"] not in ids]
            queue.clear()
            queue.extend(queue_copy)
        return [{"id":x["id"], "sender_id":x["sender_id"], "type":x["type"], "payload":x["payload"]} for x in messages]
    @router.post("/{room_id}/gifts")
    async def send_gift(room_id: str, payload: GiftSend, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        if not is_member(db, room.id, payload.recipient_id): raise HTTPException(status_code=404, detail="Hediye alıcısı odada değil")
        sender = db.scalar(select(User).where(User.id == user.id).with_for_update()); recipient = db.scalar(select(User).where(User.id == payload.recipient_id).with_for_update())
        if not sender: raise HTTPException(status_code=404, detail="Gönderen bulunamadı")
        if not recipient: raise HTTPException(status_code=404, detail="Alıcı bulunamadı")
        unit_price = GIFT_CATALOG.get(payload.gift_key)
        if unit_price is None: raise HTTPException(status_code=400, detail="Geçersiz hediye")
        total = unit_price * payload.quantity
        if sender.lidya < total: raise HTTPException(status_code=400, detail="Yeterli Lidya yok")
        recipient_amount = total * GIFT_RECIPIENT_PERCENT // 100; sender.lidya -= total; recipient.lidya += recipient_amount
        vip = db.get(VipStatus, sender.id)
        if not vip:
            vip = VipStatus(user_id=sender.id, level=0, total_spent=0)
            db.add(vip)
            db.flush()
        vip.total_spent = int(vip.total_spent or 0) + total
        vip.level = vip_level_from_spend(vip.total_spent)
        event = RoomGiftEvent(room_id=room.id, sender_id=sender.id, recipient_id=recipient.id, gift_key=payload.gift_key, unit_price=unit_price, quantity=payload.quantity, total_price=total, recipient_percent=GIFT_RECIPIENT_PERCENT, recipient_amount=recipient_amount)
        presentation = gift_presentation(unit_price)
        db.add(event); db.add(Notification(user_id=recipient.id, kind="gift", title="Yeni hediye", body=f"{sender.nickname} size {payload.gift_key} gönderdi.")); db.commit(); db.refresh(event); refresh_level(db, room)
        from .main import _broadcast_room_chat, _broadcast_global_gift_announcement
        room_payload = {"type":"room_gift","id":event.id,"room_id":room.id,"sender_id":sender.id,"recipient_id":recipient.id,"sender_nickname":sender.nickname,"recipient_nickname":recipient.nickname,"gift_key":event.gift_key,"quantity":event.quantity,"total_price":event.total_price,"recipient_amount":event.recipient_amount,"created_at":event.created_at.isoformat() if event.created_at else None, **presentation, **gift_visual(event.gift_key), "id": event.id}
        await _broadcast_room_chat(room.id, room_payload)
        await _broadcast_room_chat(room.id, {"type":"room_chat","room_id":room.id,"user_id":sender.id,"nickname":sender.nickname,"text":f"{sender.nickname}, {recipient.nickname} adlı kişiye {event.gift_key} verdi.","system":True,"created_at":event.created_at.isoformat() if event.created_at else None})
        if presentation["global_announcement"]:
            await _broadcast_global_gift_announcement({**room_payload,"room_name":room.name,"room_public_id":room.public_id})
        return {"gift_key":payload.gift_key,"quantity":payload.quantity,"unit_price":unit_price,"total_price":total,"recipient_percent":GIFT_RECIPIENT_PERCENT,"recipient_amount":recipient_amount,**presentation}
    @router.get("/{room_id}/gift-catalog")
    def gift_catalog(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        return [{"gift_key": key, "unit_price": price, **gift_presentation(price), **gift_visual(key)} for key, price in GIFT_CATALOG.items()]
    @router.get("/{room_id}/gift-events")
    def gift_events(room_id: str, limit: int = 50, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        limit = max(1, min(limit, 100)); rows = list(db.scalars(select(RoomGiftEvent).where(RoomGiftEvent.room_id == room.id).order_by(RoomGiftEvent.created_at.desc()).limit(limit))); rows.reverse()
        return [{"id":row.id,"sender_id":row.sender_id,"recipient_id":row.recipient_id,"gift_key":row.gift_key,"unit_price":row.unit_price,"quantity":row.quantity,"total_price":row.total_price,"recipient_percent":row.recipient_percent,"recipient_amount":row.recipient_amount,"created_at":row.created_at,**gift_presentation(row.unit_price), **gift_visual(row.gift_key), "id": row.id} for row in rows]
    @router.get("/{room_id}/gift-leaderboard")
    def gift_leaderboard(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        rows = db.execute(select(RoomGiftEvent.sender_id, func.sum(RoomGiftEvent.total_price).label("total")).where(RoomGiftEvent.room_id == room.id).group_by(RoomGiftEvent.sender_id).order_by(func.sum(RoomGiftEvent.total_price).desc())).all()
        return [{"rank":i,"user_id":uid,"total_lidya":int(total or 0)} for i,(uid,total) in enumerate(rows,1)]
    @router.get("/music-access/status")
    def music_access_status(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = db.get(RoomMusicAccess, user.id)
        now = datetime.now(timezone.utc)
        expiry = row.expires_at if row and row.expires_at.tzinfo else (
            row.expires_at.replace(tzinfo=timezone.utc) if row else None
        )
        return {"active": bool(expiry and expiry > now), "expires_at": expiry, "price": 150}

    @router.post("/music-access/activate")
    def activate_music_access(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
        if not locked_user:
            raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")
        now = datetime.now(timezone.utc)
        row = db.get(RoomMusicAccess, user.id)
        expiry = row.expires_at if row and row.expires_at.tzinfo else (
            row.expires_at.replace(tzinfo=timezone.utc) if row else None
        )
        if expiry and expiry > now:
            return {"active": True, "expires_at": expiry, "spent": 0}
        if int(locked_user.lidya or 0) < 150:
            raise HTTPException(status_code=400, detail="24 saatlik müzik erişimi için 150 Lidya gerekli")
        locked_user.lidya -= 150
        expiry = now + timedelta(hours=24)
        if row:
            row.expires_at = expiry
        else:
            db.add(RoomMusicAccess(user_id=user.id, expires_at=expiry))
        db.commit()
        return {"active": True, "expires_at": expiry, "spent": 150}

    @router.post("/{room_id}/music")
    async def add_music(room_id: str, file: UploadFile = File(...), title: str = Form(""), db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        access_row = db.get(RoomMusicAccess, user.id)
        now = datetime.now(timezone.utc)
        access_expiry = access_row.expires_at if access_row and access_row.expires_at.tzinfo else (
            access_row.expires_at.replace(tzinfo=timezone.utc) if access_row else None
        )
        if not access_expiry or access_expiry <= now:
            raise HTTPException(status_code=403, detail="Önce 150 Lidya ile 24 saatlik müzik erişimi aç")

        # Only bounded audio is retained; never fetch user-supplied URLs on the server.
        data = await file.read(8 * 1024 * 1024 + 1)
        await file.close()
        if len(data) > 8 * 1024 * 1024 or len(data) < 32:
            raise HTTPException(status_code=413, detail="Müzik 8 MB sınırını aşamaz")
        mime = None
        if data.startswith(b"ID3") or (data[0] == 0xff and data[1] & 0xe0 == 0xe0): mime = "audio/mpeg"
        elif data.startswith(b"OggS"): mime = "audio/ogg"
        elif data.startswith(b"fLaC"): mime = "audio/flac"
        elif data.startswith(b"RIFF") and data[8:12] == b"WAVE": mime = "audio/wav"
        elif data[4:8] == b"ftyp" and data[8:12] in {b"M4A ", b"isom", b"mp42", b"mp41"}: mime = "audio/mp4"
        if not mime:
            raise HTTPException(status_code=415, detail="MP3, M4A, OGG, FLAC veya WAV müzik seçin")
        track_title = (title.strip() or file.filename or "Müzik")[:128]
        # Aynı kullanıcının paralel isteklerinde hem slot hem Lidya bakiyesi atomik korunmalı.
        locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
        if not locked_user:
            raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")
        used_slots = set(db.scalars(select(RoomMusic.slot).where(RoomMusic.room_id == room.id, RoomMusic.user_id == locked_user.id)))
        slot = next((number for number in range(1, 11) if number not in used_slots), None)
        if slot is None or len(used_slots) >= 10: raise HTTPException(status_code=409, detail="En fazla 10 müzik ekleyebilirsiniz")
        music = RoomMusic(room_id=room.id, user_id=locked_user.id, slot=slot, title=track_title, source_url="", audio_bytes=data, audio_mime=mime, paid_until=access_expiry)
        db.add(music)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=409, detail="Müzik kuyruğu isteği eşzamanlı olarak işlendi; tekrar deneyin")
        db.refresh(music)
        return {"id":music.id,"slot":music.slot,"title":music.title,"audio_url":f"/rooms/{room.id}/music/{music.id}/audio","paid_until":music.paid_until}
    @router.get("/{room_id}/music/{music_id}/audio")
    def music_audio(room_id: str, music_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        music = db.scalar(select(RoomMusic).where(RoomMusic.id == music_id, RoomMusic.room_id == room.id))
        if not music or not music.audio_bytes: raise HTTPException(status_code=404, detail="Müzik dosyası bulunamadı")
        return Response(content=music.audio_bytes, media_type=music.audio_mime or "application/octet-stream", headers={"Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff"})
    @router.delete("/{room_id}/music/{music_id}")
    def delete_music(room_id: str, music_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); music = db.scalar(select(RoomMusic).where(RoomMusic.id == music_id, RoomMusic.room_id == room.id))
        if not music: raise HTTPException(status_code=404, detail="Müzik bulunamadı")
        if music.user_id != user.id:
            require_staff(db, room, user)
        db.delete(music); db.commit(); return {"deleted":True}
    @router.post("/{room_id}/music/{music_id}/playback")
    def update_music_playback(room_id: str, music_id: int, payload: MusicPlaybackUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id):
            raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        if not db.scalar(select(RoomSeat.id).where(
            RoomSeat.room_id == room.id, RoomSeat.user_id == user.id)):
            raise HTTPException(status_code=403, detail="Müzik oynatmak için koltuğa oturun")
        music = db.scalar(select(RoomMusic).where(RoomMusic.id == music_id, RoomMusic.room_id == room.id))
        if not music:
            raise HTTPException(status_code=404, detail="Müzik bulunamadı")
        if not music.audio_bytes:
            raise HTTPException(status_code=409, detail="Eski URL kaydını telefondan yeniden yükleyin")
        if music.user_id != user.id:
            require_staff(db, room, user)
        action = payload.playback_action
        if action not in {"play", "pause", "stop", "seek"}:
            raise HTTPException(status_code=400, detail="Geçersiz müzik oynatma işlemi")
        now = datetime.now(timezone.utc)
        if action == "seek":
            music.position_seconds = payload.position_seconds
            if music.is_playing:
                music.started_at = now
        elif action == "play":
            # A room has a single canonical active track. Pause any other
            # currently playing queue item before starting this one.
            active_rows = db.scalars(
                select(RoomMusic).where(
                    RoomMusic.room_id == room.id,
                    RoomMusic.id != music.id,
                    RoomMusic.is_playing.is_(True),
                ).with_for_update()
            ).all()
            for active in active_rows:
                if active.started_at:
                    active.position_seconds += max(0, int((now - active.started_at).total_seconds()))
                active.is_playing = False
                active.started_at = None
                active.updated_at = now
            music.position_seconds = payload.position_seconds
            music.is_playing = True
            music.started_at = now
        elif action == "pause":
            if music.is_playing and music.started_at:
                music.position_seconds += max(0, int((now - music.started_at).total_seconds()))
            music.is_playing = False
            music.started_at = None
        else:
            music.is_playing = False
            music.position_seconds = 0
            music.started_at = None
        music.updated_at = now
        db.commit()
        db.refresh(music)
        return {"id": music.id, "slot": music.slot, "title": music.title, "source_url": music.source_url,
                "position_seconds": music.position_seconds, "is_playing": music.is_playing,
                "started_at": music.started_at, "updated_at": music.updated_at}

    @router.get("/{room_id}/music")
    def list_music(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        return [{"id":m.id,"user_id":m.user_id,"slot":m.slot,"title":m.title,"audio_url":f"/rooms/{room.id}/music/{m.id}/audio" if m.audio_bytes else None,"needs_reupload":not bool(m.audio_bytes),"paid_until":m.paid_until,"is_playing":m.is_playing and bool(m.audio_bytes),"position_seconds":m.position_seconds,"started_at":m.started_at} for m in db.scalars(select(RoomMusic).where(RoomMusic.room_id == room.id).order_by(RoomMusic.slot))]
