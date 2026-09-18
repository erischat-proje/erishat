from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .platform_models import Report, VipStatus, UserLocation
from .room_models import Room
from .support_models import SupportTicket
from .system_logs import record
from .admin_models import (
    AdminRole, AdminAuditLog, SupportMessage, SupportAssignment,
    UserBan, ChatBan, RoomAdminBan, ApplicationGap,
)

router = APIRouter(prefix="/v1/admin", tags=["administration"])
ROLE_LEVEL = {"SA": 1, "UA": 2, "DA": 3}
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


def audit(db: Session, admin: User, action: str, details: dict | None = None, target_user_id: str | None = None,
          target_room_id: str | None = None, target_id: str | None = None) -> None:
    payload = details or {}
    db.add(AdminAuditLog(
        admin_id=admin.id, action=action, target_user_id=target_user_id,
        target_room_id=target_room_id, target_id=target_id,
        details=json.dumps(payload, ensure_ascii=False),
    ))
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
    role: str = Field(pattern="^(SA|UA|DA)$")


class GhostUpdate(BaseModel):
    enabled: bool


class TicketDecision(BaseModel):
    note: str = Field(default="", max_length=2000)


class TicketMessage(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class AmountUpdate(BaseModel):
    amount: int = Field(gt=0, le=2_000_000_000)


class BanRequest(BaseModel):
    days: int | None = Field(default=None, ge=0, le=36500)
    reason: str = Field(default="", max_length=2000)


class VipUpdate(BaseModel):
    level: int = Field(ge=0, le=12)


class GapCreate(BaseModel):
    message: str = Field(min_length=3, max_length=4000)


def register_admin_auth(current_user_dependency):
    @router.get("/me")
    def me(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = require_role(db, user, "SA")
        record("admin_login", "admin_menu_access", admin_id=user.id, admin_nickname=user.nickname, role=row.role)
        return {"id": user.id, "public_id": None, "nickname": user.nickname, "role": row.role, "ghost_mode": row.ghost_mode}

    @router.patch("/ghost-mode")
    def ghost_mode(payload: GhostUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = require_role(db, user, "SA")
        row.ghost_mode = payload.enabled
        audit(db, user, "ghost_mode", {"enabled": payload.enabled})
        db.commit()
        return {"enabled": row.ghost_mode}

    @router.get("/tickets")
    def tickets(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db, user, "SA")
        rows = db.scalars(select(SupportTicket).order_by(SupportTicket.created_at.desc())).all()
        return [{"id": x.id, "user_id": x.user_id, "category": x.category, "subject": x.subject, "message": x.message,
                 "status": x.status, "created_at": x.created_at} for x in rows]

    @router.get("/tickets/{ticket_id}")
    def ticket_detail(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db, user, "SA")
        ticket = db.get(SupportTicket, ticket_id)
        if not ticket:
            raise HTTPException(status_code=404, detail="Destek talebi bulunamadı")
        messages = db.scalars(select(SupportMessage).where(SupportMessage.ticket_id == ticket_id).order_by(SupportMessage.created_at)).all()
        assignment = db.get(SupportAssignment, ticket_id)
        target_user = db.get(User, ticket.user_id)
        record("support_view", "support_ticket_view", admin_id=user.id, admin_nickname=user.nickname,
               target_user_id=ticket.user_id, target_nickname=getattr(target_user, "nickname", None),
               ticket_id=ticket_id, message_count=len(messages))
        return {"id": ticket.id, "user_id": ticket.user_id, "category": ticket.category, "subject": ticket.subject,
                "message": ticket.message, "status": ticket.status, "created_at": ticket.created_at,
                "assignment": None if not assignment else {"admin_id": assignment.admin_id, "decision": assignment.decision, "note": assignment.decision_note, "decided_at": assignment.decided_at},
                "messages": [{"sender_id": m.sender_id, "sender_role": m.sender_role, "message": m.message, "created_at": m.created_at} for m in messages]}

    @router.post("/tickets/{ticket_id}/accept")
    def accept_ticket(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = require_role(db, user, "SA")
        ticket = db.get(SupportTicket, ticket_id)
        if not ticket: raise HTTPException(status_code=404, detail="Destek talebi bulunamadı")
        if ticket.status not in {"pending", "open"}: raise HTTPException(status_code=409, detail="Talep artık beklemede değil")
        ticket.status = "accepted"
        assignment = db.get(SupportAssignment, ticket_id)
        if assignment: assignment.admin_id = user.id; assignment.decision = "accepted"; assignment.decision_note = None
        else: db.add(SupportAssignment(ticket_id=ticket_id, admin_id=user.id, decision="accepted"))
        db.add(SupportMessage(ticket_id=ticket_id, sender_id=user.id, sender_role=row.role, message="Destek talebi kabul edildi."))
        audit(db, user, "support_accept", {"ticket_id": ticket_id}, target_user_id=ticket.user_id, target_id=str(ticket_id))
        db.commit()
        return {"accepted": True, "ticket_id": ticket_id}

    @router.post("/tickets/{ticket_id}/reject")
    def reject_ticket(ticket_id: int, payload: TicketDecision, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = require_role(db, user, "SA")
        ticket = db.get(SupportTicket, ticket_id)
        if not ticket: raise HTTPException(status_code=404, detail="Destek talebi bulunamadı")
        ticket.status = "rejected"
        assignment = db.get(SupportAssignment, ticket_id)
        if assignment: assignment.admin_id = user.id; assignment.decision = "rejected"; assignment.decision_note = payload.note
        else: db.add(SupportAssignment(ticket_id=ticket_id, admin_id=user.id, decision="rejected", decision_note=payload.note))
        db.add(SupportMessage(ticket_id=ticket_id, sender_id=user.id, sender_role=row.role, message=payload.note or "Destek talebi reddedildi."))
        audit(db, user, "support_reject", {"ticket_id": ticket_id, "note": payload.note}, target_user_id=ticket.user_id, target_id=str(ticket_id))
        db.commit()
        return {"rejected": True, "ticket_id": ticket_id}

    @router.post("/tickets/{ticket_id}/message")
    def ticket_message(ticket_id: int, payload: TicketMessage, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = require_role(db, user, "SA")
        ticket = db.get(SupportTicket, ticket_id)
        if not ticket or ticket.status not in {"accepted", "pending", "open"}: raise HTTPException(status_code=409, detail="Destek talebi aktif değil")
        db.add(SupportMessage(ticket_id=ticket_id, sender_id=user.id, sender_role=row.role, message=payload.message.strip()))
        audit(db, user, "support_message", {"ticket_id": ticket_id, "message": payload.message}, target_user_id=ticket.user_id, target_id=str(ticket_id))
        db.commit()
        return {"sent": True}

    @router.post("/tickets/{ticket_id}/close")
    def close_ticket(ticket_id: int, payload: TicketDecision, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        row = require_role(db, user, "SA")
        ticket = db.get(SupportTicket, ticket_id)
        if not ticket: raise HTTPException(status_code=404, detail="Destek talebi bulunamadı")
        result = payload.note.strip() or "unspecified"
        if result not in {"supported", "unsupported"}:
            result = "supported" if "olundu" in result.lower() else "unsupported" if "olunmadı" in result.lower() else result
        ticket.status = "closed"
        db.add(SupportMessage(ticket_id=ticket_id, sender_id=user.id, sender_role=row.role, message=f"Destek sonucu: {result}"))
        audit(db, user, "support_close", {"ticket_id": ticket_id, "result": result}, target_user_id=ticket.user_id, target_id=str(ticket_id))
        append_note(SUPPORT_LOG, f"[{datetime.now(timezone.utc).isoformat()}] ticket={ticket_id} admin={user.nickname}({user.id}) user={ticket.user_id} status=closed result={result}")
        db.commit()
        return {"closed": True, "result": result}

    @router.get("/reports")
    def reports(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db, user, "UA")
        rows = db.scalars(select(Report).order_by(Report.created_at.desc())).all()
        record("report", "admin_reports_view", admin_id=user.id, admin_nickname=user.nickname, count=len(rows))
        return [{"id": r.id, "reporter_id": r.reporter_id, "target_user_id": r.target_user_id, "room_id": r.room_id, "message_id": r.message_id,
                 "category": r.category, "reason": r.reason, "status": r.status, "created_at": r.created_at} for r in rows]

    @router.post("/application-gaps")
    def application_gap(payload: GapCreate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db, user, "UA")
        row = ApplicationGap(reporter_id=user.id, message=payload.message.strip())
        db.add(row); audit(db, user, "application_gap", {"message": payload.message}, target_id=str(row.id))
        append_note(GAPS_LOG, f"[{datetime.now(timezone.utc).isoformat()}] admin={user.nickname}({user.id}) gap={payload.message.strip()}")
        db.commit(); db.refresh(row)
        return {"id": row.id, "saved": True}

    @router.get("/users/{user_id}")
    def user_lookup(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db, user, "DA")
        target = db.get(User, user_id)
        if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        loc = db.get(UserLocation, user_id)
        record("id_lookup", "admin_user_lookup", admin_id=user.id, admin_nickname=user.nickname, target_user_id=target.id, target_public_id=target.public_id)
        return {"id": target.id, "public_id": target.public_id, "nickname": target.nickname, "lidya": target.lidya,
                "location": None if not loc else {"city": loc.city, "latitude": loc.latitude, "longitude": loc.longitude},
                "ip": getattr(target, "last_ip", None), "device": getattr(target, "device_info", None), "created_at": target.created_at}

    @router.post("/users/{user_id}/lidya/add")
    def add_lidya(user_id: str, payload: AmountUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db, user, "DA"); target=db.get(User,user_id)
        if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        before=target.lidya; target.lidya += payload.amount
        audit(db,user,"lidya_add",{"before":before,"amount":payload.amount,"after":target.lidya},target_user_id=user_id)
        db.commit(); return {"before":before,"amount":payload.amount,"after":target.lidya}

    @router.post("/users/{user_id}/lidya/remove")
    def remove_lidya(user_id: str, payload: AmountUpdate, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db,user,"DA"); target=db.get(User,user_id)
        if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        before=target.lidya; target.lidya=max(0,target.lidya-payload.amount)
        audit(db,user,"lidya_remove",{"before":before,"amount":payload.amount,"after":target.lidya},target_user_id=user_id)
        db.commit(); return {"before":before,"amount":payload.amount,"after":target.lidya}

    @router.post("/users/{user_id}/ban")
    def ban_user(user_id: str, payload: BanRequest, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db,user,"UA"); target=db.get(User,user_id)
        if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        ban=UserBan(user_id=user_id,ban_type="account",expires_at=expiry(payload.days),banned_by=user.id,reason=payload.reason)
        db.add(ban); audit(db,user,"user_ban",{"days":payload.days,"reason":payload.reason},target_user_id=user_id); db.commit()
        return {"banned":True,"expires_at":ban.expires_at}

    @router.post("/users/{user_id}/device-ban")
    def device_ban(user_id: str, payload: BanRequest, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db,user,"UA"); target=db.get(User,user_id)
        if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        ban=UserBan(user_id=user_id,ban_type="device",expires_at=expiry(payload.days),banned_by=user.id,reason=payload.reason)
        db.add(ban); audit(db,user,"device_ban",{"days":payload.days,"reason":payload.reason},target_user_id=user_id); db.commit()
        return {"banned":True,"expires_at":ban.expires_at}

    @router.delete("/users/{user_id}/ban")
    def unban_user(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        require_role(db,user,"UA")
        rows=db.scalars(select(UserBan).where(UserBan.user_id==user_id,UserBan.active.is_(True))).all()
        for x in rows: x.active=False
        audit(db,user,"user_unban",target_user_id=user_id); db.commit(); return {"unbanned":True,"count":len(rows)}

    @router.post("/users/{user_id}/chat-ban")
    def chat_ban(user_id: str,payload: BanRequest,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"UA"); target=db.get(User,user_id)
        if not target: raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        row=ChatBan(user_id=user_id,expires_at=expiry(payload.days),banned_by=user.id,reason=payload.reason); db.add(row)
        audit(db,user,"chat_ban",{"days":payload.days,"reason":payload.reason},target_user_id=user_id); db.commit(); return {"banned":True,"expires_at":row.expires_at}

    @router.delete("/users/{user_id}/chat-ban")
    def unchat_ban(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"UA"); rows=db.scalars(select(ChatBan).where(ChatBan.user_id==user_id,ChatBan.active.is_(True))).all()
        for x in rows:x.active=False
        audit(db,user,"chat_unban",target_user_id=user_id);db.commit();return {"unbanned":True}

    @router.post("/rooms/{room_id}/ban")
    def room_ban(room_id:str,payload:BanRequest,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"UA"); room=db.get(Room,room_id) or db.scalar(select(Room).where(Room.public_id==room_id))
        if not room: raise HTTPException(status_code=404,detail="Oda bulunamadı")
        row=RoomAdminBan(room_id=room.id,expires_at=expiry(payload.days),banned_by=user.id,reason=payload.reason);db.add(row)
        audit(db,user,"room_ban",{"days":payload.days,"reason":payload.reason},target_room_id=room.id,target_id=room.public_id);db.commit();return {"banned":True,"expires_at":row.expires_at,"room_id":room.id,"public_id":room.public_id}

    @router.delete("/rooms/{room_id}/ban")
    def room_unban(room_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"UA"); room=db.get(Room,room_id) or db.scalar(select(Room).where(Room.public_id==room_id))
        if not room: raise HTTPException(status_code=404,detail="Oda bulunamadı")
        rows=db.scalars(select(RoomAdminBan).where(RoomAdminBan.room_id==room.id,RoomAdminBan.active.is_(True))).all()
        for x in rows:x.active=False
        audit(db,user,"room_unban",target_room_id=room.id,target_id=room.public_id);db.commit();return {"unbanned":True}

    @router.post("/users/{user_id}/vip")
    def vip_update(user_id:str,payload:VipUpdate,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"DA");target=db.get(User,user_id)
        if not target: raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        vip=db.get(VipStatus,user_id)
        if not vip: vip=VipStatus(user_id=user_id,level=payload.level,total_spent=0);db.add(vip)
        before=vip.level;vip.level=payload.level
        audit(db,user,"vip_update",{"before":before,"after":payload.level},target_user_id=user_id);db.commit()
        return {"level":vip.level,"total_spent":vip.total_spent}

    @router.get("/roles")
    def roles(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"DA")
        rows=db.scalars(select(AdminRole).order_by(AdminRole.created_at)).all()
        return [{"user_id":r.user_id,"role":r.role,"ghost_mode":r.ghost_mode,"created_at":r.created_at} for r in rows]

    @router.put("/roles")
    def set_role(payload:RoleUpdate,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"DA");target=db.get(User,payload.user_id)
        if not target: raise HTTPException(status_code=404,detail="Kullanıcı bulunamadı")
        row=db.get(AdminRole,payload.user_id)
        if not row: row=AdminRole(user_id=payload.user_id,role=payload.role,granted_by=user.id);db.add(row)
        else: row.role=payload.role;row.granted_by=user.id
        audit(db,user,"role_grant",{"role":payload.role},target_user_id=payload.user_id);db.commit()
        return {"user_id":payload.user_id,"role":row.role}

    @router.delete("/roles/{user_id}")
    def remove_role(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require_role(db,user,"DA");row=db.get(AdminRole,user_id)
        if not row: raise HTTPException(status_code=404,detail="Admin yetkisi bulunamadı")
        db.delete(row);audit(db,user,"role_revoke",target_user_id=user_id);db.commit();return {"removed":True}

    return router
