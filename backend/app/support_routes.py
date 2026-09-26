from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .support_models import SupportTicket
from .admin_models import AdminRole, AdminAuditLog, SupportMessage
from .system_logs import record
from pathlib import Path
from datetime import datetime, timezone
import json

NOTES_DIR = Path(__file__).resolve().parents[2] / "ERISCHAT_NOTLAR"
SUPPORT_LOG = NOTES_DIR / "destek.txt"

router = APIRouter(prefix="/v1/support", tags=["support"])


class SupportCreate(BaseModel):
    category: str = Field(min_length=1, max_length=32)
    subject: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=3, max_length=4000)
    attachments: list[str] = Field(default_factory=list, max_length=3)

    @staticmethod
    def _attachments(value: list[str]) -> list[str]:
        import re
        for image in value:
            if len(image) > 2_100_000 or not re.fullmatch(r"data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}", image):
                raise ValueError("Fotoğraflar JPEG, PNG veya WebP olmalı ve her biri en fazla 1,5 MB olmalı")
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
    replies = db.scalars(select(SupportMessage).where(SupportMessage.ticket_id == ticket.id).order_by(SupportMessage.created_at)).all()
    messages = [{"sender_id": ticket.user_id, "sender_role": "USER", "message": ticket.message,
                 "attachments": json.loads(ticket.attachments_json or "[]"), "created_at": ticket.created_at}]
    messages.extend({"sender_id": r.sender_id, "sender_role": ("USER" if r.sender_role == "US" else r.sender_role), "message": r.message,
                     "attachments": json.loads(r.attachments_json or "[]"), "created_at": r.created_at} for r in replies)
    return {"id": ticket.id, "category": ticket.category, "subject": ticket.subject, "status": ticket.status,
            "created_at": ticket.created_at, "messages": messages}


def register_support_auth(current_user_dependency):
    @router.post("/tickets", status_code=201)
    def create_ticket(payload: SupportCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket = SupportTicket(user_id=user.id, category=payload.category.strip(), subject=payload.subject.strip(),
                               message=payload.message.strip(), attachments_json=json.dumps(payload.attachments))
        db.add(ticket)
        db.commit()
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
        return [serialize_ticket(r, db) for r in rows]

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
        if ticket.status not in {"pending", "open", "accepted"}:
            raise HTTPException(status_code=409, detail="Kapatılmış destek kaydına yanıt gönderilemez")
        msg = SupportMessage(ticket_id=ticket_id, sender_id=user.id, sender_role="US", message=payload.message.strip(),
                             attachments_json=json.dumps(payload.attachments))
        db.add(msg)
        db.commit()
        db.refresh(msg)
        record("support", "support_ticket_user_reply", ticket_id=ticket.id, user_id=user.id, message_id=msg.id)
        return {"sent": True, "message": {"sender_id": user.id, "sender_role": "USER", "message": msg.message,
                "attachments": payload.attachments, "created_at": msg.created_at}}

    return router
