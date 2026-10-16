from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .support_models import SupportTicket
from . import support_workflow as live
from .admin_models import AdminRole, AdminAuditLog, SupportMessage
from .system_logs import record
from pathlib import Path
from datetime import datetime, timezone
import json
import base64
import re

NOTES_DIR = Path(__file__).resolve().parents[2] / "ERISCHAT_NOTLAR"
SUPPORT_LOG = NOTES_DIR / "destek.txt"

router = APIRouter(prefix="/v1/support", tags=["support"])


class SupportCreate(BaseModel):
    category: str = Field(min_length=1, max_length=32)
    subject: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=3, max_length=4000)
    attachments: list[str] = Field(default_factory=list, max_length=4)
    security_snapshot: str = Field(default="", max_length=2000000)
    context_room_id: str | None = Field(default=None, max_length=64)
    context_post_id: int | None = Field(default=None, ge=1)
    context_comment_id: int | None = Field(default=None, ge=1)

    @field_validator("security_snapshot")
    @classmethod
    def validate_snapshot(cls, value):
        if value:
            if not value.startswith("data:image/"):
                raise ValueError("Sistem görüntüsü bir fotoğraf olmalı")
            cls._attachments([value])
        return value

    @staticmethod
    def _attachments(value: list[str]) -> list[str]:
        videos = 0
        for attachment in value:
            match = re.fullmatch(
                r"data:(image/(?:jpeg|png|webp)|video/(?:mp4|webm));base64,([A-Za-z0-9+/]+={0,2})",
                attachment,
            )
            if not match:
                raise ValueError("Kanıt JPEG, PNG, WebP, MP4 veya WebM olmalı")
            mime, encoded = match.groups()
            limit = 8 * 1024 * 1024 if mime.startswith("video/") else 1_500_000
            if len(encoded) > ((limit + 2) // 3) * 4:
                raise ValueError("Fotoğraf 1,5 MB, video 8 MB sınırını aşamaz")
            try:
                data = base64.b64decode(encoded, validate=True)
            except (ValueError, base64.binascii.Error):
                raise ValueError("Kanıt dosyası okunamadı")
            if not data or len(data) > limit:
                raise ValueError("Fotoğraf 1,5 MB, video 8 MB sınırını aşamaz")
            valid = (
                mime == "image/jpeg" and data.startswith(bytes.fromhex("ffd8ff"))
                or mime == "image/png" and data.startswith(bytes.fromhex("89504e470d0a1a0a"))
                or mime == "image/webp" and data.startswith(b"RIFF") and data[8:12] == b"WEBP"
                or mime == "video/mp4" and b"ftyp" in data[:16]
                or mime == "video/webm" and data.startswith(bytes.fromhex("1a45dfa3"))
            )
            if not valid:
                raise ValueError("Kanıt dosyasının biçimi geçersiz")
            videos += mime.startswith("video/")
        if videos and (videos != 1 or len(value) > 2 or (len(value) == 2 and not value[0].startswith("data:image/"))):
            raise ValueError("Video yalnızca tek başına veya otomatik ekran görüntüsüyle eklenebilir")
        return value


    @field_validator("attachments")
    @classmethod
    def validate_attachments(cls, value):
        return cls._attachments(value)


class SupportReply(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    attachments: list[str] = Field(default_factory=list, max_length=3)

    @field_validator("attachments")
    @classmethod
    def validate_attachments(cls, value):
        return SupportCreate._attachments(value)


def serialize_ticket(ticket: SupportTicket, db: Session):
    return live.view(db, ticket, db.get(User, ticket.user_id))


def register_support_auth(current_user_dependency):
    @router.post("/tickets", status_code=201)
    def create_ticket(payload: SupportCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket = SupportTicket(user_id=user.id, category=payload.category.strip(), subject=payload.subject.strip(),
                               message=payload.message.strip(), attachments_json=json.dumps(payload.attachments))
        db.add(ticket)
        db.flush()
        live.initialize_ticket(db, ticket, payload.security_snapshot, payload.context_room_id, payload.context_post_id, payload.context_comment_id)
        db.commit()
        live.dispatch(db)
        db.refresh(ticket)
        SUPPORT_LOG.parent.mkdir(parents=True, exist_ok=True)
        with SUPPORT_LOG.open("a", encoding="utf-8") as handle:
            handle.write(f"[{datetime.now(timezone.utc).isoformat()}] ticket={ticket.id} user={user.nickname}({user.id}) status={ticket.status} category={ticket.category} subject={ticket.subject}\n")
        record("support", "support_ticket_created", ticket_id=ticket.id, user_id=user.id, user_nickname=user.nickname,
               category=ticket.category, subject=ticket.subject, status=ticket.status)
        return {"id": ticket.id, "status": ticket.status, "created_at": ticket.created_at}

    @router.get("/tickets")
    def list_tickets(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        rows = db.scalars(select(SupportTicket).where(SupportTicket.user_id == user.id).order_by(SupportTicket.created_at.desc())).all()
        return [live.summary(db, r, user) for r in rows]

    @router.get("/tickets/{ticket_id}")
    def get_ticket(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket = db.get(SupportTicket, ticket_id)
        if not ticket or ticket.user_id != user.id:
            raise HTTPException(status_code=404, detail="Destek kaydı bulunamadı")
        return serialize_ticket(ticket, db)

    @router.post("/tickets/{ticket_id}/messages", status_code=201)
    def reply_ticket(ticket_id: int, payload: SupportReply, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket = db.get(SupportTicket, ticket_id)
        if not ticket or ticket.user_id != user.id:
            raise HTTPException(status_code=404, detail="Destek kaydı bulunamadı")
        return live.send(db, user, ticket_id, payload.message, payload.attachments)

    return router
