from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Conversation, ConversationMember, Message, User
from .platform_models import Family, FamilyDonation, FamilyInvitation, FamilyMember, Notification

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

class FamilyOwnershipTransfer(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)


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

    @router.post("/families/{family_id}/leave")
    def leave_family(family_id: str, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); member = membership(db, family_id, user.id)
        if family.owner_id == user.id:
            raise HTTPException(status_code=400, detail="Aile sahibi aileden ayrılamaz; önce sahiplik devri gerekir")
        db.delete(member)
        chat_member = db.scalar(select(ConversationMember).where(ConversationMember.conversation_id == family.chat_conversation_id, ConversationMember.user_id == user.id))
        if chat_member: db.delete(chat_member)
        db.commit(); return {"family_id": family_id, "left": True}

    @router.get("/families/invitations")
    def list_family_invitations(db: Session = Depends(get_db), user: User = auth()):
        now = datetime.now(timezone.utc)
        rows = list(db.scalars(select(FamilyInvitation).where(FamilyInvitation.user_id == user.id).order_by(FamilyInvitation.created_at.desc())))
        changed = False
        result = []
        for row in rows:
            if row.status == "pending" and row.expires_at <= now:
                row.status = "expired"; changed = True
            family = db.get(Family, row.family_id)
            if family:
                result.append({"id": row.id, "family_id": row.family_id, "family_name": family.name, "inviter_id": row.inviter_id, "role": row.role, "status": row.status, "expires_at": row.expires_at})
        if changed:
            db.commit()
        return result

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
        if not can_manage(family, actor):
            raise HTTPException(status_code=403, detail="Üye davet etmek için aile yöneticisi olmalısınız")
        target = db.get(User, payload.user_id)
        if not target or not target.is_active:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        if db.scalar(select(FamilyMember.id).where(FamilyMember.family_id == family_id, FamilyMember.user_id == target.id)):
            raise HTTPException(status_code=409, detail="Kullanıcı zaten ailede")
        pending = db.scalar(select(FamilyInvitation).where(FamilyInvitation.family_id == family_id, FamilyInvitation.user_id == target.id, FamilyInvitation.status == "pending"))
        if pending and pending.expires_at > datetime.now(timezone.utc):
            raise HTTPException(status_code=409, detail="Bu kullanıcıya bekleyen aile daveti zaten var")
        if pending:
            pending.status = "expired"
        level = family_level(family.balance)
        count = int(db.scalar(select(func.count(FamilyMember.id)).where(FamilyMember.family_id == family_id)) or 0)
        if count >= FAMILY_LEVELS[level]["capacity"]:
            raise HTTPException(status_code=409, detail="Aile kapasitesi dolu")
        invite = FamilyInvitation(id="finv_" + uuid4().hex[:12], family_id=family_id, inviter_id=user.id, user_id=target.id, role="member", status="pending", expires_at=datetime.now(timezone.utc) + timedelta(days=7))
        db.add(invite)
        db.add(Notification(user_id=target.id, kind="family_invite", title="Aile daveti", body=f"{family.name} ailesine davet edildiniz. Davet: {invite.id}"))
        db.commit()
        return {"id": invite.id, "family_id": family_id, "user_id": target.id, "role": invite.role, "status": invite.status, "expires_at": invite.expires_at}

    @router.post("/families/invitations/{invitation_id}/accept")
    def accept_family_invitation(invitation_id: str, db: Session = Depends(get_db), user: User = auth()):
        invite = db.scalar(select(FamilyInvitation).where(FamilyInvitation.id == invitation_id, FamilyInvitation.user_id == user.id).with_for_update())
        if not invite:
            raise HTTPException(status_code=404, detail="Aile daveti bulunamadı")
        if invite.status != "pending":
            raise HTTPException(status_code=409, detail="Aile daveti artık beklemede değil")
        if invite.expires_at <= datetime.now(timezone.utc):
            invite.status = "expired"; db.commit()
            raise HTTPException(status_code=410, detail="Aile davetinin süresi dolmuş")
        family = get_family(db, invite.family_id)
        if db.scalar(select(FamilyMember.id).where(FamilyMember.family_id == family.id, FamilyMember.user_id == user.id)):
            invite.status = "accepted"; db.commit()
            return {"invitation_id": invite.id, "family_id": family.id, "accepted": True, "already_member": True}
        level = family_level(family.balance)
        count = int(db.scalar(select(func.count(FamilyMember.id)).where(FamilyMember.family_id == family.id)) or 0)
        if count >= FAMILY_LEVELS[level]["capacity"]:
            raise HTTPException(status_code=409, detail="Aile kapasitesi dolu")
        db.add(FamilyMember(family_id=family.id, user_id=user.id, role="member"))
        if not db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id == family.chat_conversation_id, ConversationMember.user_id == user.id)):
            db.add(ConversationMember(conversation_id=family.chat_conversation_id, user_id=user.id))
        invite.status = "accepted"
        db.commit()
        return {"invitation_id": invite.id, "family_id": family.id, "accepted": True, "already_member": False}

    @router.post("/families/invitations/{invitation_id}/reject")
    def reject_family_invitation(invitation_id: str, db: Session = Depends(get_db), user: User = auth()):
        invite = db.scalar(select(FamilyInvitation).where(FamilyInvitation.id == invitation_id, FamilyInvitation.user_id == user.id).with_for_update())
        if not invite:
            raise HTTPException(status_code=404, detail="Aile daveti bulunamadı")
        if invite.status != "pending":
            raise HTTPException(status_code=409, detail="Aile daveti artık beklemede değil")
        invite.status = "rejected"
        db.commit()
        return {"invitation_id": invite.id, "family_id": invite.family_id, "rejected": True}

    @router.patch("/families/{family_id}/members/{member_user_id}")
    def update_member_role(family_id: str, member_user_id: str, payload: FamilyMemberUpdate, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); actor = membership(db, family_id, user.id)
        if not can_manage(family, actor): raise HTTPException(status_code=403, detail="Rol değiştirmek için aile yöneticisi olmalısınız")
        if payload.user_id != member_user_id or payload.role not in {"member", "admin"}: raise HTTPException(status_code=400, detail="Geçerli rol gerekli")
        target = membership(db, family_id, member_user_id)
        if family.owner_id == member_user_id: raise HTTPException(status_code=400, detail="Aile sahibinin rolü değiştirilemez")
        target.role = payload.role; db.commit(); return {"family_id": family_id, "user_id": member_user_id, "role": target.role}

    @router.post("/families/{family_id}/transfer-ownership")
    def transfer_family_ownership(family_id: str, payload: FamilyOwnershipTransfer, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id)
        if family.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Sahiplik yalnızca mevcut aile sahibi tarafından devredilebilir")
        if payload.user_id == user.id:
            raise HTTPException(status_code=400, detail="Sahiplik zaten bu kullanıcıda")
        target = membership(db, family_id, payload.user_id)
        current = membership(db, family_id, user.id)
        family.owner_id = target.user_id
        current.role = "member"
        target.role = "owner"
        db.commit()
        return {"family_id": family_id, "owner_id": target.user_id, "transferred": True}

    @router.delete("/families/{family_id}/members/{member_user_id}")
    def remove_member(family_id: str, member_user_id: str, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); actor = membership(db, family_id, user.id)
        if not can_manage(family, actor): raise HTTPException(status_code=403, detail="Üye çıkarmak için aile yöneticisi olmalısınız")
        if family.owner_id == member_user_id: raise HTTPException(status_code=400, detail="Aile sahibi çıkarılamaz")
        target = membership(db, family_id, member_user_id); db.delete(target)
        chat_member = db.scalar(select(ConversationMember).where(ConversationMember.conversation_id == family.chat_conversation_id, ConversationMember.user_id == member_user_id))
        if chat_member: db.delete(chat_member)
        db.commit(); return {"family_id": family_id, "user_id": member_user_id, "removed": True}

    @router.delete("/families/{family_id}/leave")
    def leave_family(family_id: str, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id)
        member = membership(db, family_id, user.id)
        if family.owner_id == user.id:
            raise HTTPException(status_code=400, detail="Aile sahibi ayrılmadan önce sahipliği devretmelidir")
        db.delete(member)
        chat_member = db.scalar(select(ConversationMember).where(
            ConversationMember.conversation_id == family.chat_conversation_id,
            ConversationMember.user_id == user.id,
        ))
        if chat_member:
            db.delete(chat_member)
        db.commit()
        return {"family_id": family_id, "user_id": user.id, "left": True}

    @router.post("/families/{family_id}/donate")
    def donate_family(family_id: str, payload: FamilyDonationCreate, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); membership(db, family_id, user.id)
        if payload.amount < 1: raise HTTPException(status_code=400, detail="Geçerli bir bağış miktarı gerekli")
        locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
        locked_family = db.scalar(select(Family).where(Family.id == family_id).with_for_update())
        if not locked_user or not locked_family: raise HTTPException(status_code=404, detail="Aile veya kullanıcı bulunamadı")
        if locked_user.lidya < payload.amount: raise HTTPException(status_code=400, detail="Yetersiz Lidya")
        locked_user.lidya -= payload.amount
        locked_family.balance += payload.amount
        locked_family.level = family_level(locked_family.balance)
        db.add(FamilyDonation(family_id=locked_family.id, user_id=locked_user.id, amount=payload.amount))
        db.commit()
        db.refresh(locked_family)
        return family_payload(db, locked_family)

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
