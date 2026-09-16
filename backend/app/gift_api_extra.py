from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .room_models import Room, RoomGiftEvent, RoomMember
from .room_routes import GIFT_CATALOG, get_room_or_404, is_member, current_user_dependency


def register_gift_api_extra(router):
    @router.get("/{room_id}/gift-catalog")
    def gift_catalog(room_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id):
            raise HTTPException(status_code=403, detail="Önce odaya katılmalısınız")
        return [{"gift_key": key, "unit_price": price, "animation": price >= 30} for key, price in GIFT_CATALOG.items()]

    @router.get("/{room_id}/gift-events")
    def gift_events(room_id: str, limit: int = 50, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        room = get_room_or_404(db, room_id)
        if not is_member(db, room.id, user.id):
            raise HTTPException(status_code=403, detail="Önce odaya katılmalısınız")
        limit = max(1, min(limit, 100))
        rows = db.query(RoomGiftEvent).filter(RoomGiftEvent.room_id == room.id).order_by(RoomGiftEvent.id.desc()).limit(limit).all()
        return [{"id": x.id, "sender_id": x.sender_id, "recipient_id": x.recipient_id, "gift_key": x.gift_key, "unit_price": x.unit_price, "quantity": x.quantity, "total_price": x.total_price, "recipient_amount": x.recipient_amount, "animation": x.total_price >= 30, "created_at": x.created_at.isoformat() if x.created_at else None} for x in reversed(rows)]
