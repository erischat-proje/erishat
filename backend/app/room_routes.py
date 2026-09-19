from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4
import json
import os
from collections import defaultdict, deque
from typing import Literal
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .room_models import Room, RoomBan, RoomGiftEvent, RoomMember, RoomModerator, RoomMusic, RoomSeat
from .platform_models import Notification, VipStatus
from .platform_routes import vip_level_from_spend
from .admin_models import AdminRole, RoomAdminBan, UserBan
from .system_data import RoomIdRegistry
from .system_logs import record

router = APIRouter(prefix="/v1/rooms", tags=["rooms"])

LEVELS = {1: {"capacity": 35, "moderators": 2, "seats": 8, "required_spend": 0}, 2: {"capacity": 45, "moderators": 3, "seats": 8, "required_spend": 220_000}, 3: {"capacity": 55, "moderators": 4, "seats": 8, "required_spend": 410_000}, 4: {"capacity": 65, "moderators": 5, "seats": 8, "required_spend": 630_000}, 5: {"capacity": 75, "moderators": 6, "seats": 12, "required_spend": 840_000}, 6: {"capacity": 85, "moderators": 8, "seats": 12, "required_spend": 1_000_000}, 7: {"capacity": 95, "moderators": 10, "seats": 16, "required_spend": 1_240_000}, 8: {"capacity": 105, "moderators": 12, "seats": 16, "required_spend": 1_560_000}}
GIFT_RECIPIENT_PERCENT = 70
GIFT_CATALOG = {
  "Zeytin Dalı": 1,
  "Kil Çanak": 2,
  "Ekmek Lavaş": 3,
  "Kuru İncir": 4,
  "Topaç": 5,
  "Taş Bebek": 6,
  "Ahşap Kaşık": 7,
  "Kenevir İp": 8,
  "Hasır Sepet": 9,
  "Meşe Palamudu": 10,
  "Deniz Kabuğu": 11,
  "Tohum Kesesi": 12,
  "Bakır Çivi": 14,
  "Nazar Boncuğu": 15,
  "Yün Yumak": 16,
  "Çakmak Taşı": 18,
  "Kurutulmuş Balık": 20,
  "Kil Düdük": 21,
  "Kırmızı Kurdele": 22,
  "Eski Parşömen": 23,
  "Küçük Çakıl": 25,
  "Keçi Sütü": 26,
  "Zencefil Kökü": 27,
  "Toprak Bardak": 28,
  "Sokak Çiçeği": 29,
  "Keçi Peyniri": 33,
  "Üzüm Salkımı": 36,
  "Kil Kase Şarap": 40,
  "Bal ve Ekmek": 44,
  "Zeytinyağı Şişesi": 48,
  "Nar Suyu": 52,
  "Kavrulmuş Nohut": 56,
  "İncir Reçeli": 60,
  "Tuzlu Balık": 64,
  "Közde Mısır": 68,
  "Ekşi Elma": 72,
  "Ceviz İçi": 76,
  "Kekik Çayı": 80,
  "Mantar Sote": 83,
  "Kuru Üzüm": 87,
  "Pide Ekmeği": 91,
  "Koyun Yoğurdu": 94,
  "Baharat Karışımı": 96,
  "Susamlı Gevrek": 98,
  "Antik Çörek": 99,
  "Deri Sandalet": 121,
  "Keten Kumaş": 142,
  "Tunç Broş": 163,
  "Bakır Ayna": 184,
  "Göz Alıcı Kemer": 205,
  "Demir Çekiç": 226,
  "Seramik Testi": 247,
  "Ahşap Sandık": 268,
  "Yün Cübbe": 289,
  "İşlemeli Örtü": 310,
  "Kemik Tarak": 331,
  "Maden Kepçe": 352,
  "Deri Eldiven": 373,
  "Şamdan": 394,
  "Gümüş İğne": 415,
  "Tunç Bıçak": 436,
  "Kemer Tokası": 457,
  "Terazi": 478,
  "Fener": 489,
  "Mühür Yüzüğü": 499,
  "Tunç Mızrak": 526,
  "Meşale": 552,
  "Deri Kalkan": 578,
  "Antik Yay": 605,
  "Ok Kutusu": 631,
  "Zırh Gömleği": 657,
  "Demir Miğfer": 684,
  "Savaş Baltası": 710,
  "Hançer": 736,
  "Binici Kamçısı": 763,
  "Nöbet Çanı": 789,
  "Gözcü Dürbünü": 815,
  "Bronz Sopa": 842,
  "Ateş Çanağı": 868,
  "Sancak": 894,
  "Bıçak Kını": 921,
  "Zırh Eldiveni": 947,
  "Çelik Çizme": 973,
  "Taktik Haritası": 986,
  "Savaş Borusu": 999,
  "İpek Şal": 1000,
  "Parfüm Şişesi": 1374,
  "Gümüş Kase": 1749,
  "Bronz Heykelcik": 2124,
  "Altın Kaplama Vazo": 2499,
  "Mücevher Kutusu": 2874,
  "Kadife Kumaş": 3249,
  "Kıymetli Baharat": 3624,
  "Fildişi Tarak": 3999,
  "Renkli Cam Sürahi": 4374,
  "İncir Ağacı Oyması": 4749,
  "Sedef Sandık": 5124,
  "Şam Kumaşı": 5499,
  "Bronz Şamdan": 5874,
  "Lapis Lazuli Taş": 6249,
  "Kehribar Kolye": 6624,
  "Gümüş Tepsi": 6999,
  "Kristal Karaf": 7374,
  "Parşömen Rulosu": 7749,
  "Antik Vazo": 8124,
  "Mermer Kase": 8499,
  "Yaldızlı Kupa": 8874,
  "Mücevherli Kemer": 9249,
  "Bakır Heykel": 9624,
  "Özel Dokuma Halı": 9999,
  "Altın Gerdanlık": 10000,
  "Yakut Küpe": 10526,
  "Kraliyet Çelengi": 11052,
  "Safir Yüzük": 11578,
  "Zümrüt Broş": 12105,
  "Elmas Tacı": 12631,
  "Altın Bilezik": 13157,
  "İnci Gerdanlık": 13684,
  "Kraliyet Mührü": 14210,
  "Gümüş Kılıç": 14736,
  "Altın Kase": 15263,
  "Değerli Taş": 15789,
  "Kraliyet Arması": 16315,
  "Gümüş Taht": 16842,
  "Altın Şamdan": 17368,
  "Safir Gerdanlık": 17894,
  "Kraliyet Kaftanı": 18421,
  "Elmas Broş": 18947,
  "Altın Kemer": 19473,
  "Mücevherli Taç": 19999,
  "Savaş Arabası": 20000,
  "Akdeniz Gemisi": 21249,
  "Mermer Köşk": 22499,
  "Saray Bahçesi": 23749,
  "Altın Taht": 24999,
  "Büyük Çeşme": 26249,
  "Mermer Sütun": 27499,
  "Antik Heykel": 28749,
  "Mozaik Zemin": 29999,
  "Bronz Kapı": 31249,
  "Özel At Ahırı": 32499,
  "Gözlemevi Kulesi": 33749,
  "Zafer Takı": 34999,
  "Mermer Havuz": 36249,
  "Hükümdar Çadırı": 37499,
  "Lüks Yat": 38749,
  "Heybetli Sütun": 39999,
  "İhtişamlı Kemer": 41249,
  "Büyük Saray Salonu": 42499,
  "Kraliyet Çiftliği": 43749,
  "Antik Amfi": 44999,
  "Mermer Merdiven": 46249,
  "Özel Kütüphane": 47499,
  "Şölen Sofrası": 48749,
  "Anıtsal Heykel": 49999,
  "Zeus Yıldırımı": 50000,
  "Pegasus Kanadı": 52105,
  "Altın Post": 54210,
  "Apollon Liri": 56315,
  "Athena Kalkanı": 58421,
  "Poseidon Üçlüsü": 60526,
  "Ares Kılıcı": 62631,
  "Hermes Sandaleti": 64736,
  "Hades Miğferi": 66842,
  "Afrodit Aynası": 68947,
  "Dionysos Asası": 71052,
  "Artemis Oku": 73157,
  "Demeter Başak": 75263,
  "Chronos Saati": 77368,
  "Prometheus Ateşi": 79473,
  "Medusa Gözü": 81578,
  "Hydra Dişi": 83684,
  "Minotaur Boynuzu": 85789,
  "Sphinx Kanadı": 87894,
  "Titan Çekici": 89999,
  "Paktolos Altını": 90000,
  "Krezus Mührü": 90416,
  "Lidya Tahtı": 90833,
  "İlk Altın Sikke": 91250,
  "Sardis Tacı": 91666,
  "Kraliyet Hazinesi": 92083,
  "Ebedi Meşale": 92500,
  "Altın Nehir Heykeli": 92916,
  "Krezus’un Zırhı": 93333,
  "Sonsuzluk Çanağı": 93750,
  "Antik İmparatorluk Tacı": 94166,
  "Kraliyet Asası": 94583,
  "Mitolojik Güneş Kursu": 95000,
  "Krezus'un Kasesi": 95416,
  "Lidya Saray Anahtarı": 95833,
  "Altın Kartal Heykeli": 96250,
  "Büyük Sardis Simgesi": 96666,
  "Ebedi Kalkan": 97083,
  "Kraliyet Yüzüğü": 97500,
  "Sardis'in Zirvesi": 97916,
  "Paktolos İncisi": 98333,
  "Krezus'un Kılıcı": 98750,
  "Lidya Ebedi Tahtı": 99166,
  "Altın Başak": 99583,
  "Sardis'in Kalbi": 100000
}

