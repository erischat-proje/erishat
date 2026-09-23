from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .room_models import Room, RoomMember, RoomRole, RoomBan, RoomKick, RoomModerationLog

router = APIRouter(prefix="/rooms", tags=["Rooms & Moderation"])

class RoomActionRequest(BaseModel):
    user_id: int
    target_user_id: int
    reason: str | None = "Yetersiz moderasyon standartları"

def verify_moderator(db: Session, room_id: int, user_id: int) -> RoomMember:
    member = db.query(RoomMember).filter(
        RoomMember.room_id == room_id,
        RoomMember.user_id == user_id
    ).first()
    
    if not member or member.role not in [RoomRole.OWNER, RoomRole.ADMIN, RoomRole.MODERATOR]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu odada moderatör yetkiniz bulunmamaktadır."
        )
    return member

@router.post("/{room_id}/kick")
def kick_user_from_room(room_id: int, payload: RoomActionRequest, db: Session = Depends(get_db)):
    verify_moderator(db, room_id, payload.user_id)
    
    # Hedef üye odada mı kontrol et
    target_member = db.query(RoomMember).filter(
        RoomMember.room_id == room_id,
        RoomMember.user_id == payload.target_user_id
    ).first()
    
    if not target_member:
        raise HTTPException(status_code=404, detail="Hedef kullanıcı odada bulunamadı.")
        
    # Owner veya admin kicklenemez (kural koruması)
    if target_member.role in [RoomRole.OWNER, RoomRole.ADMIN]:
        raise HTTPException(status_code=400, detail="Oda sahibi veya yöneticileri atamazsınız.")

    # Üyeyi odadan çıkar (RoomMember kaydını sil)
    db.delete(target_member)
    
    # Kick tablosuna ekle (Tekrar giriş engeli için)
    kick_record = RoomKick(
        room_id=room_id,
        user_id=payload.target_user_id,
        kicked_by=payload.user_id,
        reason=payload.reason
    )
    db.add(kick_record)
    
    # Audit Log kaydet
    audit = RoomModerationLog(
        room_id=room_id,
        moderator_id=payload.user_id,
        target_user_id=payload.target_user_id,
        action="KICK",
        details=f"Sebep: {payload.reason}"
    )
    db.add(audit)
    db.commit()
    
    return {"status": "success", "message": "Kullanıcı odadan başarıyla atıldı."}

@router.post("/{room_id}/ban")
def ban_user_from_room(room_id: int, payload: RoomActionRequest, db: Session = Depends(get_db)):
    verify_moderator(db, room_id, payload.user_id)
    
    existing_ban = db.query(RoomBan).filter(
        RoomBan.room_id == room_id,
        RoomBan.user_id == payload.target_user_id
    ).first()
    
    if existing_ban:
        raise HTTPException(status_code=400, detail="Kullanıcı bu odadan zaten banlanmış.")
        
    new_ban = RoomBan(
        room_id=room_id,
        user_id=payload.target_user_id,
        banned_by=payload.user_id,
        reason=payload.reason
    )
    db.add(new_ban)
    
    # Eğer odadaysa üyelikten de çıkar
    target_member = db.query(RoomMember).filter(
        RoomMember.room_id == room_id,
        RoomMember.user_id == payload.target_user_id
    ).first()
    if target_member:
        db.delete(target_member)
        
    # Audit Log
    audit = RoomModerationLog(
        room_id=room_id,
        moderator_id=payload.user_id,
        target_user_id=payload.target_user_id,
        action="BAN",
        details=f"Sebep: {payload.reason}"
    )
    db.add(audit)
    db.commit()
    
    return {"status": "success", "message": "Kullanıcı odadan kalıcı olarak banlandı."}

@router.post("/{room_id}/unban")
def unban_user_from_room(room_id: int, payload: RoomActionRequest, db: Session = Depends(get_db)):
    verify_moderator(db, room_id, payload.user_id)
    
    ban_record = db.query(RoomBan).filter(
        RoomBan.room_id == room_id,
        RoomBan.user_id == payload.target_user_id
    ).first()
    
    if not ban_record:
        raise HTTPException(status_code=404, detail="Ban kaydı bulunamadı.")
        
    db.delete(ban_record)
    
    # Audit Log
    audit = RoomModerationLog(
        room_id=room_id,
        moderator_id=payload.user_id,
        target_user_id=payload.target_user_id,
        action="UNBAN",
        details="Ban kaldırıldı."
    )
    db.add(audit)
    db.commit()
    
    return {"status": "success", "message": "Kullanıcının banı başarıyla kaldırıldı."}

@router.get("/{room_id}/kicked-users")
def get_kicked_users(room_id: int, user_id: int, db: Session = Depends(get_db)):
    verify_moderator(db, room_id, user_id)
    kicks = db.query(RoomKick).filter(RoomKick.room_id == room_id).all()
    return {"status": "success", "kicked_users": [{"user_id": k.user_id, "kicked_by": k.kicked_by, "reason": k.reason, "created_at": k.created_at} for k in kicks]}

@router.get("/{room_id}/banned-users")
def get_banned_users(room_id: int, user_id: int, db: Session = Depends(get_db)):
    verify_moderator(db, room_id, user_id)
    bans = db.query(RoomBan).filter(RoomBan.room_id == room_id).all()
    return {"status": "success", "banned_users": [{"user_id": b.user_id, "banned_by": b.banned_by, "reason": b.reason, "created_at": b.created_at} for b in bans]}

@router.get("/{room_id}/audit-logs")
def get_moderation_logs(room_id: int, user_id: int, db: Session = Depends(get_db)):
    verify_moderator(db, room_id, user_id)
    logs = db.query(RoomModerationLog).filter(RoomModerationLog.room_id == room_id).order_by(RoomModerationLog.id.desc()).all()
    return {"status": "success", "logs": [{"id": l.id, "moderator_id": l.moderator_id, "target_user_id": l.target_user_id, "action": l.action, "details": l.details, "created_at": l.created_at} for l in logs]}

@router.post("/{room_id}/join")
def join_room(room_id: int, payload: dict, db: Session = Depends(get_db)):
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id gereklidir.")
        
    # Ban kontrolü
    is_banned = db.query(RoomBan).filter(RoomBan.room_id == room_id, RoomBan.user_id == user_id).first()
    if is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu odadan banlandınız.")
        
    # Atılma (Kick) kontrolü - Tekrar giriş engeli ve mesaj
    is_kicked = db.query(RoomKick).filter(RoomKick.room_id == room_id, RoomKick.user_id == user_id).first()
    if is_kicked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu odadan atıldınız.")
        
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Oda bulunamadı.")
        
    existing_member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == user_id).first()
    if existing_member:
        return {"status": "success", "message": "Zaten odadasınız."}
        
    new_member = RoomMember(room_id=room_id, user_id=user_id, role=RoomRole.MEMBER)
    db.add(new_member)
    db.commit()
    
    return {"status": "success", "message": "Odaya başarıyla giriş yapıldı."}
