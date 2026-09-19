from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Conversation, ConversationMember, Message, User
from .platform_models import Family, FamilyDonation, FamilyMember, Notification

router = APIRouter(prefix="/v1", tags=["families"])

FAMILY_LEVELS = {
    1: {"capacity": 30, "required": 0}, 2: {"capacity": 40, "required": 40_000}, 3: {"capacity": 50, "required": 100_000},
    4: {"capacity": 60, "required": 200_000}, 5: {"capacity": 70, "required": 350_000}, 6: {"capacity": 80, "required": 610_000},
    7: {"capacity": 90, "required": 890_000}, 8: {"capacity": 100, "required": 1_130_000}, 9: {"capacity": 110, "required": 1_500_000},
    10: {"capacity": 120, "required": 2_000_000}, 11: {"capacity": 130, "required": 2_600_000}, 12: {"capacity": 140, "required": 3_200_000},
}

class FamilyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)

class FamilyDonationCreate(BaseModel):
    amount: int = Field(ge=1, le=10_000_000)

class FamilyMemberUpdate(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    role: str | None = Field(default=None, pattern="^(member|admin)$")

class FamilyMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


def family_level(balance: int) -> int:
    level = 1
    for candidate, rule in FAMILY_LEVELS.items():
        if balance >= rule["required"]:
            level = candidate
    return level


def get_family(db: Session, family_id: str) -> Family:
    family = db.get(Family, family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Aile bulunamadı")
    return family


def membership(db: Session, family_id: str, user_id: str) -> FamilyMember:
    member = db.scalar(select(FamilyMember).where(FamilyMember.family_id == family_id, FamilyMember.user_id == user_id))
    if not member:
        raise HTTPException(status_code=403, detail="Bu ailenin üyesi değilsiniz")
    return member


def can_manage(family: Family, member: FamilyMember) -> bool:
    return family.owner_id == member.user_id or member.role in {"owner", "admin"}


def family_payload(db: Session, family: Family) -> dict:
    level = family_level(family.balance)
    count = int(db.scalar(select(func.count(FamilyMember.id)).where(FamilyMember.family_id == family.id)) or 0)
    return {"id": family.id, "name": family.name, "owner_id": family.owner_id, "balance": family.balance, "level": level,
            "capacity": FAMILY_LEVELS[level]["capacity"], "member_count": count, "chat_conversation_id": family.chat_conversation_id}


def register_family_auth(current_user_dependency):
    def auth():
        return Depends(current_user_dependency)

    @router.get("/families")
    def list_families(db: Session = Depends(get_db), user: User = auth()):
        rows = list(db.scalars(select(Family).join(FamilyMember, FamilyMember.family_id == Family.id).where(FamilyMember.user_id == user.id).order_by(Family.created_at.desc())))
        return [family_payload(db, row) for row in rows]

    @router.get("/families/{family_id}")
    def get_family_details(family_id: str, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); membership(db, family_id, user.id); return family_payload(db, family)

    @router.post("/families", status_code=201)
    def create_family(payload: FamilyCreate, db: Session = Depends(get_db), user: User = auth()):
        family_id = "family_" + uuid4().hex[:12]
        conversation_id = "family_chat_" + uuid4().hex[:12]
        db.add(Conversation(id=conversation_id)); db.flush()
        db.add(ConversationMember(conversation_id=conversation_id, user_id=user.id))
        family = Family(id=family_id, owner_id=user.id, name=payload.name.strip(), level=1, balance=0, chat_conversation_id=conversation_id)
        db.add(family); db.add(FamilyMember(family_id=family_id, user_id=user.id, role="owner")); db.commit(); db.refresh(family)
        return family_payload(db, family)

    @router.get("/families/{family_id}/members")
    def list_members(family_id: str, db: Session = Depends(get_db), user: User = auth()):
        get_family(db, family_id); membership(db, family_id, user.id)
        rows = list(db.scalars(select(FamilyMember).where(FamilyMember.family_id == family_id).order_by(FamilyMember.created_at.asc())))
        return [{"user_id": r.user_id, "nickname": db.get(User, r.user_id).nickname, "avatar": db.get(User, r.user_id).avatar, "role": r.role, "joined_at": r.created_at} for r in rows if db.get(User, r.user_id)]

    @router.post("/families/{family_id}/members", status_code=201)
    def invite_member(family_id: str, payload: FamilyMemberUpdate, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); actor = membership(db, family_id, user.id)
        if not can_manage(family, actor): raise HTTPException(status_code=403, detail="Üye davet etmek için aile yöneticisi olmalısınız")
        target = db.get(User, payload.user_id)
        if not target or not target.is_active: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        if db.scalar(select(FamilyMember.id).where(FamilyMember.family_id == family_id, FamilyMember.user_id == target.id)): raise HTTPException(status_code=409, detail="Kullanıcı zaten ailede")
        level = family_level(family.balance); count = int(db.scalar(select(func.count(FamilyMember.id)).where(FamilyMember.family_id == family_id)) or 0)
        if count >= FAMILY_LEVELS[level]["capacity"]: raise HTTPException(status_code=409, detail="Aile kapasitesi dolu")
        row = FamilyMember(family_id=family_id, user_id=target.id, role=payload.role or "member")
        db.add(row); db.add(ConversationMember(conversation_id=family.chat_conversation_id, user_id=target.id)); db.add(Notification(user_id=target.id, kind="family_invite", title="Aile daveti", body=f"{family.name} ailesine davet edildiniz.")); db.commit()
        return {"family_id": family_id, "user_id": target.id, "role": row.role, "added": True}

    @router.patch("/families/{family_id}/members/{member_user_id}")
    def update_member_role(family_id: str, member_user_id: str, payload: FamilyMemberUpdate, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); actor = membership(db, family_id, user.id)
        if not can_manage(family, actor): raise HTTPException(status_code=403, detail="Rol değiştirmek için aile yöneticisi olmalısınız")
        if payload.user_id != member_user_id or payload.role not in {"member", "admin"}: raise HTTPException(status_code=400, detail="Geçerli rol gerekli")
        target = membership(db, family_id, member_user_id)
        if family.owner_id == member_user_id: raise HTTPException(status_code=400, detail="Aile sahibinin rolü değiştirilemez")
        target.role = payload.role; db.commit(); return {"family_id": family_id, "user_id": member_user_id, "role": target.role}

    @router.delete("/families/{family_id}/members/{member_user_id}")
    def remove_member(family_id: str, member_user_id: str, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); actor = membership(db, family_id, user.id)
        if not can_manage(family, actor): raise HTTPException(status_code=403, detail="Üye çıkarmak için aile yöneticisi olmalısınız")
        if family.owner_id == member_user_id: raise HTTPException(status_code=400, detail="Aile sahibi çıkarılamaz")
        target = membership(db, family_id, member_user_id); db.delete(target)
        chat_member = db.scalar(select(ConversationMember).where(ConversationMember.conversation_id == family.chat_conversation_id, ConversationMember.user_id == member_user_id))
        if chat_member: db.delete(chat_member)
        db.commit(); return {"family_id": family_id, "user_id": member_user_id, "removed": True}

    @router.post("/families/{family_id}/donate")
    def donate_family(family_id: str, payload: FamilyDonationCreate, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); membership(db, family_id, user.id)
        if user.lidya < payload.amount: raise HTTPException(status_code=400, detail="Yetersiz Lidya")
        user.lidya -= payload.amount; family.balance += payload.amount; family.level = family_level(family.balance)
        db.add(FamilyDonation(family_id=family.id, user_id=user.id, amount=payload.amount)); db.commit(); return family_payload(db, family)

    @router.get("/families/{family_id}/chat")
    def family_chat(family_id: str, limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); membership(db, family_id, user.id)
        messages = list(db.scalars(select(Message).where(Message.conversation_id == family.chat_conversation_id).order_by(Message.created_at.asc()).offset(offset).limit(limit)))
        return {"family_id": family_id, "conversation_id": family.chat_conversation_id, "enabled": True, "messages": messages}

    @router.post("/families/{family_id}/chat/messages", status_code=201)
    def send_family_message(family_id: str, payload: FamilyMessageCreate, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); membership(db, family_id, user.id)
        message = Message(conversation_id=family.chat_conversation_id, sender_id=user.id, text=payload.text.strip())
        db.add(message); db.commit(); db.refresh(message); return message