class RoomCreate(BaseModel): name: str = Field(min_length=1, max_length=16)
class RoomChatUpdate(BaseModel): enabled: bool
class RoomNameUpdate(BaseModel): name: str = Field(min_length=1, max_length=16)
class ModeratorUpdate(BaseModel): user_id: str = Field(min_length=1, max_length=64)
class BanUpdate(BaseModel): user_id: str = Field(min_length=1, max_length=64)
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

def is_member(db: Session, room_id: str, user_id: str) -> bool:
    return bool(db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)))

def ensure_seats(db: Session, room: Room) -> None:
    count = db.scalar(select(func.count(RoomSeat.id)).where(RoomSeat.room_id == room.id)) or 0
    target = LEVELS[room.level]["seats"]
    if count >= target: return
    for number in range(1, target + 1):
        if not db.scalar(select(RoomSeat.id).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == number)): db.add(RoomSeat(room_id=room.id, seat_number=number))
    db.commit()

def room_view(db: Session, room: Room) -> dict:
    ensure_seats(db, room)
    spend = db.scalar(select(func.coalesce(func.sum(RoomGiftEvent.total_price), 0)).where(RoomGiftEvent.room_id == room.id)) or 0
    members = db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id == room.id)) or 0
    moderators = list(db.scalars(select(RoomModerator.user_id).where(RoomModerator.room_id == room.id)))
    seats = list(db.scalars(select(RoomSeat).where(RoomSeat.room_id == room.id).order_by(RoomSeat.seat_number)))
    return {"id": room.id, "public_id": room.public_id, "name": room.name, "owner_id": room.owner_id, "level": room.level, "capacity": LEVELS[room.level]["capacity"], "max_moderators": LEVELS[room.level]["moderators"], "seat_count": LEVELS[room.level]["seats"], "chat_enabled": room.chat_enabled, "locked": bool(room.locked and (room.lock_expires_at is None or room.lock_expires_at > datetime.now(timezone.utc))), "lock_expires_at": room.lock_expires_at, "member_count": members, "spent_lidya": int(spend), "moderators": moderators, "seats": [{"seat_number": s.seat_number, "user_id": s.user_id, "locked": s.locked, "muted": s.muted} for s in seats]}

