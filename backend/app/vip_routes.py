from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from .db import get_db
from .session import get_user_from_token
from .platform_models import VipStatus

router = APIRouter(prefix="/v1/vip", tags=["VIP System"])

# 12 Kademeli VIP Harcama Eşikleri (Lidya / Coin bazlı)
VIP_SPEND_THRESHOLDS = {
    1: 1_000,
    2: 5_000,
    3: 15_000,
    4: 30_000,
    5: 60_000,
    6: 120_000,
    7: 250_000,
    8: 500_000,
    9: 1_000_000,
    10: 2_000_000,
    11: 5_000_000,
    12: 10_000_000
}

class ClaimRewardRequest(BaseModel):
    level: int

@router.get("/status")
def get_vip_status(authorization: str | None = None, db: Session = Depends(get_db)):
    # Kullanıcı doğrulama
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")

    vip = db.get(VipStatus, user.id)
    current_spent = int(vip.total_spent) if vip and vip.total_spent else 0
    current_level = int(vip.level) if vip and vip.level else 0

    # Sonraki seviye için kalan harcama hesabı
    next_level = current_level + 1
    next_threshold = VIP_SPEND_THRESHOLDS.get(next_level, None)
    remaining_spend = max(0, next_threshold - current_spent) if next_threshold else 0

    return {
        "status": "success",
        "user_id": user.id,
        "total_spent": current_spent,
        "level": current_level,
        "next_level": next_level if next_threshold else "MAX",
        "remaining_spend_for_next": remaining_spend,
        "perks": {
            "neon_name": current_level >= 3,
            "room_entry_animation": current_level >= 5,
            "room_announcement": current_level >= 8,
            "vip_wallpaper": current_level >= 10,
            "room_lock_privilege": current_level >= 6,
            "moderation_boost": current_level >= 7
        }
    }

@router.post("/claim-reward")
def claim_vip_reward(payload: ClaimRewardRequest, authorization: str | None = None, db: Session = Depends(get_db)):
    # 139. VIP ödüllerinin iki kez verilmesini engelleme (Idempotent Claim Control)
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")

    target_level = payload.level
    if target_level not in VIP_SPEND_THRESHOLDS:
        raise HTTPException(status_code=400, detail="Geçersiz VIP kademesi")

    vip = db.get(VipStatus, user.id)
    current_spent = int(vip.total_spent) if vip and vip.total_spent else 0
    required_spend = VIP_SPEND_THRESHOLDS[target_level]

    if current_spent < required_spend:
        raise HTTPException(status_code=403, detail=f"Bu kademe için yeterli harcamanız yok. Gereken: {required_spend} Lidya")

    # Ödül daha önce alındı mı tablodan kontrol edelim
    claimed_record = db.execute(
        text("SELECT 1 FROM vip_reward_claims WHERE user_id=:uid AND level=:lvl"),
        {"uid": user.id, "lvl": target_level}
    ).first()

    if claimed_record:
        raise HTTPException(status_code=409, detail=f"VIP {target_level} ödülü daha önce zaten alınmış!")

    # Ödülü kaydet (Çift kez verilmesini kesin olarak engelle)
    db.execute(
        text("INSERT INTO vip_reward_claims (user_id, level) VALUES (:uid, :lvl)"),
        {"uid": user.id, "lvl": target_level}
    )
    db.commit()

    return {
        "status": "success",
        "message": f"VIP {target_level} ödülü başarıyla tanımlandı!",
        "level": target_level,
        "claimed": True
    }
