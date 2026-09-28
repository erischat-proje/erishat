"""The numbered ErisChat gift catalog and authenticated Lidya transfers."""
from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .db import get_db, SessionLocal
from .gift_models import GiftAuditLog, GiftItem, GiftTransaction, UserProfileGift
from .models import User
from .platform_models import Ledger
from .room_models import Room
from .session import get_user_from_token

router = APIRouter(prefix="/v1", tags=["gifts"])
CATALOG = json.loads(Path(__file__).with_name("gift_catalog.json").read_text(encoding="utf-8"))
BY_ID = {gift["id"]: gift for gift in CATALOG}
security = HTTPBearer()


class GiftSend(BaseModel):
    recipient_id: int
    gift_key: str
    quantity: int = Field(default=1, ge=1, le=99)
    idempotency_key: str | None = Field(default=None, max_length=128)


def authenticated_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> User:
    user = get_user_from_token(db, credentials.credentials)
    if user is None:
        raise HTTPException(401, "Oturum geçersiz.")
    return user


@router.on_event("startup")
def sync_gift_catalog():
    """Keep the priced items behind transaction foreign keys in sync with the numbered list."""
    with SessionLocal() as db:
        for gift in CATALOG:
            item = db.get(GiftItem, gift["id"])
            if item is None:
                item = GiftItem(id=gift["id"])
                db.add(item)
            item.name = gift["name"]
            item.price = gift["price"]
            item.tier = gift["tier"]
            item.animation_level = "none" if gift["tier"] == 1 else "standard"
            item.icon_url = gift["image_url"]
        db.commit()


@router.get("/rooms/{room_id}/gift-catalog")
def room_catalog(room_id: int, db: Session = Depends(get_db), user: User = Depends(authenticated_user)):
    if db.get(Room, room_id) is None:
        raise HTTPException(404, "Oda bulunamadı.")
    return CATALOG


@router.get("/gifts/catalog")
def catalog():
    return CATALOG


@router.post("/rooms/{room_id}/gifts")
def room_send(room_id: int, payload: GiftSend, db: Session = Depends(get_db), user: User = Depends(authenticated_user)):
    if db.get(Room, room_id) is None:
        raise HTTPException(404, "Oda bulunamadı.")
    try:
        gift_id = int(payload.gift_key)
    except ValueError:
        raise HTTPException(404, "Hediye bulunamadı.")
    gift = BY_ID.get(gift_id)
    if gift is None:
        raise HTTPException(404, "Hediye bulunamadı.")
    if user.id == payload.recipient_id:
        raise HTTPException(400, "Kendinize hediye gönderemezsiniz.")
    key = payload.idempotency_key or str(uuid4())
    try:
        existing = db.query(GiftTransaction).filter_by(idempotency_key=key).first()
        if existing:
            if existing.sender_id != user.id:
                raise HTTPException(409, "İşlem anahtarı zaten kullanılmış.")
            return {"status": "success", "transaction_id": existing.id, "duplicate": True}
        # Lock in a stable order, including the receiver, to avoid transfer deadlocks.
        users = db.query(User).filter(User.id.in_([user.id, payload.recipient_id])).order_by(User.id).with_for_update().all()
        receiver = next((entry for entry in users if entry.id == payload.recipient_id), None)
        sender = next((entry for entry in users if entry.id == user.id), None)
        if receiver is None or sender is None:
            raise HTTPException(404, "Kullanıcı bulunamadı.")
        total = gift["price"] * payload.quantity
        if (sender.lidya or 0) < total:
            raise HTTPException(400, "Yetersiz Lidya.")
        before_sender, before_receiver = sender.lidya or 0, receiver.lidya or 0
        sender.lidya = before_sender - total
        receiver.lidya = before_receiver + total
        tx = GiftTransaction(sender_id=sender.id, receiver_id=receiver.id, room_id=room_id,
                             gift_id=gift_id, quantity=payload.quantity, total_price=total, idempotency_key=key)
        db.add(tx)
        db.flush()
        db.add(Ledger(user_id=str(sender.id), target_user_id=str(receiver.id), module="gift", action="debit",
                      amount=total, balance_before=before_sender, balance_after=sender.lidya,
                      idempotency_key=key+":debit", description=gift["name"]))
        db.add(Ledger(user_id=str(receiver.id), target_user_id=str(sender.id), module="gift", action="credit",
                      amount=total, balance_before=before_receiver, balance_after=receiver.lidya,
                      idempotency_key=key+":credit", description=gift["name"]))
        profile = db.query(UserProfileGift).filter_by(user_id=receiver.id, gift_id=gift_id).with_for_update().first()
        if profile:
            profile.count += payload.quantity
        else:
            db.add(UserProfileGift(user_id=receiver.id, gift_id=gift_id, count=payload.quantity))
        db.add(GiftAuditLog(transaction_id=tx.id, details=f"Sender {sender.id}; receiver {receiver.id}; gift {gift_id}; total {total}"))
        db.commit()
        return {"status": "success", "transaction_id": tx.id, "gift_id": gift_id, "gift_key": str(gift_id),
                "gift_name": gift["name"], "image_url": gift["image_url"], "tier": gift["tier"],
                "sender_id": sender.id, "sender_name": sender.username, "recipient_id": receiver.id, "recipient_name": receiver.username, "quantity": payload.quantity,
                "total_price": total, "special_announcement": gift["tier"] >= 8}
    except Exception:
        db.rollback()
        raise


@router.get("/rooms/{room_id}/gift-events")
def room_events(room_id: int, limit: int = 50, db: Session = Depends(get_db), user: User = Depends(authenticated_user)):
    rows = db.query(GiftTransaction).filter_by(room_id=room_id).order_by(GiftTransaction.id.desc()).limit(max(1, min(limit, 100))).all()
    names = {u.id: u.username for u in db.query(User).filter(User.id.in_({uid for row in rows for uid in (row.sender_id, row.receiver_id)})).all()}
    return [{"transaction_id": row.id, "gift_key": str(row.gift_id), "gift_name": BY_ID.get(row.gift_id, {}).get("name"),
             "sender_id": row.sender_id, "sender_name": names.get(row.sender_id), "recipient_id": row.receiver_id, "recipient_name": names.get(row.receiver_id), "quantity": row.quantity,
             "total_price": row.total_price, "created_at": row.created_at} for row in rows]


@router.get("/gifts/profile/{user_id}")
def profile(user_id: int, db: Session = Depends(get_db), user: User = Depends(authenticated_user)):
    return [{"gift_id": row.gift_id, "count": row.count} for row in db.query(UserProfileGift).filter_by(user_id=user_id).all()]

@router.get("/rooms/{room_id}/gift-leaderboard")
def room_leaderboard(room_id: int, db: Session = Depends(get_db), user: User = Depends(authenticated_user)):
    from sqlalchemy import func
    rows = db.query(GiftTransaction.receiver_id, func.sum(GiftTransaction.total_price).label("total_lidya"))\
        .filter_by(room_id=room_id).group_by(GiftTransaction.receiver_id)\
        .order_by(func.sum(GiftTransaction.total_price).desc()).limit(20).all()
    return [{"user_id": receiver_id, "total_lidya": int(total or 0)} for receiver_id, total in rows]
