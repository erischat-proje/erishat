from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .room_models import Room, RoomBan, RoomGiftEvent, RoomMember, RoomModerator, RoomMusic, RoomSeat

router = APIRouter(prefix="/v1/rooms", tags=["rooms"])

LEVELS = {
    1: {"capacity": 35, "moderators": 2, "seats": 8, "required_spend": 0},
    2: {"capacity": 45, "moderators": 3, "seats": 8, "required_spend": 220_000},
    3: {"capacity": 55, "moderators": 4, "seats": 8, "required_spend": 410_000},
    4: {"capacity": 65, "moderators": 5, "seats": 8, "required_spend": 630_000},
    5: {"capacity": 75, "moderators": 6, "seats": 12, "required_spend": 840_000},
    6: {"capacity": 85, "moderators": 8, "seats": 12, "required_spend": 1_000_000},
    7: {"capacity": 95, "moderators": 10, "seats": 16, "required_spend": 1_240_000},
    8: {"capacity": 105, "moderators": 12, "seats": 16, "required_spend": 1_560_000},
}

GIFT_RECIPIENT_PERCENT = 70

GIFT_CATALOG = {
    "Zeytin Dalı": 1, "Kil Toprak Çanak": 2, "Pazaryeri Üzümü": 3,
    "Parşömen Rulosu": 4, "Kilden Mühür": 5, "Tunç Broş": 6,
    "Baharat Kesesi": 7, "Antik Çömlek": 8, "Karakalem Sardes Çizimi": 9,
    "Meşale Kıvılcımı": 10, "Gümüş Broş": 12, "Zeytinyağı Şişesi": 13,
    "Antik Tarak": 14, "Seramik Kase": 15, "Tunç Para (Sikke)": 18,
    "Antik Arp": 20, "Zeytin Taç": 30, "Mavi Boncuk / Nazarlık": 40,
    "Kraliyet Şarabı": 50, "Lidya Mühür Yüzüğü": 60, "Poyraz Rüzgarı": 70,
    "Gümüş Sikke Kesesi": 90, "Altın Zeytin Dalı": 100, "Sardes Sütunu": 120,
    "Altın Broş": 150, "Güneş Kursu": 180, "Sardes Altın Feneri": 200,
    "Kral Alyattes’in Kılıcı": 250, "Paktalos Nehri Altını": 350,
    "Antik Savaş Arabası": 500, "Kroisos’un Altın Sikkesi": 750,
    "Kraliyet Asası": 1000, "Anadolu Kaplanı": 1250,
    "Efes Artemis Tapınağı Sütunu": 1500, "Kraliyet Tahtı": 2000,
    "Altın Nehir Yağmuru": 3000, "Eris & Lidya Anıtı": 4500,
    "Kroisos’un Hazinesi": 6000, "Lidya Savaş Gemisi (Trirem)": 8000,
    "Antik Güneş Tanrısı Heykeli": 10000, "Altın Kanatlı Griffin": 12500,
    "Sardes Sarayı": 15000, "Efsanevi Lidyum Aslanı": 17500,
    "Dünyanın İlk Parası Anıtı": 19000, "Kroisos’un Altın Tahtı": 20000,
}


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)

class RoomChatUpdate(BaseModel):
    enabled: bool

class ModeratorUpdate(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)

class BanUpdate(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)

class GiftSend(BaseModel):
    recipient_id: str = Field(min_length=1, max_length=64)
    gift_key: str = Field(min_length=1, max_length=64)
    quantity: int = Field(ge=1, le=99)

class MusicCreate(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    source_url: str = Field(min_length=1, max_length=2000)


def level_for_spend(spend: int) -> int:
    current = 1
    for level, rule in LEVELS.items():
        if spend >= rule["required_spend"]:
            current = level
    return current


def refresh_level(db: Session, room: Room) -> int:
    spend = db.scalar(select(func.coalesce(func.sum(RoomGiftEvent.total_price), 0)).where(RoomGiftEvent.room_id == room.id)) or 0
    new_level = level_for_spend(int(spend))
    if room.level != new_level:
        room.level = new_level
        db.commit()
    return new_level


def get_room_or_404(db: Session, room_id: str) -> Room:
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Oda bulunamadı")
    refresh_level(db, room)
    return room


def require_owner(db: Session, room: Room, user: User) -> None:
    if room.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Sadece oda sahibi yapabilir")


def require_staff(db: Session, room: Room, user: User) -> None:
    if room.owner_id == user.id:
        return
    exists = db.scalar(select(RoomModerator.id).where(RoomModerator.room_id == room.id, RoomModerator.user_id == user.id))
    if not exists:
        raise HTTPException(status_code=403, detail="Oda sahibi veya moderatör olmalısınız")


def is_member(db: Session, room_id: str, user_id: str) -> bool:
    return bool(db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)))


