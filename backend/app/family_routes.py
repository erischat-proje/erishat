from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Conversation, ConversationMember, Message, User
from .platform_models import Family, FamilyDonation, FamilyInvitation, FamilyJoinRequest, FamilyMember, Notification, VipStatus

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

class FamilyApplicationCreate(BaseModel):
    message: str = Field(default="", max_length=500)

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


def family_managers(db: Session, family: Family) -> set[str]:
    return {family.owner_id, *db.scalars(select(FamilyMember.user_id).where(
        FamilyMember.family_id == family.id, FamilyMember.role == "admin"
    ))}


def notify_family_managers(db: Session, family: Family, body: str, *, title: str = "Aile bildirimi", exclude: set[str] | None = None) -> None:
    excluded = exclude or set()
    for manager_id in family_managers(db, family) - excluded:
        db.add(Notification(user_id=manager_id, kind="family_event", title=title, body=body))


def family_payload(db: Session, family: Family) -> dict:
    level = family_level(family.balance)
    count = int(db.scalar(select(func.count(FamilyMember.id)).where(FamilyMember.family_id == family.id)) or 0)
    rank = int(db.scalar(select(func.count(Family.id)).where(Family.balance > family.balance)) or 0) + 1
    current_required = FAMILY_LEVELS[level]["required"]
    next_required = FAMILY_LEVELS.get(level + 1, {}).get("required")
    progress = 100 if next_required is None else min(100, max(0, (family.balance - current_required) / max(1, next_required - current_required) * 100))
    return {"id": family.id, "name": family.name, "owner_id": family.owner_id, "balance": family.balance, "level": level,
            "capacity": FAMILY_LEVELS[level]["capacity"], "member_count": count, "rank": rank, "current_level_required": current_required,
            "next_level_required": next_required, "next_level_progress": round(progress, 1), "chat_conversation_id": family.chat_conversation_id}


