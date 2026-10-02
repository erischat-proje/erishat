"""User ideas, DA acknowledgement and private thank-you notifications."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .admin_models import AdminRole
from .platform_models import Notification
from .suggestion_models import UserSuggestion, SuggestionEvent, SuggestionReviewSession

router = APIRouter(prefix="/v1/suggestions", tags=["suggestions"])


class SuggestionCreate(BaseModel):
    message: str = Field(min_length=1, max_length=1000)

    @field_validator("message")
    @classmethod
    def meaningful(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Gelişim konusunu yazın")
        return value


def require_da(db, user):
    role = db.get(AdminRole, user.id)
    if not role or role.role != "DA":
        raise HTTPException(403, "Uygulama geri bildirimi paneli yalnızca DA yetkililerine açıktır")


def summary(row):
    return {"id": row.id, "number": f"#{row.id:04d}", "message": row.message, "read": row.read_at is not None, "thanked": row.thanked_at is not None, "created_at": row.created_at}


def event(db, row, recipient_id, kind, message):
    note = Notification(user_id=recipient_id, kind="suggestion_" + kind, title="Gelişim Fikri", body=message)
    db.add(note); db.flush()
    db.add(SuggestionEvent(suggestion_id=row.id, recipient_id=recipient_id, notification_id=note.id, kind=kind, message=message))


def reviewer(db, uid):
    session = db.scalar(select(SuggestionReviewSession).where(SuggestionReviewSession.admin_id == uid).with_for_update())
    if not session:
        session = SuggestionReviewSession(admin_id=uid)
        db.add(session); db.flush()
    return session


def register_auth(current_user_dependency):
    @router.post("", status_code=201)
    def create(payload: SuggestionCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = UserSuggestion(user_id=user.id, message=payload.message)
        db.add(row); db.commit(); db.refresh(row)
        return summary(row)

    @router.get("/mine")
    def mine(limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        return [summary(row) for row in db.scalars(select(UserSuggestion).where(UserSuggestion.user_id == user.id).order_by(UserSuggestion.id.desc()).limit(limit))]

    @router.get("/admin")
    def listing(before: int | None = Query(None, ge=1), db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_da(db, user)
        session = db.get(SuggestionReviewSession, user.id)
        query = select(UserSuggestion).order_by(UserSuggestion.id.desc()).limit(50)
        if before:
            query = query.where(UserSuggestion.id < before)
        rows = list(db.scalars(query))
        return {"pending_id": session.pending_id if session else None, "items": [{k: v for k, v in summary(row).items() if k != "message"} for row in rows], "next_before": rows[-1].id if len(rows) == 50 else None}

    @router.get("/admin/{suggestion_id}")
    def detail(suggestion_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_da(db, user)
        session = reviewer(db, user.id)
        if session.pending_id and session.pending_id != suggestion_id:
            raise HTTPException(409, "Önce açık öneride Okudum Anladım butonuna basın")
        row = db.get(UserSuggestion, suggestion_id)
        if not row:
            raise HTTPException(404, "Öneri bulunamadı")
        session.pending_id = row.id
        owner = db.get(User, row.user_id)
        result = {**summary(row), "nickname": owner.nickname, "full_name": " ".join(filter(None, [owner.first_name, owner.last_name])), "user_public_id": owner.public_id}
        db.commit()
        return result

    @router.post("/admin/{suggestion_id}/read")
    def acknowledge(suggestion_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_da(db, user)
        session = reviewer(db, user.id)
        row = db.scalar(select(UserSuggestion).where(UserSuggestion.id == suggestion_id).with_for_update())
        if not row:
            raise HTTPException(404, "Öneri bulunamadı")
        if session.pending_id != suggestion_id:
            raise HTTPException(409, "Önce önerinin detayını açın")
        if not row.read_at:
            row.read_at = datetime.now(timezone.utc); row.read_by = user.id
            event(db, row, row.user_id, "read", f"Gelişim fikriniz ({row.id:04d}) ErisChat yönetimi tarafından okundu. Fikirlerinize önem veriyoruz.")
        session.pending_id = None
        db.commit()
        return {"read": True, "id": row.id}

    @router.post("/{suggestion_id}/thank")
    def thank(suggestion_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = db.scalar(select(UserSuggestion).where(UserSuggestion.id == suggestion_id).with_for_update())
        if not row or row.user_id != user.id:
            raise HTTPException(404, "Öneri bulunamadı")
        if not row.read_at or not row.read_by:
            raise HTTPException(409, "Öneriniz henüz okunmadı")
        if not row.thanked_at:
            row.thanked_at = datetime.now(timezone.utc)
            event(db, row, row.read_by, "thanks", f"{user.nickname} isimli kullanıcınız fikirlerine önem verdiğiniz için teşekkür etti :)")
        for notification in db.scalars(select(SuggestionEvent).where(SuggestionEvent.suggestion_id == row.id, SuggestionEvent.recipient_id == user.id, SuggestionEvent.kind == "read")):
            notification.seen_at = datetime.now(timezone.utc)
            note = db.get(Notification, notification.notification_id)
            if note:
                note.read = True
        db.commit()
        return {"thanked": True}

    @router.get("/events")
    def events(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        rows = db.scalars(select(SuggestionEvent).where(SuggestionEvent.recipient_id == user.id, SuggestionEvent.seen_at.is_(None)).order_by(SuggestionEvent.id).limit(30))
        return [{"id": row.id, "suggestion_id": row.suggestion_id, "kind": row.kind, "message": row.message} for row in rows]

    @router.post("/events/{event_id}/seen")
    def seen(event_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = db.get(SuggestionEvent, event_id)
        if not row or row.recipient_id != user.id:
            raise HTTPException(404, "Bildirim bulunamadı")
        row.seen_at = datetime.now(timezone.utc)
        note = db.get(Notification, row.notification_id)
        if note:
            note.read = True
        db.commit()
        return {"seen": True}
    return router