def ensure_seats(db: Session, room: Room) -> None:
    count = db.scalar(select(func.count(RoomSeat.id)).where(RoomSeat.room_id == room.id)) or 0
    target = LEVELS[room.level]["seats"]
    if count >= target:
        return
    for number in range(1, target + 1):
        exists = db.scalar(select(RoomSeat.id).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == number))
        if not exists:
            db.add(RoomSeat(room_id=room.id, seat_number=number))
    db.commit()


def room_view(db: Session, room: Room) -> dict:
    ensure_seats(db, room)
    spend = db.scalar(select(func.coalesce(func.sum(RoomGiftEvent.total_price), 0)).where(RoomGiftEvent.room_id == room.id)) or 0
    members = db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id == room.id)) or 0
    moderators = list(db.scalars(select(RoomModerator.user_id).where(RoomModerator.room_id == room.id)))
    seats = list(db.scalars(select(RoomSeat).where(RoomSeat.room_id == room.id).order_by(RoomSeat.seat_number)))
    return {
        "id": room.id, "name": room.name, "owner_id": room.owner_id, "level": room.level,
        "capacity": LEVELS[room.level]["capacity"], "max_moderators": LEVELS[room.level]["moderators"],
        "seat_count": LEVELS[room.level]["seats"], "chat_enabled": room.chat_enabled,
        "locked": bool(room.locked and (room.lock_expires_at is None or room.lock_expires_at > datetime.now(timezone.utc))),
        "lock_expires_at": room.lock_expires_at, "member_count": members, "spent_lidya": int(spend),
        "moderators": moderators,
        "seats": [{"seat_number": s.seat_number, "user_id": s.user_id, "locked": s.locked, "muted": s.muted} for s in seats],
    }


@router.post("", status_code=201)
def create_room_placeholder(payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(lambda: None)):
    raise HTTPException(status_code=500, detail="room auth dependency not configured")