def register_family_auth(current_user_dependency):
    def auth():
        return Depends(current_user_dependency)

    @router.get("/families")
    def list_families(db: Session = Depends(get_db), user: User = auth()):
        rows = list(db.scalars(select(Family).join(FamilyMember, FamilyMember.family_id == Family.id).where(FamilyMember.user_id == user.id).order_by(Family.created_at.desc())))
        return [family_payload(db, row) for row in rows]

    @router.get("/families/discover")
    def discover_families(limit: int = Query(30, ge=1, le=50), db: Session = Depends(get_db), user: User = auth()):
        rows=list(db.scalars(select(Family).order_by(Family.balance.desc(),Family.created_at.desc()).limit(limit)))
        result=[]
        for family in rows:
            current=membership(db,family.id,user.id) if db.scalar(select(FamilyMember.id).where(FamilyMember.family_id==family.id,FamilyMember.user_id==user.id)) else None
            owner=db.get(User,family.owner_id)
            request=db.scalar(select(FamilyJoinRequest).where(FamilyJoinRequest.family_id==family.id,FamilyJoinRequest.user_id==user.id))
            result.append({**family_payload(db,family),"owner_name":owner.nickname if owner else "","is_member":bool(current),"application_status":request.status if request else None})
        return result

    @router.get("/families/invitations")
    def list_family_invitations(db: Session = Depends(get_db), user: User = auth()):
        now = datetime.now(timezone.utc)
        rows = list(db.scalars(select(FamilyInvitation).where(FamilyInvitation.user_id == user.id).order_by(FamilyInvitation.created_at.desc())))
        changed = False
        result = []
        for invite in rows:
            if invite.status == "pending" and invite.expires_at <= now:
                invite.status = "expired"
                changed = True
            if invite.status != "pending":
                continue
            family = db.get(Family, invite.family_id)
            inviter = db.get(User, invite.inviter_id)
            if not family:
                continue
            result.append({
                "id": invite.id,
                "family_id": invite.family_id,
                "family_name": family.name,
                "inviter_id": invite.inviter_id,
                "inviter_nickname": inviter.nickname if inviter else None,
                "user_id": invite.user_id,
                "role": invite.role,
                "status": invite.status,
                "expires_at": invite.expires_at,
                "created_at": invite.created_at,
            })
        if changed:
            db.commit()
        return result

    @router.get("/families/{family_id}")
    def get_family_details(family_id: str, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id)
        viewer= db.scalar(select(FamilyMember).where(FamilyMember.family_id==family_id,FamilyMember.user_id==user.id))
        request=db.scalar(select(FamilyJoinRequest).where(FamilyJoinRequest.family_id==family_id,FamilyJoinRequest.user_id==user.id))
        return {**family_payload(db,family),"is_member":bool(viewer),"viewer_role":viewer.role if viewer else None,"application_status":request.status if request else None}

    @router.post("/families/{family_id}/applications", status_code=201)
    def apply_to_family(family_id: str, payload: FamilyApplicationCreate, db: Session = Depends(get_db), user: User = auth()):
        family=get_family(db,family_id)
        if db.scalar(select(FamilyMember.id).where(FamilyMember.user_id==user.id)):
            raise HTTPException(status_code=409,detail="Yeni aileye başvurmadan önce mevcut ailenden ayrılmalısın")
        member_count=int(db.scalar(select(func.count(FamilyMember.id)).where(FamilyMember.family_id==family.id)) or 0)
        if member_count>=FAMILY_LEVELS[family_level(family.balance)]["capacity"]:
            raise HTTPException(status_code=409,detail="Aile kapasitesi dolu")
        row=db.scalar(select(FamilyJoinRequest).where(FamilyJoinRequest.family_id==family.id,FamilyJoinRequest.user_id==user.id))
        if row and row.status=="pending": raise HTTPException(status_code=409,detail="Bu aileye başvurun zaten bekliyor")
        if row: row.message=payload.message.strip();row.status="pending";row.created_at=datetime.now(timezone.utc);row.responded_at=None
        else: row=FamilyJoinRequest(id="fjoin_"+uuid4().hex[:12],family_id=family.id,user_id=user.id,message=payload.message.strip());db.add(row)
        notify_family_managers(
            db, family,
            f"{user.nickname} isimli kullanıcı ailenize katılmak istiyor. Onaylıyor musunuz? [family_request:{family.id}:{row.id}]",
            title="Aile katılım başvurusu",
        )
        db.commit();return {"id":row.id,"status":"pending","family_id":family.id}

    @router.get("/families/{family_id}/applications")
    def family_applications(family_id: str, db: Session = Depends(get_db), user: User = auth()):
        family=get_family(db,family_id);actor=membership(db,family_id,user.id)
        if not can_manage(family,actor): raise HTTPException(status_code=403,detail="Aile yöneticisi olmalısınız")
        rows=db.scalars(select(FamilyJoinRequest).where(FamilyJoinRequest.family_id==family.id,FamilyJoinRequest.status=="pending").order_by(FamilyJoinRequest.created_at.asc())).all()
        return [{"id":r.id,"user_id":r.user_id,"nickname":(db.get(User,r.user_id).nickname if db.get(User,r.user_id) else ""),"message":r.message,"created_at":r.created_at} for r in rows]

    @router.post("/families/{family_id}/applications/{request_id}/accept")
    def accept_family_application(family_id: str, request_id: str, db: Session = Depends(get_db), user: User = auth()):
        family=get_family(db,family_id);actor=membership(db,family_id,user.id)
        if not can_manage(family,actor): raise HTTPException(status_code=403,detail="Aile yöneticisi olmalısınız")
        request=db.get(FamilyJoinRequest,request_id)
        if not request or request.family_id!=family_id or request.status!="pending": raise HTTPException(status_code=404,detail="Bekleyen başvuru bulunamadı")
        if db.scalar(select(FamilyMember.id).where(FamilyMember.user_id==request.user_id)): raise HTTPException(status_code=409,detail="Kullanıcı başka bir aileye üye olmuş")
        count=int(db.scalar(select(func.count(FamilyMember.id)).where(FamilyMember.family_id==family.id)) or 0)
        if count>=FAMILY_LEVELS[family_level(family.balance)]["capacity"]: raise HTTPException(status_code=409,detail="Aile kapasitesi dolu")
        db.add(FamilyMember(family_id=family.id,user_id=request.user_id,role="member"));db.add(ConversationMember(conversation_id=family.chat_conversation_id,user_id=request.user_id))
        request.status="accepted";request.responded_at=datetime.now(timezone.utc)
        applicant = db.get(User, request.user_id)
        nickname = applicant.nickname if applicant else "Kullanıcı"
        db.add(Notification(user_id=request.user_id,kind="family_application",title="Aile başvurun kabul edildi",body=f"{family.name} isimli aileye katılım işleminiz gerçekleştirilmiştir. Hadi aile sohbetinden ona bir merhaba mesajı yollayın."))
        notify_family_managers(db, family, f"{nickname} isimli kullanıcı artık ailenize katıldı.", exclude={user.id})
        db.commit()
        return {"accepted":True,"family_id":family.id,"user_id":request.user_id}

    @router.post("/families/{family_id}/applications/{request_id}/reject")
    def reject_family_application(family_id: str, request_id: str, db: Session = Depends(get_db), user: User = auth()):
        family=get_family(db,family_id);actor=membership(db,family_id,user.id)
        if not can_manage(family,actor): raise HTTPException(status_code=403,detail="Aile yöneticisi olmalısınız")
        request=db.get(FamilyJoinRequest,request_id)
        if not request or request.family_id!=family_id or request.status!="pending": raise HTTPException(status_code=404,detail="Bekleyen başvuru bulunamadı")
        request.status="rejected";request.responded_at=datetime.now(timezone.utc)
        db.add(Notification(user_id=request.user_id,kind="family_application",title="Aile başvurusu",body="Aile başvurunuz reddedilmiştir."))
        db.commit()
        return {"rejected":True,"family_id":family.id}

    @router.post("/families", status_code=201)
    def create_family(payload: FamilyCreate, db: Session = Depends(get_db), user: User = auth()):
        family_id = "family_" + uuid4().hex[:12]
        conversation_id = "family_chat_" + uuid4().hex[:12]
        db.add(Conversation(id=conversation_id, type="family")); db.flush()
        db.add(ConversationMember(conversation_id=conversation_id, user_id=user.id))
        family = Family(id=family_id, owner_id=user.id, name=payload.name.strip(), level=1, balance=0, chat_conversation_id=conversation_id)
        db.add(family); db.add(FamilyMember(family_id=family_id, user_id=user.id, role="owner")); db.commit(); db.refresh(family)
        return family_payload(db, family)

    @router.get("/families/{family_id}/members")
    def list_members(family_id: str, db: Session = Depends(get_db), user: User = auth()):
        get_family(db, family_id); membership(db, family_id, user.id)
        rows = list(db.scalars(select(FamilyMember).where(FamilyMember.family_id == family_id).order_by(FamilyMember.created_at.asc())))
        result=[]
        for r in rows:
            member=db.get(User,r.user_id)
            if not member: continue
            vip=db.get(VipStatus,member.id)
            result.append({"user_id":member.id,"public_id":member.public_id,"nickname":member.nickname,"avatar":member.avatar,
                           "avatar_asset":member.avatar_asset,"frame_asset":member.frame_asset,"vip_level":int(vip.level if vip else 0),
                           "role":r.role,"joined_at":r.created_at})
        return result

    @router.post("/families/{family_id}/members", status_code=201)
    def invite_member(family_id: str, payload: FamilyMemberUpdate, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); actor = membership(db, family_id, user.id)
        if not can_manage(family, actor):
            raise HTTPException(status_code=403, detail="Üye davet etmek için aile yöneticisi olmalısınız")
        target = db.get(User, payload.user_id) or db.scalar(select(User).where(User.public_id == payload.user_id.strip()))
        if not target or not target.is_active:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        if db.scalar(select(FamilyMember.id).where(FamilyMember.family_id == family_id, FamilyMember.user_id == target.id)):
            raise HTTPException(status_code=409, detail="Kullanıcı zaten ailede")
        if db.scalar(select(FamilyMember.id).where(FamilyMember.user_id == target.id)):
            raise HTTPException(status_code=409, detail="Kullanıcı başka bir ailenin üyesi")
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
        db.add(Notification(user_id=target.id, kind="family_invite", title="Aile bildirimi", body=f"{family.name} isimli aile sizi ailesine katılmaya davet etti."))
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
        if db.scalar(select(FamilyMember.id).where(FamilyMember.user_id == user.id)):
            raise HTTPException(status_code=409, detail="Davet kabul etmeden önce mevcut ailenden ayrılmalısın")
        level = family_level(family.balance)
        count = int(db.scalar(select(func.count(FamilyMember.id)).where(FamilyMember.family_id == family.id)) or 0)
        if count >= FAMILY_LEVELS[level]["capacity"]:
            raise HTTPException(status_code=409, detail="Aile kapasitesi dolu")
        db.add(FamilyMember(family_id=family.id, user_id=user.id, role="member"))
        if not db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id == family.chat_conversation_id, ConversationMember.user_id == user.id)):
            db.add(ConversationMember(conversation_id=family.chat_conversation_id, user_id=user.id))
        invite.status = "accepted"
        db.add(Notification(user_id=user.id, kind="family_event", title="Aile bildirimi", body=f"{family.name} isimli aileye katılım işleminiz gerçekleştirilmiştir."))
        notify_family_managers(db, family, f"{user.nickname} isimli kullanıcı artık ailenize katıldı.")
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
        family = get_family(db, invite.family_id)
        notify_family_managers(db, family, f"{user.nickname} isimli kullanıcı aile davetinizi reddetti.")
        db.commit()
        return {"invitation_id": invite.id, "family_id": invite.family_id, "rejected": True}

    @router.patch("/families/{family_id}/members/{member_user_id}")
    def update_member_role(family_id: str, member_user_id: str, payload: FamilyMemberUpdate, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id); actor = membership(db, family_id, user.id)
        if family.owner_id != actor.user_id: raise HTTPException(status_code=403, detail="Yetki vermek veya almak yalnızca aile kurucusuna açıktır")
        if payload.user_id != member_user_id or payload.role not in {"member", "admin"}: raise HTTPException(status_code=400, detail="Geçerli rol gerekli")
        target = membership(db, family_id, member_user_id)
        if family.owner_id == member_user_id: raise HTTPException(status_code=400, detail="Aile sahibinin rolü değiştirilemez")
        if target.role == payload.role:
            return {"family_id": family_id, "user_id": member_user_id, "role": target.role}
        target.role = payload.role
        target_user = db.get(User, target.user_id)
        nickname = target_user.nickname if target_user else "Kullanıcı"
        text = f"Aile yetkiniz verildi." if payload.role == "admin" else "Aile yetkiniz alındı."
        db.add(Notification(user_id=target.user_id, kind="family_role", title="Aile bildirimi", body=text))
        notify_family_managers(db, family, f"{nickname} adlı kullanıcıya aile yetkisi {'verilmiştir' if payload.role == 'admin' else 'alınmıştır'}.", exclude={user.id, target.user_id})
        db.commit()
        return {"family_id": family_id, "user_id": member_user_id, "role": target.role}

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
        target = membership(db, family_id, member_user_id)
        if actor.user_id != family.owner_id and target.role != "member":
            raise HTTPException(status_code=403, detail="Yetkilileri yalnızca aile kurucusu yönetebilir")
        target_user = db.get(User, member_user_id)
        actor_name = user.nickname or "Aile yetkilisi"
        target_name = target_user.nickname if target_user else "Kullanıcı"
        db.add(Notification(user_id=member_user_id, kind="family_removed", title="Aile bildirimi", body=f"{family.name} ailesinden atıldınız."))
        notify_family_managers(db, family, f"{target_name} adlı kullanıcı aileden atılmıştır.", exclude={user.id, family.owner_id, member_user_id})
        if actor.user_id != family.owner_id:
            db.add(Notification(user_id=family.owner_id, kind="family_removed", title="Aile bildirimi", body=f"{target_name} olan aile üyeniz {actor_name} isimli yetkiliniz tarafından aileden atılmıştır."))
        db.delete(target)
        chat_member = db.scalar(select(ConversationMember).where(ConversationMember.conversation_id == family.chat_conversation_id, ConversationMember.user_id == member_user_id))
        if chat_member: db.delete(chat_member)
        db.commit(); return {"family_id": family_id, "user_id": member_user_id, "removed": True}

    @router.delete("/families/{family_id}/leave")
    def leave_family(family_id: str, db: Session = Depends(get_db), user: User = auth()):
        family = get_family(db, family_id)
        member = membership(db, family_id, user.id)
        if family.owner_id == user.id:
            count=int(db.scalar(select(func.count(FamilyMember.id)).where(FamilyMember.family_id==family.id)) or 0)
            if count > 1:
                raise HTTPException(status_code=400, detail="Aile sahibi ayrılmadan önce Aileyi yönet bölümünden sahipliği devretmelidir")
            family_name=family.name
            conversation=db.get(Conversation,family.chat_conversation_id)
            db.delete(family)
            if conversation:
                db.delete(conversation)
            db.commit()
            return {"family_id": family_id, "user_id": user.id, "left": True, "family_name": family_name, "dissolved": True}
        db.delete(member)
        chat_member = db.scalar(select(ConversationMember).where(
            ConversationMember.conversation_id == family.chat_conversation_id,
            ConversationMember.user_id == user.id,
        ))
        if chat_member:
            db.delete(chat_member)
        notify_family_managers(db, family, f"{user.nickname} adlı kullanıcı aileden ayrılmıştır.", exclude={user.id})
        db.commit()
        return {"family_id": family_id, "user_id": user.id, "left": True, "family_name": family.name}

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
        db.add(message)
        for row in db.scalars(select(FamilyMember).where(FamilyMember.family_id == family_id, FamilyMember.user_id != user.id)):
            db.add(Notification(user_id=row.user_id, kind="dm_message", title=family.name + " aile sohbeti", body=payload.text.strip()[:180]))
        db.commit(); db.refresh(message); return message
