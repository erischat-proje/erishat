from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .platform_models import Report, VipStatus, UserLocation
from .room_models import Room, RoomMember, RoomSeat, RoomPassword
from .support_models import SupportTicket
from .system_logs import record
from . import support_workflow as support_live
from .admin_models import (
    AdminRole, AdminAuditLog, SupportMessage, SupportAssignment,
    UserBan, ChatBan, RoomAdminBan, ApplicationGap, SystemAnnouncement, BanApproval, BanAppeal, FaActionLog,
)

router = APIRouter(prefix="/v1/admin", tags=["administration"])
ROLE_LEVEL = {"SA": 1, "UA": 2, "FA": 3, "DA": 4}
NOTES_DIR = Path(__file__).resolve().parents[2] / "ERISCHAT_NOTLAR"
SUPPORT_LOG = NOTES_DIR / "destek.txt"
GAPS_LOG = NOTES_DIR / "uygulamaeksikleri.txt"


def role_row(db: Session, user_id: str) -> AdminRole | None:
    return db.get(AdminRole, user_id)


def require_role(db: Session, user: User, minimum: str) -> AdminRole:
    row = role_row(db, user.id)
    if not row or ROLE_LEVEL.get(row.role, 0) < ROLE_LEVEL[minimum]:
        raise HTTPException(status_code=403, detail="Yönetim yetkisi gerekli")
    return row


def fa_view(db: Session, user: User, action: str, **details) -> None:
    if (role := role_row(db, user.id)) and role.role == "FA":
        db.add(FaActionLog(admin_id=user.id, action=action, details=json.dumps(details, ensure_ascii=False)))
        db.commit()


def require_ua_or_da(db: Session, user: User) -> AdminRole:
    row = require_role(db, user, "UA")
    if row.role not in {"UA", "DA"}:
        raise HTTPException(status_code=403, detail="Bu ban işlemi için UA veya DA yetkisi gerekli")
    return row


def require_fa_or_da(db: Session, user: User) -> AdminRole:
    return require_role(db, user, "FA")


def resolve_admin_user(db: Session, user_key: str) -> User | None:
    """Allow operator tools to use either the internal ID or the public 10-digit ID."""
    return db.get(User, user_key) or db.scalar(select(User).where(User.public_id == user_key))


def audit(db: Session, admin: User, action: str, details: dict | None = None, target_user_id: str | None = None,
          target_room_id: str | None = None, target_id: str | None = None) -> None:
    payload = details or {}
    db.add(AdminAuditLog(
        admin_id=admin.id, action=action, target_user_id=target_user_id,
        target_room_id=target_room_id, target_id=target_id,
        details=json.dumps(payload, ensure_ascii=False),
    ))
    if (role := role_row(db, admin.id)) and role.role == "FA":
        db.add(FaActionLog(admin_id=admin.id, action=action, target_user_id=target_user_id,
                           target_room_id=target_room_id, details=json.dumps(payload, ensure_ascii=False)))
    if action.startswith("support_"):
        kind = "support"
    elif action in {"ghost_mode"}:
        kind = "ghost"
    elif action in {"user_ban", "device_ban", "user_unban"}:
        kind = "ban"
    elif action in {"chat_ban", "chat_unban"}:
        kind = "chat_ban"
    elif action in {"room_ban", "room_unban"}:
        kind = "room_ban"
    elif action.startswith("lidya_"):
        kind = "lidya"
    elif action.startswith("vip_"):
        kind = "vip"
    elif action.startswith("role_"):
        kind = "role"
    elif action == "application_gap":
        kind = "application_gap"
    else:
        kind = "system"
    record(kind, action, admin_id=admin.id, admin_nickname=admin.nickname,
           target_user_id=target_user_id, target_room_id=target_room_id,
           target_id=target_id, details=payload)


