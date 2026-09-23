from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from .db import get_db
from .session import get_user_from_token
from .platform_models import VipStatus

router = APIRouter(prefix="/v1/profile", tags=["Profile System"])

class ProfileUpdate(BaseModel):
    bio: str | None = None
    avatar_asset: str | None = None
    frame_asset: str | None = None
    show_vip: bool | None = True
    show_badges: bool | None = True
    show_neon: bool | None = True
    show_title: bool | None = True
    privacy_settings: dict | None = None

@router.get("/me")
def get_my_profile(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")

    vip = db.get(VipStatus, user.id)
    vip_level = int(vip.level) if vip and vip.level else 0

    return {
        "status": "success",
        "user_id": user.id,
        "username": getattr(user, "username", "Kullanıcı"),
        "bio": getattr(user, "bio", ""),
        "avatar_asset": getattr(user, "avatar_asset", "default_avatar"),
        "frame_asset": getattr(user, "frame_asset", None),
        "vip_level": vip_level,
        "fan_level": getattr(user, "fan_level", 1),
        "followers_count": getattr(user, "followers_count", 0),
        "following_count": getattr(user, "following_count", 0),
        "settings": {
            "show_vip": getattr(user, "show_vip", True),
            "show_badges": getattr(user, "show_badges", True),
            "show_neon": getattr(user, "show_neon", True),
            "show_title": getattr(user, "show_title", True)
        }
    }

@router.put("/me")
def update_my_profile(payload: ProfileUpdate, authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")

    # Güncelleme mantığı
    update_fields = []
    params = {"uid": user.id}

    if payload.bio is not None:
        update_fields.append("bio=:bio")
        params["bio"] = payload.bio
    if payload.avatar_asset is not None:
        update_fields.append("avatar_asset=:avatar")
        params["avatar"] = payload.avatar_asset
    if payload.frame_asset is not None:
        update_fields.append("frame_asset=:frame")
        params["frame"] = payload.frame_asset
    if payload.show_vip is not None:
        update_fields.append("show_vip=:svip")
        params["svip"] = payload.show_vip
    if payload.show_badges is not None:
        update_fields.append("show_badges=:sbadg")
        params["sbadg"] = payload.show_badges
    if payload.show_neon is not None:
        update_fields.append("show_neon=:sneon")
        params["sneon"] = payload.show_neon
    if payload.show_title is not None:
        update_fields.append("show_title=:stitle")
        params["stitle"] = payload.show_title

    if update_fields:
        query = f"UPDATE users SET {', '.join(update_fields)} WHERE id=:uid"
        db.execute(text(query), params)
        db.commit()

    return {"status": "success", "message": "Profil başarıyla güncellendi"}
