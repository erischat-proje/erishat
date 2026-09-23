from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from .db import get_db
from .session import get_user_from_token

router = APIRouter(prefix="/v1/notifications", tags=["Notification System"])

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

@router.get("/")
def get_notifications(authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    rows = db.execute(
        text("SELECT id, type, title, message, is_read, created_at FROM notifications WHERE user_id=:uid ORDER BY created_at DESC LIMIT 50"),
        {"uid": user.id}
    ).mappings().all()
    return {"status": "success", "notifications": [dict(r) for r in rows]}

@router.post("/{notification_id}/read")
def mark_notification_read(notification_id: int, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    db.execute(
        text("UPDATE notifications SET is_read=1 WHERE id=:nid AND user_id=:uid"),
        {"nid": notification_id, "uid": user.id}
    )
    db.commit()
    return {"status": "success", "message": "Bildirim okundu olarak işaretlendi"}

@router.post("/read-all")
def mark_all_notifications_read(authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    db.execute(
        text("UPDATE notifications SET is_read=1 WHERE user_id=:uid"),
        {"uid": user.id}
    )
    db.commit()
    return {"status": "success", "message": "Tüm bildirimler okundu yapıldı"}