def append_note(path: Path, text: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(text.rstrip() + "\n")
    except OSError:
        pass


def expiry(days: int | None) -> datetime | None:
    if days is None or days == 0:
        return None
    if days < 0:
        raise HTTPException(status_code=422, detail="Süre negatif olamaz")
    return datetime.now(timezone.utc) + timedelta(days=days)


class RoleUpdate(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    role: str = Field(pattern="^(SA|UA|FA|DA)$")


class GhostUpdate(BaseModel):
    enabled: bool


class TicketDecision(BaseModel):
    note: str = Field(default="", max_length=2000)


class TicketMessage(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    attachments: list[str] = Field(default_factory=list, max_length=3)

    @staticmethod
    def _check_images(value: list[str]) -> list[str]:
        import re
        if any(len(image) > 2_100_000 or not re.fullmatch(r"data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}", image) for image in value):
            raise ValueError("Fotoğraflar JPEG, PNG veya WebP olmalı ve her biri en fazla 1,5 MB olmalı")
        return value

    @field_validator("attachments")
    @classmethod
    def validate_attachments(cls, value):
        return cls._check_images(value)


class AmountUpdate(BaseModel):
    amount: int = Field(gt=0, le=9_000_000_000_000_000_000)


class BanRequest(BaseModel):
    days: int | None = Field(default=None, ge=0, le=36500)
    reason: str = Field(default="", max_length=2000)


class AppealCreate(BaseModel):
    reason: str = Field(min_length=3, max_length=200)
    explanation: str = Field(min_length=1, max_length=400)
    images: list[str] = Field(default_factory=list, max_length=3)

    @field_validator("images")
    @classmethod
    def validate_images(cls, value):
        return TicketMessage._check_images(value)


class Decision(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")


class VipUpdate(BaseModel):
    level: int = Field(ge=0, le=12)


class GapCreate(BaseModel):
    message: str = Field(min_length=3, max_length=4000)


class AnnouncementCreate(BaseModel):
    message: str = Field(min_length=3, max_length=4000)


def update_room_ghost(db: Session, user_id: str, enabled: bool) -> None:
    for member in db.scalars(select(RoomMember).where(RoomMember.user_id==user_id)):
        room = db.get(Room, member.room_id)
        if not enabled and member.ghost and room and room.owner_id != user_id and (
            db.get(RoomPassword, room.id) or (room.locked and (
                not room.lock_expires_at or room.lock_expires_at > datetime.now(timezone.utc)
            ))
        ):
            db.delete(member)
        else:
            member.ghost = enabled
    if enabled:
        for seat in db.scalars(select(RoomSeat).where(RoomSeat.user_id==user_id)):
            seat.user_id=None;seat.muted=False


def register_admin_auth(current_user_dependency, ghost_transition=None, support_disconnect=None):
    @router.get("/me")
    def me(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = require_role(db, user, "SA")
        record("admin_login", "admin_menu_access", admin_id=user.id, admin_nickname=user.nickname, role=row.role)
        return {"id": user.id, "public_id": None, "nickname": user.nickname, "role": row.role, "ghost_mode": row.ghost_mode}

    @router.patch("/ghost-mode")
    async def ghost_mode(payload: GhostUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = require_role(db, user, "DA")
        row.ghost_mode = payload.enabled
        update_room_ghost(db, user.id, payload.enabled)
        audit(db, user, "ghost_mode", {"enabled": payload.enabled})
        db.commit()
        if ghost_transition:
            await ghost_transition(user.id, payload.enabled)
        return {"enabled": row.ghost_mode}

    @router.get("/tickets")
    def tickets(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        return support_live.admin_tickets(db, user)

    @router.get("/tickets/{ticket_id}")
    def ticket_detail(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket, _, _ = support_live.ticket_for(db, ticket_id, user, offered=True)
        return support_live.view(db, ticket, user)

    @router.post("/tickets/{ticket_id}/accept")
    def accept_ticket(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        return support_live.accept(db, user, ticket_id)

    @router.post("/tickets/{ticket_id}/reject")
    async def reject_ticket(ticket_id: int, payload: TicketDecision, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        result = support_live.decline(db, user, ticket_id)
        if result["restriction_seconds"] and support_disconnect:
            await support_disconnect(user.id)
        return result

    @router.post("/tickets/{ticket_id}/message")
    def ticket_message(ticket_id: int, payload: TicketMessage, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        return support_live.send(db, user, ticket_id, payload.message, payload.attachments)

    @router.post("/announcements", status_code=201)
    def create_announcement(payload: AnnouncementCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_fa_or_da(db,user)
        announcement = SystemAnnouncement(admin_id=user.id, title="ErisChat Yönetim", message=payload.message.strip())
        db.add(announcement)
        db.flush()
        audit(db, user, "admin_announcement", {"announcement_id": announcement.id, "message_length": len(announcement.message)}, target_id=str(announcement.id))
        db.commit()
        db.refresh(announcement)
        return {"id": announcement.id, "title": announcement.title, "message": announcement.message, "created_at": announcement.created_at}

    @router.post("/tickets/{ticket_id}/close")
    def close_ticket(ticket_id: int, payload: TicketDecision, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        return support_live.close(db, user, ticket_id)

    @router.get("/reports")
    def reports(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        report_role = require_role(db, user, "UA")
        rows = db.scalars(select(Report).order_by(Report.created_at.desc())).all()
        record("report", "admin_reports_view", admin_id=user.id, admin_nickname=user.nickname, count=len(rows))
        fa_view(db,user,"admin_reports_view",count=len(rows))
        return [{"id": r.id, "reporter_id": (db.get(User, r.reporter_id).public_id if report_role.role in {"FA", "DA"} and db.get(User, r.reporter_id) else "(ID GİZLENMİŞTİR)"), "target_user_id": r.target_user_id, "room_id": r.room_id, "message_id": r.message_id,
                 "category": r.category, "reason": r.reason, "status": r.status, "created_at": r.created_at} for r in rows]

    @router.get("/application-gaps")
    def application_gaps(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_fa_or_da(db,user)
        rows=db.scalars(select(ApplicationGap).order_by(ApplicationGap.created_at.desc()).limit(200)).all()
        fa_view(db,user,"application_gaps_view",count=len(rows))
        return [{"id":r.id,"reporter_id":r.reporter_id,"message":r.message,
                 "created_at":r.created_at.isoformat()} for r in rows]

    @router.post("/application-gaps")
    def application_gap(payload: GapCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db, user, "UA")
        row = ApplicationGap(reporter_id=user.id, message=payload.message.strip())
        db.add(row); audit(db, user, "application_gap", {"message": payload.message}, target_id=str(row.id))
        append_note(GAPS_LOG, f"[{datetime.now(timezone.utc).isoformat()}] admin={user.nickname}({user.id}) gap={payload.message.strip()}")
        db.commit(); db.refresh(row)
        return {"id": row.id, "saved": True}

    @router.get("/users")
    def users_list(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db, user, "DA")
        rows = db.scalars(select(User).order_by(User.created_at.desc()).limit(500)).all()
        roles = {r.user_id: r.role for r in db.scalars(select(AdminRole)).all()}
        return [{
            "id": x.id,
            "public_id": x.public_id,
            "nickname": x.nickname,
            "google_email": getattr(x, "google_email", None),
            "role": roles.get(x.id),
            "is_active": x.is_active,
            "created_at": x.created_at,
        } for x in rows]

    @router.get("/users/{user_id}")
    def user_lookup(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db, user, "DA")
        target = resolve_admin_user(db, user_id)
        if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        loc = db.get(UserLocation, target.id)
        record("id_lookup", "admin_user_lookup", admin_id=user.id, admin_nickname=user.nickname, target_user_id=target.id, target_public_id=target.public_id)
        return {"id": target.id, "public_id": target.public_id, "nickname": target.nickname, "lidya": target.lidya,
                "location": None if not loc else {"city": loc.city, "latitude": loc.latitude, "longitude": loc.longitude},
                "ip": getattr(target, "last_ip", None), "device": getattr(target, "device_info", None), "created_at": target.created_at}

    @router.post("/users/{user_id}/lidya/add")
    def add_lidya(user_id: str, payload: AmountUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_fa_or_da(db,user); target=resolve_admin_user(db,user_id)
        if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        db.info.update(lidya_operation="admin_lidya_add", lidya_actor_id=user.id, lidya_reference_id=str(target.id), lidya_details=f"amount={payload.amount}")
        before=target.lidya; target.lidya += payload.amount
        audit(db,user,"lidya_add",{"before":before,"amount":payload.amount,"after":target.lidya},target_user_id=target.id)
        db.commit(); return {"before":before,"amount":payload.amount,"after":target.lidya}

    @router.post("/users/{user_id}/lidya/remove")
    def remove_lidya(user_id: str, payload: AmountUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_fa_or_da(db,user); target=resolve_admin_user(db,user_id)
        if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        db.info.update(lidya_operation="admin_lidya_remove", lidya_actor_id=user.id, lidya_reference_id=str(target.id), lidya_details=f"amount={payload.amount}")
        before=target.lidya; target.lidya=max(0,target.lidya-payload.amount)
        audit(db,user,"lidya_remove",{"before":before,"amount":payload.amount,"after":target.lidya},target_user_id=target.id)
        db.commit(); return {"before":before,"amount":payload.amount,"after":target.lidya}

    def queue_ban(db, user, payload, kind, target):
        role = require_ua_or_da(db, user)
        if not payload.reason.strip() or "days" not in payload.model_fields_set:
            raise HTTPException(422, "Ban süresi ve nedeni zorunludur; süresiz için Süresiz seçin.")
        if role.role == "DA": return None
        pending = BanApproval(requester_id=user.id, target_user_id=target.id if kind != "room" else None,
                              target_room_id=target.id if kind == "room" else None,
                              kind=kind, days=payload.days, reason=payload.reason.strip())
        db.add(pending); db.commit()
        audit(db, user, "ban_request", {"kind":kind,"request_id":pending.id},
              target_room_id=pending.target_room_id, target_user_id=pending.target_user_id)
        db.commit()
        return {"pending": True, "request_id": pending.id}

    def approval_view(db, row):
        requester = db.get(User, row.requester_id)
        target = db.get(Room, row.target_room_id) if row.target_room_id else db.get(User, row.target_user_id)
        return {"id":row.id,"kind":row.kind,"days":row.days,"reason":row.reason,"status":row.status,
                "appeal_used":row.appeal_used,"requester_id":row.requester_id,
                "requester_name":requester.nickname if requester else "Yönetici",
                "requester_avatar":requester.avatar_asset if requester else None,
                "requester_frame":requester.frame_asset if requester else None,
                "target_id":target.public_id if target else None,"target_name":target.name if row.target_room_id and target else target.nickname if target else "Kullanıcı",
                "target_avatar":target.avatar_asset if target and not row.target_room_id else None,
                "target_frame":target.frame_asset if target and not row.target_room_id else None,
                "created_at":row.created_at.isoformat() if row.created_at else None}

    @router.get("/ban-requests")
    def ban_requests(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        role=require_role(db,user,"UA")
        query=select(BanApproval).order_by(BanApproval.created_at.desc()).limit(100)
        if role.role not in {"DA","FA"}:query=query.where(BanApproval.requester_id==user.id)
        rows=list(db.scalars(query))
        return [approval_view(db,r) for r in rows]

    @router.post("/ban-requests/{request_id}/decision")
    def decide_ban(request_id:int,body:Decision,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_fa_or_da(db,user)
        row=db.scalar(select(BanApproval).where(BanApproval.id==request_id).with_for_update())
        if not row or row.status!="pending":raise HTTPException(409,"Talep artık beklemede değil")
        if body.action=="approve":
            if row.kind=="account" or row.kind=="device":
                db.add(UserBan(user_id=row.target_user_id,ban_type=row.kind,expires_at=None if row.kind=="device" else expiry(row.days),banned_by=user.id,reason=row.reason))
            elif row.kind=="chat":
                db.add(ChatBan(user_id=row.target_user_id,expires_at=expiry(row.days),banned_by=user.id,reason=row.reason))
            else:
                db.add(RoomAdminBan(room_id=row.target_room_id,expires_at=expiry(row.days),banned_by=user.id,reason=row.reason))
        row.status="approved" if body.action=="approve" else "rejected";row.decision_by=user.id
        audit(db,user,"ban_request_"+row.status,{"request_id":row.id,"kind":row.kind,"days":row.days,"reason":row.reason},target_user_id=row.target_user_id,target_room_id=row.target_room_id)
        db.commit();return approval_view(db,row)

    @router.post("/ban-requests/{request_id}/appeal")
    def appeal_ban(request_id:int,body:AppealCreate,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"UA")
        row=db.scalar(select(BanApproval).where(BanApproval.id==request_id).with_for_update())
        if not row or row.requester_id!=user.id or row.status!="rejected" or row.appeal_used:
            raise HTTPException(409,"Bu talep için itiraz hakkı bulunmuyor")
        row.appeal_used=True
        db.add(BanAppeal(approval_id=row.id,reason=body.reason.strip(),explanation=body.explanation.strip(),images_json=json.dumps(body.images)))
        audit(db,user,"ban_appeal",{"request_id":row.id},target_user_id=row.target_user_id,target_room_id=row.target_room_id)
        db.commit();return {"appealed":True}

    @router.get("/ban-appeals")
    def ban_appeals(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        role=require_role(db,user,"UA")
        query=select(BanAppeal).join(BanApproval,BanAppeal.approval_id==BanApproval.id).order_by(BanAppeal.created_at.desc()).limit(100)
        if role.role not in {"DA","FA"}:query=query.where(BanApproval.requester_id==user.id)
        rows=db.scalars(query).all()
        return [{"id":r.id,"status":r.status,"reason":r.reason,"explanation":r.explanation,
                 "images":json.loads(r.images_json),"request":approval_view(db,db.get(BanApproval,r.approval_id))} for r in rows]

    @router.post("/ban-appeals/{appeal_id}/decision")
    def decide_appeal(appeal_id:int,body:Decision,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_fa_or_da(db,user)
        appeal=db.scalar(select(BanAppeal).where(BanAppeal.id==appeal_id).with_for_update())
        if not appeal or appeal.status!="pending":raise HTTPException(409,"İtiraz artık beklemede değil")
        row=db.get(BanApproval,appeal.approval_id)
        if body.action=="approve":
            if row.kind in {"account","device"}:db.add(UserBan(user_id=row.target_user_id,ban_type=row.kind,expires_at=None if row.kind=="device" else expiry(row.days),banned_by=user.id,reason=row.reason))
            elif row.kind=="chat":db.add(ChatBan(user_id=row.target_user_id,expires_at=expiry(row.days),banned_by=user.id,reason=row.reason))
            else:db.add(RoomAdminBan(room_id=row.target_room_id,expires_at=expiry(row.days),banned_by=user.id,reason=row.reason))
        appeal.status="approved" if body.action=="approve" else "rejected"
        audit(db,user,"ban_appeal_"+appeal.status,{"request_id":row.id,"appeal_id":appeal.id,"kind":row.kind,"days":row.days,"reason":row.reason},target_user_id=row.target_user_id,target_room_id=row.target_room_id)
        db.commit();return {"id":appeal.id,"status":appeal.status}

    @router.post("/users/{user_id}/ban")
    def ban_user(user_id: str, payload: BanRequest, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_ua_or_da(db,user); target=resolve_admin_user(db,user_id)
        if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        queued=queue_ban(db,user,payload,"account",target)
        if queued:return queued
        ban=UserBan(user_id=target.id,ban_type="account",expires_at=expiry(payload.days),banned_by=user.id,reason=payload.reason)
        db.add(ban); audit(db,user,"user_ban",{"days":payload.days,"reason":payload.reason},target_user_id=target.id); db.commit()
        return {"banned":True,"expires_at":ban.expires_at}

    @router.post("/users/{user_id}/device-ban")
    def device_ban(user_id: str, payload: BanRequest, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_ua_or_da(db,user); target=resolve_admin_user(db,user_id)
        if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        queued=queue_ban(db,user,payload,"device",target)
        if queued:return queued
        ban=UserBan(user_id=target.id,ban_type="device",expires_at=None,banned_by=user.id,reason=payload.reason)
        db.add(ban); audit(db,user,"device_ban",{"days":payload.days,"reason":payload.reason},target_user_id=target.id); db.commit()
        return {"banned":True,"expires_at":ban.expires_at}

    @router.delete("/users/{user_id}/ban")
    def unban_user(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_ua_or_da(db,user)
        target=resolve_admin_user(db,user_id)
        if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        rows=db.scalars(select(UserBan).where(UserBan.user_id==target.id,UserBan.active.is_(True))).all()
        for x in rows: x.active=False
        audit(db,user,"user_unban",target_user_id=target.id); db.commit(); return {"unbanned":True,"count":len(rows)}

    @router.post("/users/{user_id}/chat-ban")
    def chat_ban(user_id: str,payload: BanRequest,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_ua_or_da(db,user); target=resolve_admin_user(db,user_id)
        if not target: raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        queued=queue_ban(db,user,payload,"chat",target)
        if queued:return queued
        row=ChatBan(user_id=target.id,expires_at=expiry(payload.days),banned_by=user.id,reason=payload.reason); db.add(row)
        audit(db,user,"chat_ban",{"days":payload.days,"reason":payload.reason},target_user_id=target.id); db.commit(); return {"banned":True,"expires_at":row.expires_at}

    @router.delete("/users/{user_id}/chat-ban")
    def unchat_ban(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_ua_or_da(db,user); target=resolve_admin_user(db,user_id)
        if not target: raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        rows=db.scalars(select(ChatBan).where(ChatBan.user_id==target.id,ChatBan.active.is_(True))).all()
        for x in rows:x.active=False
        audit(db,user,"chat_unban",target_user_id=target.id);db.commit();return {"unbanned":True}

    @router.post("/rooms/{room_id}/ban")
    def room_ban(room_id:str,payload:BanRequest,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_ua_or_da(db,user); room=db.get(Room,room_id) or db.scalar(select(Room).where(Room.public_id==room_id))
        if not room: raise HTTPException(status_code=404,detail="Oda bulunamadı")
        queued=queue_ban(db,user,payload,"room",room)
        if queued:return queued
        row=RoomAdminBan(room_id=room.id,expires_at=expiry(payload.days),banned_by=user.id,reason=payload.reason);db.add(row)
        audit(db,user,"room_ban",{"days":payload.days,"reason":payload.reason},target_room_id=room.id,target_id=room.public_id);db.commit();return {"banned":True,"expires_at":row.expires_at,"room_id":room.id,"public_id":room.public_id}

    @router.delete("/rooms/{room_id}/ban")
    def room_unban(room_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_ua_or_da(db,user); room=db.get(Room,room_id) or db.scalar(select(Room).where(Room.public_id==room_id))
        if not room: raise HTTPException(status_code=404,detail="Oda bulunamadı")
        rows=db.scalars(select(RoomAdminBan).where(RoomAdminBan.room_id==room.id,RoomAdminBan.active.is_(True))).all()
        for x in rows:x.active=False
        audit(db,user,"room_unban",target_room_id=room.id,target_id=room.public_id);db.commit();return {"unbanned":True}

    @router.post("/users/{user_id}/vip")
    def vip_update(user_id:str,payload:VipUpdate,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"DA");target=resolve_admin_user(db,user_id)
        if not target: raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        vip=db.get(VipStatus,target.id)
        if not vip: vip=VipStatus(user_id=target.id,level=payload.level,total_spent=0);db.add(vip)
        before=vip.level;vip.level=payload.level
        audit(db,user,"vip_update",{"before":before,"after":payload.level},target_user_id=target.id);db.commit()
        return {"level":vip.level,"total_spent":vip.total_spent}

    @router.get("/fa-actions")
    def fa_actions(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"DA")
        rows=db.scalars(select(FaActionLog).order_by(FaActionLog.created_at.desc(),FaActionLog.id.desc()).limit(500)).all()
        result=[]
        for row in rows:
            actor=db.get(User,row.admin_id)
            target=db.get(User,row.target_user_id) if row.target_user_id else None
            room=db.get(Room,row.target_room_id) if row.target_room_id else None
            result.append({"id":row.id,"admin_id":row.admin_id,"admin_name":actor.nickname if actor else "FA",
                           "action":row.action,"target_id":target.public_id if target else room.public_id if room else None,
                           "target_name":target.nickname if target else room.name if room else None,
                           "details":json.loads(row.details),"created_at":row.created_at.isoformat()})
        return result

    @router.get("/roles")
    def roles(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"DA")
        rows=db.scalars(select(AdminRole).order_by(AdminRole.created_at)).all()
        record("role", "admin_roles_list_view", admin_id=user.id, admin_nickname=user.nickname, count=len(rows))
        return [{"user_id":r.user_id,"role":r.role,"ghost_mode":r.ghost_mode,"created_at":r.created_at} for r in rows]

    @router.put("/roles")
    async def set_role(payload:RoleUpdate,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"DA");target=resolve_admin_user(db,payload.user_id)
        if not target: raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        row=db.get(AdminRole,target.id)
        if not row: row=AdminRole(user_id=target.id,role=payload.role,granted_by=user.id);db.add(row)
        else: row.role=payload.role;row.granted_by=user.id
        if payload.role != "DA":
            row.ghost_mode = False
            update_room_ghost(db, target.id, False)
        audit(db,user,"role_grant",{"role":payload.role,"public_id":target.public_id},target_user_id=target.id);db.commit()
        if payload.role != "DA" and ghost_transition:
            await ghost_transition(target.id, False)
        return {"user_id":target.id,"public_id":target.public_id,"role":row.role}

    @router.delete("/roles/{user_id}")
    async def remove_role(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"DA");row=db.get(AdminRole,user_id)
        if not row: raise HTTPException(status_code=404,detail="Admin yetkisi bulunamadı")
        update_room_ghost(db, user_id, False)
        db.delete(row);audit(db,user,"role_revoke",target_user_id=user_id);db.commit()
        if ghost_transition:
            await ghost_transition(user_id, False)
        return {"removed":True}

    return router
