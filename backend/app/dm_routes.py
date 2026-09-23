from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from .db import get_db
from .session import get_user_from_token
import json

router = APIRouter(prefix="/v1/dm", tags=["DM & Realtime Chat"])

class SendMessageRequest(BaseModel):
    recipient_id: str
    content: str

def get_current_user_ws(token: str, db: Session) -> str | None:
    try:
        user = get_user_from_token(db, token)
        return user.id if user else None
    except Exception:
        return None

@router.post("/send")
def send_dm(payload: SendMessageRequest, authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")

    recipient_id = payload.recipient_id
    if user.id == recipient_id:
        raise HTTPException(status_code=400, detail="Kendinize mesaj gönderemezsiniz")

    # 177. Block sonrası DM engeli kontrolü
    blocked = db.execute(
        text("SELECT 1 FROM user_blocks WHERE (user_id=:uid AND blocked_user_id=:rid) OR (user_id=:rid AND blocked_user_id=:uid)"),
        {"uid": user.id, "rid": recipient_id}
    ).first()
    if blocked:
        raise HTTPException(status_code=403, detail="Engellenen kullanıcıya mesaj gönderilemez")

    # Mesajı kaydet
    db.execute(
        text("INSERT INTO direct_messages (sender_id, recipient_id, content, is_read) VALUES (:sid, :rid, :content, 0)"),
        {"sid": user.id, "rid": recipient_id, "content": payload.content}
    )
    db.commit()

    return {"status": "success", "message": "Mesaj gönderildi"}

@router.get("/history/{recipient_id}")
def get_dm_history(recipient_id: str, authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")

    # Geçmiş mesajları çek
    rows = db.execute(
        text("SELECT id, sender_id, recipient_id, content, is_read, created_at FROM direct_messages WHERE (sender_id=:uid AND recipient_id=:rid) OR (sender_id=:rid AND recipient_id=:uid) ORDER BY created_at ASC"),
        {"uid": user.id, "rid": recipient_id}
    ).mappings().all()

    # Okundu olarak işaretle (174. Okundu sistemi)
    db.execute(
        text("UPDATE direct_messages SET is_read=1 WHERE recipient_id=:uid AND sender_id=:rid AND is_read=0"),
        {"uid": user.id, "rid": recipient_id}
    )
    db.commit()

    return {"status": "success", "messages": [dict(r) for r in rows]}

@router.get("/unread/count")
def get_unread_count(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")

    row = db.execute(
        text("SELECT COUNT(*) FROM direct_messages WHERE recipient_id=:uid AND is_read=0"),
        {"uid": user.id}
    ).scalar()

    return {"status": "success", "unread_count": int(row or 0)}
