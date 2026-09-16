from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .support_models import SupportTicket

router = APIRouter(prefix="/v1/support", tags=["support"])


class SupportCreate(BaseModel):
    category: str = Field(min_length=1, max_length=32)
    subject: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=3, max_length=4000)


def register_support_auth(current_user_dependency):
    @router.post("/tickets", status_code=201)
    def create_ticket(payload: SupportCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket = SupportTicket(user_id=user.id, category=payload.category.strip(), subject=payload.subject.strip(), message=payload.message.strip())
        db.add(ticket)
        db.commit()
        db.refresh(ticket)
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
        return {"id": ticket.id, "category": ticket.category, "subject": ticket.subject, "message": ticket.message, "status": ticket.status, "created_at": ticket.created_at}

    return router