def register_room_auth(current_user_dependency):
    router.dependencies.clear()
    for route in list(router.routes):
        if getattr(route, "path", None) == "/v1/rooms" and getattr(route, "methods", set()) == {"POST"}:
            router.routes.remove(route)

    @router.post("", status_code=201)
    def create_room(payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Oda adı boş olamaz")
        room = Room(id="room_" + uuid4().hex, owner_id=user.id, name=name)
        db.add(room); db.flush(); db.add(RoomMember(room_id=room.id, user_id=user.id)); ensure_seats(db, room); db.commit(); db.refresh(room)
        return room_view(db, room)

    @router.get("")
    def list_rooms(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        rooms = list(db.scalars(select(Room).order_by(Room.created_at.desc())))
        return [room_view(db, room) for room in rooms]

    @router.get("/{room_id}")
    def get_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        return room_view(db, get_room_or_404(db, room_id))

    @router.post("/{room_id}/join")
    def join_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if db.scalar(select(RoomBan.id).where(RoomBan.room_id == room.id, RoomBan.user_id == user.id)): raise HTTPException(status_code=403, detail="Bu odadan atıldınız")
        if room.locked and room.lock_expires_at and room.lock_expires_at > datetime.now(timezone.utc) and room.owner_id != user.id: raise HTTPException(status_code=403, detail="Oda kilitli")
        if not is_member(db, room.id, user.id):
            count = db.scalar(select(func.count(RoomMember.id)).where(RoomMember.room_id == room.id)) or 0
            if count >= LEVELS[room.level]["capacity"]: raise HTTPException(status_code=409, detail="Oda dolu")
            db.add(RoomMember(room_id=room.id, user_id=user.id)); db.commit()
        return room_view(db, room)

    @router.post("/{room_id}/leave")
    def leave_room(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if room.owner_id == user.id: raise HTTPException(status_code=400, detail="Oda sahibi odadan ayrılamaz; odayı kapatmalıdır")
        db.execute(delete(RoomMember).where(RoomMember.room_id == room.id, RoomMember.user_id == user.id)); db.execute(delete(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id)); db.commit(); return {"left": True}

    @router.post("/{room_id}/seats/{seat_number}/join")
    def join_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Önce odaya katılmalısınız")
        if seat_number > LEVELS[room.level]["seats"]: raise HTTPException(status_code=400, detail="Bu seviyede bu koltuk yok")
        seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.seat_number == seat_number))
        if not seat: raise HTTPException(status_code=404, detail="Koltuk bulunamadı")
        if seat.locked: raise HTTPException(status_code=409, detail="Bu koltuk kilitli")
        occupied = db.scalar(select(RoomSeat.id).where(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id))
        if occupied and occupied != seat.id: raise HTTPException(status_code=409, detail="Zaten başka bir koltuktasınız")
        if seat.user_id and seat.user_id != user.id: raise HTTPException(status_code=409, detail="Bu koltuk dolu")
        seat.user_id = user.id; db.commit(); return {"seat_number": seat_number, "user_id": user.id}

    @router.delete("/{room_id}/seats/leave")
    def leave_seat(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        db.query(RoomSeat).filter(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id).update({"user_id": None}, synchronize_session=False); db.commit(); return {"left_seat": True}

    @router.patch("/{room_id}/chat")
    def set_chat(room_id: str, payload: RoomChatUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); room.chat_enabled = payload.enabled; db.commit(); return {"chat_enabled": room.chat_enabled}

    @router.post("/{room_id}/moderators")
    def add_moderator(room_id: str, payload: ModeratorUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_owner(db, room, user)
        if payload.user_id == room.owner_id: raise HTTPException(status_code=400, detail="Oda sahibi moderatör olarak eklenemez")
        if not db.get(User, payload.user_id): raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
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
        if not db.scalar(select(RoomBan.id).where(RoomBan.room_id == room.id, RoomBan.user_id == payload.user_id)):
            db.add(RoomBan(room_id=room.id, user_id=payload.user_id)); db.execute(delete(RoomMember).where(RoomMember.room_id == room.id, RoomMember.user_id == payload.user_id)); db.execute(delete(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.user_id == payload.user_id)); db.commit()
        return {"banned": True}

    @router.delete("/{room_id}/bans/{banned_user_id}")
    def remove_ban(room_id: str, banned_user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user); db.execute(delete(RoomBan).where(RoomBan.room_id == room.id, RoomBan.user_id == banned_user_id)); db.commit(); return {"removed": True}

    @router.post("/{room_id}/seats/{seat_number}/lock")
    def lock_seat(room_id: str, seat_number: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id); require_staff(db, room, user)
        if seat_number > LEVELS[room.level]["seats"]: raise HTTPException(status_code=400, detail="Geçersiz koltuk")
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

    @router.post("/{room_id}/gifts")
    async def send_gift(room_id: str, payload: GiftSend, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Önce odaya katılmalısınız")
        if not is_member(db, room.id, payload.recipient_id): raise HTTPException(status_code=404, detail="Hediye alıcısı odada değil")

        sender = db.scalar(select(User).where(User.id == user.id).with_for_update())
        recipient = db.scalar(select(User).where(User.id == payload.recipient_id).with_for_update())
        if not sender: raise HTTPException(status_code=404, detail="Gönderen bulunamadı")
        if not recipient: raise HTTPException(status_code=404, detail="Alıcı bulunamadı")

        unit_price = GIFT_CATALOG.get(payload.gift_key)
        if unit_price is None: raise HTTPException(status_code=400, detail="Geçersiz hediye")
        total = unit_price * payload.quantity
        if sender.lidya < total: raise HTTPException(status_code=400, detail="Yeterli Lidya yok")

        recipient_amount = total * GIFT_RECIPIENT_PERCENT // 100
        sender.lidya -= total
        recipient.lidya += recipient_amount
        event = RoomGiftEvent(
            room_id=room.id, sender_id=sender.id, recipient_id=recipient.id,
            gift_key=payload.gift_key, unit_price=unit_price, quantity=payload.quantity,
            total_price=total, recipient_percent=GIFT_RECIPIENT_PERCENT,
            recipient_amount=recipient_amount,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        refresh_level(db, room)

        # The room websocket lives in main.py. Importing here avoids a module-level
        # circular import while keeping the gift transaction synchronous/atomic.
        from .main import _broadcast_room_chat
        await _broadcast_room_chat(room.id, {
            "type": "room_gift",
            "id": event.id,
            "room_id": room.id,
            "sender_id": sender.id,
            "recipient_id": recipient.id,
            "gift_key": event.gift_key,
            "quantity": event.quantity,
            "total_price": event.total_price,
            "recipient_amount": event.recipient_amount,
            "animation": event.total_price >= 30,
            "created_at": event.created_at.isoformat() if event.created_at else None,
        })

        return {
            "gift_key": payload.gift_key, "quantity": payload.quantity,
            "unit_price": unit_price, "total_price": total,
            "recipient_percent": GIFT_RECIPIENT_PERCENT, "recipient_amount": recipient_amount,
            "animation": total >= 30,
        }

    @router.get("/{room_id}/gift-catalog")
    def gift_catalog(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        return [{"gift_key": key, "unit_price": price, "animation": price >= 30} for key, price in GIFT_CATALOG.items()]

    @router.get("/{room_id}/gift-events")
    def gift_events(room_id: str, limit: int = 50, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        limit = max(1, min(limit, 100))
        rows = list(db.scalars(select(RoomGiftEvent).where(RoomGiftEvent.room_id == room.id).order_by(RoomGiftEvent.created_at.desc()).limit(limit)))
        rows.reverse()
        return [{"id": row.id, "sender_id": row.sender_id, "recipient_id": row.recipient_id, "gift_key": row.gift_key, "unit_price": row.unit_price, "quantity": row.quantity, "total_price": row.total_price, "recipient_percent": row.recipient_percent, "recipient_amount": row.recipient_amount, "created_at": row.created_at, "animation": row.total_price >= 30} for row in rows]

    @router.get("/{room_id}/gift-leaderboard")
    def gift_leaderboard(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        rows = db.execute(select(RoomGiftEvent.sender_id, func.sum(RoomGiftEvent.total_price).label("total")).where(RoomGiftEvent.room_id == room.id).group_by(RoomGiftEvent.sender_id).order_by(func.sum(RoomGiftEvent.total_price).desc())).all()
        return [{"rank": i, "user_id": uid, "total_lidya": int(total or 0)} for i, (uid, total) in enumerate(rows, 1)]

    @router.post("/{room_id}/music")
    def add_music(room_id: str, payload: MusicCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id))
        if not seat: raise HTTPException(status_code=403, detail="Müzik eklemek için mikrofonda olmalısınız")
        current = db.scalar(select(func.count(RoomMusic.id)).where(RoomMusic.room_id == room.id, RoomMusic.user_id == user.id)) or 0
        if current >= 10: raise HTTPException(status_code=409, detail="En fazla 10 müzik ekleyebilirsiniz")
        if user.lidya < 150: raise HTTPException(status_code=400, detail="Müzik eklemek için 150 Lidya gerekli")
        user.lidya -= 150
        music = RoomMusic(room_id=room.id, user_id=user.id, slot=int(current) + 1, title=payload.title.strip(), source_url=payload.source_url.strip(), paid_until=datetime.now(timezone.utc) + timedelta(days=7))
        db.add(music); db.commit(); db.refresh(music)
        return {"id": music.id, "slot": music.slot, "title": music.title, "source_url": music.source_url, "paid_until": music.paid_until}

    @router.delete("/{room_id}/music/{music_id}")
    def delete_music(room_id: str, music_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        music = db.scalar(select(RoomMusic).where(RoomMusic.id == music_id, RoomMusic.room_id == room.id))
        if not music: raise HTTPException(status_code=404, detail="Müzik bulunamadı")
        if music.user_id != user.id and room.owner_id != user.id: raise HTTPException(status_code=403, detail="Bu müziği silemezsiniz")
        db.delete(music); db.commit(); return {"deleted": True}

    @router.get("/{room_id}/music")
    def list_music(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        return [{"id": m.id, "user_id": m.user_id, "slot": m.slot, "title": m.title, "source_url": m.source_url, "paid_until": m.paid_until} for m in db.scalars(select(RoomMusic).where(RoomMusic.room_id == room.id).order_by(RoomMusic.slot))]

    @router.post("/{room_id}/music/{music_id}/play")
    def play_music(room_id: str, music_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id): raise HTTPException(status_code=403, detail="Odaya katılmalısınız")
        seat = db.scalar(select(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.user_id == user.id))
        if not seat: raise HTTPException(status_code=403, detail="Müzik çalmak için mikrofonda olmalısınız")
        music = db.scalar(select(RoomMusic).where(RoomMusic.id == music_id, RoomMusic.room_id == room.id))
        if not music: raise HTTPException(status_code=404, detail="Müzik bulunamadı")
        if music.paid_until <= datetime.now(timezone.utc): raise HTTPException(status_code=402, detail="Müzik süresi dolmuş")
        return {"playing": True, "music_id": music.id, "title": music.title, "source_url": music.source_url}

    return router