@router.post("", status_code=201)
def create_room_placeholder(payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(lambda: None)):
    raise HTTPException(status_code=500, detail="room auth dependency not configured")

def register_room_auth(current_user_dependency):
    router.dependencies.clear()
    for route in list(router.routes):
        if getattr(route, "path", None) == "/v1/rooms" and getattr(route, "methods", set()) == {"POST"}: router.routes.remove(route)
    @router.post("", status_code=201)
    def create_room(payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        name = payload.name.strip()
        if not name: raise HTTPException(status_code=400, detail="Oda adı boş olamaz")
        if len(name) > 16: raise HTTPException(status_code=422, detail="Oda adı en fazla 16 karakter olabilir")
        room = Room(id="room_" + uuid4().hex, public_id=generate_room_public_id(db), owner_id=user.id, name=name)
        db.add(room); db.flush()
        db.add(RoomIdRegistry(room_id=room.id, public_id=room.public_id))
        db.add(RoomMember(room_id=room.id, user_id=user.id))
        ensure_seats(db, room); db.commit(); db.refresh(room)
        record("room_id", "room_public_id_created", room_id=room.id, public_id=room.public_id, owner_id=user.id, owner_nickname=user.nickname)
        return room_view(db, room)
    @router.get("")
    def list_rooms(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)): return [room_view(db, room) for room in db.scalars(select(Room).order_by(Room.created_at.desc()))]
    @router.get("/{room_id}")
    def get_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)): return room_view(db, get_room_or_404(db, room_id))
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
        return room_view(db, room)
    @router.post("/{room_id}/join")
    def join_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if db.scalar(select(RoomBan.id).where(RoomBan.room_id == room.id, RoomBan.user_id == user.id)): raise HTTPException(status_code=403, detail="Bu odadan atıldınız")
        admin = db.get(AdminRole, user.id)
        admin_mode = bool(admin and admin.role in {"SA", "UA", "DA"})
        active_admin_ban = db.scalar(select(RoomAdminBan).where(RoomAdminBan.room_id == room.id, RoomAdminBan.active.is_(True), (RoomAdminBan.expires_at.is_(None)) | (RoomAdminBan.expires_at > datetime.now(timezone.utc))))
        if active_admin_ban and not admin_mode: raise HTTPException(status_code=403, detail="Oda yönetim tarafından yasaklandı")
        active_user_ban = db.scalar(select(UserBan).where(UserBan.user_id == user.id, UserBan.active.is_(True), (UserBan.expires_at.is_(None)) | (UserBan.expires_at > datetime.now(timezone.utc))))
        if active_user_ban and not admin_mode: raise HTTPException(status_code=403, detail="Hesabınız yasaklı")
        if room.locked and room.lock_expires_at and room.lock_expires_at > datetime.now(timezone.utc) and room.owner_id != user.id and not admin_mode: raise HTTPException(status_code=403, detail="Oda kilitli")
        if not is_member(db, room.id, user.id):
            count = db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id == room.id)) or 0
            if count >= LEVELS[room.level]["capacity"]: raise HTTPException(status_code=409, detail="Oda dolu")
            db.add(RoomMember(room_id=room.id, user_id=user.id)); db.commit()
        return room_view(db, room)
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
        if room.owner_id == user.id: raise HTTPException(status_code=400, detail="Oda sahibi odadan ayrılamaz; odayı kapatmalıdır")
        db.execute(delete(RoomMember).where(RoomMember.room_id == room.id, RoomMember.user_id == user.id)); db.execute(delete(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id)); db.commit(); return {"left": True}
    @router.post("/{room_id}/seats/{seat_number}/join")
    def join_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Önce odaya katılmalısınız")
        if seat_number < 1 or seat_number > LEVELS[room.level]["seats"]: raise HTTPException(status_code=400, detail="Bu seviyede bu koltuk yok")
        seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == seat_number))
        if not seat: raise HTTPException(status_code=404, detail="Koltuk bulunamadı")
        if seat.locked: raise HTTPException(status_code=409, detail="Bu koltuk kilitli")
        occupied = db.scalar(select(RoomSeat.id).where(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id))
        if occupied and occupied != seat.id: raise HTTPException(status_code=409, detail="Zaten başka bir koltuktasınız")
        if seat.user_id and seat.user_id != user.id: raise HTTPException(status_code=409, detail="Bu koltuk dolu")
        seat.user_id = user.id; db.commit(); return {"seat_number": seat_number, "user_id": user.id}
    @router.delete("/{room_id}/seats/leave")
    def leave_seat(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); db.query(RoomSeat).filter(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id).update({"user_id": None}, synchronize_session=False); db.commit(); return {"left_seat": True}
    @router.patch("/{room_id}/chat")
    def set_chat(room_id: str, payload: RoomChatUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); room.chat_enabled = payload.enabled; db.commit(); return {"chat_enabled": room.chat_enabled}
    @router.get("/{room_id}/moderators")
    def list_moderators(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id):
            raise HTTPException(status_code=403, detail="Önce odaya katılmalısınız")
        return [{"user_id": user_id} for user_id in db.scalars(select(RoomModerator.user_id).where(RoomModerator.room_id == room.id).order_by(RoomModerator.user_id))]
    @router.post("/{room_id}/moderators")
    def add_moderator(room_id: str, payload: ModeratorUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_owner(db, room, user)
        if payload.user_id == room.owner_id: raise HTTPException(status_code=400, detail="Oda sahibi moderatör olarak eklenemez")
        if not db.get(User, payload.user_id): raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        if db.scalar(select(RoomBan.id).where(RoomBan.room_id == room.id, RoomBan.user_id == payload.user_id)): raise HTTPException(status_code=409, detail="Atılmış kullanıcı moderatör olamaz")
        current = db.scalar(select(func.count(RoomModerator.id)).where(RoomModerator.room_id == room.id)) or 0
        if current >= LEVELS[room.level]["moderators"]: raise HTTPException(status_code=409, detail="Bu oda seviyesindeki moderatör sınırına ulaşıldı")
        if not db.scalar(select(RoomModerator.id).where(RoomModerator.room_id == room.id, RoomModerator.user_id == payload.user_id)): db.add(RoomModerator(room_id=room.id, user_id=payload.user_id)); db.commit()
        return room_view(db, room)
    @router.delete("/{room_id}/moderators/{moderator_id}")
    def remove_moderator(room_id: str, moderator_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_owner(db, room, user); db.execute(delete(RoomModerator).where(RoomModerator.room_id == room.id, RoomModerator.user_id == moderator_id)); db.commit(); return {"removed": True}
    @router.post("/{room_id}/bans")
    def add_ban(room_id: str, payload: BanUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        if payload.user_id == room.owner_id: raise HTTPException(status_code=400, detail="Oda sahibi atılamaz")
        if not db.get(User, payload.user_id): raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        if not db.scalar(select(RoomBan.id).where(RoomBan.room_id == room.id, RoomBan.user_id == payload.user_id)):
            db.add(RoomBan(room_id=room.id, user_id=payload.user_id, banned_by=user.id)); db.execute(delete(RoomMember).where(RoomMember.room_id == room.id, RoomMember.user_id == payload.user_id)); db.execute(delete(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.user_id == payload.user_id)); db.execute(delete(RoomModerator).where(RoomModerator.room_id == room.id, RoomModerator.user_id == payload.user_id)); db.commit()
        return {"banned": True}
    @router.get("/{room_id}/bans")
    def list_bans(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        rows = list(db.scalars(select(RoomBan).where(RoomBan.room_id == room.id).order_by(RoomBan.id.desc())))
        result = []
        for ban in rows:
            banned_user = db.get(User, ban.user_id)
            result.append({"user_id": ban.user_id, "display_name": getattr(banned_user, "display_name", None) or getattr(banned_user, "username", None) or ban.user_id, "banned_by": ban.banned_by})
        return result
    @router.delete("/{room_id}/bans/{banned_user_id}")
    def remove_ban(room_id: str, banned_user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); db.execute(delete(RoomBan).where(RoomBan.room_id == room.id, RoomBan.user_id == banned_user_id)); db.commit(); return {"removed": True}
    @router.post("/{room_id}/seats/{seat_number}/lock")
    def lock_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        if seat_number < 1 or seat_number > LEVELS[room.level]["seats"]: raise HTTPException(status_code=400, detail="Geçersiz koltuk")
        seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == seat_number))
        if not seat: raise HTTPException(status_code=404, detail="Koltuk bulunamadı")
        seat.locked = True; seat.user_id = None; db.commit(); return {"locked": True}
    @router.delete("/{room_id}/seats/{seat_number}/lock")
    def unlock_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == seat_number))
        if not seat: raise HTTPException(status_code=404, detail="Koltuk bulunamadı")
        seat.locked = False; db.commit(); return {"locked": False}
    @router.post("/{room_id}/seats/{seat_number}/mute")
    def mute_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == seat_number))
        if not seat: raise HTTPException(status_code=404, detail="Koltuk bulunamadı")
        seat.muted = True; db.commit(); return {"muted": True}
    @router.delete("/{room_id}/seats/{seat_number}/mute")
    def unmute_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == seat_number))
        if not seat: raise HTTPException(status_code=404, detail="Koltuk bulunamadı")
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
        raw = os.getenv("ERIS_WEBRTC_ICE_SERVERS_JSON", "").strip()
        if not raw:
            return {"ice_servers": []}
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="WebRTC ICE yapılandırması geçersiz")
        if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
            raise HTTPException(status_code=500, detail="WebRTC ICE yapılandırması geçersiz")
        return {"ice_servers": value}

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
        presentation = gift_presentation(total)
        db.add(event); db.add(Notification(user_id=recipient.id, kind="gift", title="Yeni hediye", body=f"{sender.nickname} size {payload.gift_key} gönderdi.")); db.commit(); db.refresh(event); refresh_level(db, room)
        from .main import _broadcast_room_chat, _broadcast_global_gift_announcement
        room_payload = {"type":"room_gift","id":event.id,"room_id":room.id,"sender_id":sender.id,"recipient_id":recipient.id,"sender_nickname":sender.nickname,"recipient_nickname":recipient.nickname,"gift_key":event.gift_key,"quantity":event.quantity,"total_price":event.total_price,"recipient_amount":event.recipient_amount,"created_at":event.created_at.isoformat() if event.created_at else None, **presentation}
        await _broadcast_room_chat(room.id, room_payload)
        await _broadcast_room_chat(room.id, {"type":"room_chat","room_id":room.id,"user_id":sender.id,"nickname":sender.nickname,"text":f"{sender.nickname}, {recipient.nickname} adlı kişiye {event.gift_key} verdi.","system":True,"created_at":event.created_at.isoformat() if event.created_at else None})
        if presentation["global_announcement"]:
            await _broadcast_global_gift_announcement({**room_payload,"room_name":room.name,"room_public_id":room.public_id})
        return {"gift_key":payload.gift_key,"quantity":payload.quantity,"unit_price":unit_price,"total_price":total,"recipient_percent":GIFT_RECIPIENT_PERCENT,"recipient_amount":recipient_amount,**presentation}
    @router.get("/{room_id}/gift-catalog")
    def gift_catalog(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        return [{"gift_key": key, "unit_price": price, **gift_presentation(price)} for key, price in GIFT_CATALOG.items()]
    @router.get("/{room_id}/gift-events")
    def gift_events(room_id: str, limit: int = 50, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        limit = max(1, min(limit, 100)); rows = list(db.scalars(select(RoomGiftEvent).where(RoomGiftEvent.room_id == room.id).order_by(RoomGiftEvent.created_at.desc()).limit(limit))); rows.reverse()
        return [{"id":row.id,"sender_id":row.sender_id,"recipient_id":row.recipient_id,"gift_key":row.gift_key,"unit_price":row.unit_price,"quantity":row.quantity,"total_price":row.total_price,"recipient_percent":row.recipient_percent,"recipient_amount":row.recipient_amount,"created_at":row.created_at,**gift_presentation(row.total_price)} for row in rows]
    @router.get("/{room_id}/gift-leaderboard")
    def gift_leaderboard(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        rows = db.execute(select(RoomGiftEvent.sender_id, func.sum(RoomGiftEvent.total_price).label("total")).where(RoomGiftEvent.room_id == room.id).group_by(RoomGiftEvent.sender_id).order_by(func.sum(RoomGiftEvent.total_price).desc())).all()
        return [{"rank":i,"user_id":uid,"total_lidya":int(total or 0)} for i,(uid,total) in enumerate(rows,1)]
    @router.post("/{room_id}/music")
    def add_music(room_id: str, payload: MusicCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id))
        if not seat: raise HTTPException(status_code=403, detail="Müzik eklemek için mikrofonda olmalısınız")
        # Aynı kullanıcının paralel isteklerinde hem slot hem Lidya bakiyesi atomik korunmalı.
        locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
        if not locked_user:
            raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")
        current = db.scalar(select(func.count(RoomMusic.id)).where(RoomMusic.room_id == room.id, RoomMusic.user_id == locked_user.id)) or 0
        if current >= 10: raise HTTPException(status_code=409, detail="En fazla 10 müzik ekleyebilirsiniz")
        if locked_user.lidya < 150: raise HTTPException(status_code=400, detail="Müzik eklemek için 150 Lidya gerekli")
        locked_user.lidya -= 150
        music = RoomMusic(room_id=room.id, user_id=locked_user.id, slot=int(current)+1, title=payload.title.strip(), source_url=payload.source_url.strip(), paid_until=datetime.now(timezone.utc)+timedelta(days=7))
        db.add(music)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=409, detail="Müzik kuyruğu isteği eşzamanlı olarak işlendi; tekrar deneyin")
        db.refresh(music)
        return {"id":music.id,"slot":music.slot,"title":music.title,"source_url":music.source_url,"paid_until":music.paid_until}
    @router.delete("/{room_id}/music/{music_id}")
    def delete_music(room_id: str, music_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); music = db.scalar(select(RoomMusic).where(RoomMusic.id == music_id, RoomMusic.room_id == room.id))
        if not music: raise HTTPException(status_code=404, detail="Müzik bulunamadı")
        if music.user_id != user.id and room.owner_id != user.id: raise HTTPException(status_code=403, detail="Bu müziği silemezsiniz")
        db.delete(music); db.commit(); return {"deleted":True}
    @router.post("/{room_id}/music/{music_id}/playback")
    def update_music_playback(room_id: str, music_id: int, payload: MusicPlaybackUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id):
            raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        music = db.scalar(select(RoomMusic).where(RoomMusic.id == music_id, RoomMusic.room_id == room.id))
        if not music:
            raise HTTPException(status_code=404, detail="Müzik bulunamadı")
        if music.user_id != user.id and room.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Bu müziği kontrol edemezsiniz")
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
        return [{"id":m.id,"user_id":m.user_id,"slot":m.slot,"title":m.title,"source_url":m.source_url,"paid_until":m.paid_until,"is_playing":m.is_playing,"position_seconds":m.position_seconds,"started_at":m.started_at} for m in db.scalars(select(RoomMusic).where(RoomMusic.room_id == room.id).order_by(RoomMusic.slot))]

