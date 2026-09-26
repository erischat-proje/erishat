from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .support_models import SupportTicket
from .admin_models import SupportMessage
from .admin_models import AdminRole, AdminAuditLog
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


class SupportReply(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


def register_support_auth(current_user_dependency):
    @router.post("/tickets", status_code=201)
    def create_ticket(payload: SupportCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket = SupportTicket(user_id=user.id, category=payload.category.strip(), subject=payload.subject.strip(), message=payload.message.strip())
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
        return [{"id": r.id, "category": r.category, "subject": r.subject, "message": r.message, "status": r.status, "created_at": r.created_at} for r in rows]

    @router.get("/tickets/{ticket_id}")
    def get_ticket(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket = db.get(SupportTicket, ticket_id)
        if not ticket or ticket.user_id != user.id:
            raise HTTPException(status_code=404, detail="Destek kaydı bulunamadı")
        messages = db.scalars(select(SupportMessage).where(SupportMessage.ticket_id == ticket.id).order_by(SupportMessage.created_at)).all()
        return {"id": ticket.id, "category": ticket.category, "subject": ticket.subject, "message": ticket.message,
                "status": ticket.status, "created_at": ticket.created_at,
                "messages": [{"sender_role": row.sender_role, "message": row.message, "created_at": row.created_at} for row in messages]}

    @router.post("/tickets/{ticket_id}/messages", status_code=201)
    def reply_ticket(ticket_id: int, payload: SupportReply, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket = db.get(SupportTicket, ticket_id)
        if not ticket or ticket.user_id != user.id:
            raise HTTPException(status_code=404, detail="Destek kaydı bulunamadı")
        if ticket.status not in {"pending", "open", "accepted"}:
            raise HTTPException(status_code=409, detail="Kapatılmış destek kaydına yanıt gönderilemez")
        row = SupportMessage(ticket_id=ticket.id, sender_id=user.id, sender_role="US", message=payload.message.strip())
        db.add(row)
        db.commit()
        db.refresh(row)
        record("support", "support_ticket_user_reply", ticket_id=ticket.id, user_id=user.id, message_id=row.id)
        return {"id": row.id, "sender_role": row.sender_role, "message": row.message, "created_at": row.created_at}

    return router
