from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .session import get_user_from_token
from .security_models import UserBlock, ContentReport, UserBan, AuditLog

router = APIRouter(prefix="/v1/security", tags=["Security & Moderation"])

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

# 1. Block & Unblock (302, 303)
@router.post("/block/{target_user_id}")
def block_user(target_user_id: str, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    if user.id == target_user_id:
        raise HTTPException(status_code=400, detail="Kendinizi engelleyemezsiniz.")
    
    existing = db.scalar(
        select(UserBlock).where(UserBlock.blocker_id == user.id, UserBlock.blocked_id == target_user_id)
    )
    if existing:
        return {"status": "success", "message": "Kullanıcı zaten engellenmiş."}
        
    block = UserBlock(blocker_id=user.id, blocked_id=target_user_id)
    db.add(block)
    db.flush()
    return {"status": "success", "message": "Kullanıcı engellendi."}

@router.delete("/block/{target_user_id}")
def unblock_user(target_user_id: str, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    block = db.scalar(
        select(UserBlock).where(UserBlock.blocker_id == user.id, UserBlock.blocked_id == target_user_id)
    )
    if not block:
        raise HTTPException(status_code=404, detail="Engil kaydı bulunamadı.")
        
    db.delete(block)
    db.flush()
    return {"status": "success", "message": "Kullanıcının engeli kaldırıldı."}

# 2. Raporlama (304, 305, 306, 307, 308)
@router.post("/report")
def create_report(
    target_type: str,  # user, room, message
    target_id: str,
    reason: str,
    authorization: str | None = None,
    db: Session = Depends(get_db)
):
    user = get_current_user(authorization, db)
    if target_type not in ["user", "room", "message"]:
        raise HTTPException(status_code=400, detail="Geçersiz hedef türü.")
        
    report = ContentReport(
        reporter_id=user.id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        status="pending"
    )
    db.add(report)
    db.flush()
    return {"status": "success", "message": "Rapor başarıyla oluşturuldu.", "report_id": report.id}

@router.get("/reports/history")
def get_report_history(authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    reports = db.scalars(
        select(ContentReport).where(ContentReport.reporter_id == user.id).order_by(ContentReport.created_at.desc())
    ).all()
    return {"status": "success", "reports": [{"id": r.id, "type": r.target_type, "target_id": r.target_id, "status": r.status} for r in reports]}

@router.get("/admin/reports")
def get_admin_report_queue(authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    # Basit admin yetki kontrolü
    if getattr(user, "role", "user") not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Yetkiniz yok.")
        
    reports = db.scalars(
        select(ContentReport).where(ContentReport.status == "pending").order_by(ContentReport.created_at.asc())
    ).all()
    return {"status": "success", "queue": [{"id": r.id, "reporter": r.reporter_id, "type": r.target_type, "target_id": r.target_id, "reason": r.reason} for r in reports]}

# 3. Ban Yönetimi (309, 310, 311, 312, 313)
@router.post("/ban")
def ban_user(
    user_id: str,
    ban_type: str,  # global, chat, room, device
    room_id: str | None = None,
    device_id: str | None = None,
    reason: str | None = None,
    authorization: str | None = None,
    db: Session = Depends(get_db)
):
    admin = get_current_user(authorization, db)
    if getattr(admin, "role", "user") not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Ban yetkiniz yok.")
        
    ban = UserBan(
        user_id=user_id,
        ban_type=ban_type,
        room_id=room_id,
        device_id=device_id,
        reason=reason
    )
    db.add(ban)
    
    # Audit log kaydet (316)
    audit = AuditLog(
        admin_id=admin.id,
        action=f"BAN_{ban_type.upper()}",
        target_detail=f"User: {user_id}, Room: {room_id}, Reason: {reason}"
    )
    db.add(audit)
    db.flush()
    
    return {"status": "success", "message": f"{ban_type} ban başarıyla uygulandı."}

@router.delete("/ban/{ban_id}")
def unban_user(ban_id: int, authorization: str | None = None, db: Session = Depends(get_db)):
    admin = get_current_user(authorization, db)
    if getattr(admin, "role", "user") not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Yetkiniz yok.")
        
    ban = db.get(UserBan, ban_id)
    if not ban:
        raise HTTPException(status_code=404, detail="Ban kaydı bulunamadı.")
        
    db.delete(ban)
    
    audit = AuditLog(
        admin_id=admin.id,
        action="UNBAN",
        target_detail=f"Ban ID: {ban_id}, User: {ban.user_id}"
    )
    db.add(audit)
    db.flush()
    
    return {"status": "success", "message": "Ban kaldırıldı."}
