from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .session import get_user_from_token
from .privacy_models import UserPrivacySettings

router = APIRouter(prefix="/v1/privacy", tags=["Privacy & Settings"])

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

@router.get("/settings")
def get_privacy_settings(authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    settings = db.scalar(select(UserPrivacySettings).where(UserPrivacySettings.user_id == user.id))
    if not settings:
        settings = UserPrivacySettings(user_id=user.id)
        db.add(settings)
        db.flush()
        
    return {
        "status": "success",
        "settings": {
            "vip_visible": settings.vip_visible,
            "badge_visible": settings.badge_visible,
            "neon_visible": settings.neon_visible,
            "title_visible": settings.title_visible,
            "entry_effect_visible": settings.entry_effect_visible,
            "location_hidden": settings.location_hidden,
            "dm_privacy": settings.dm_privacy,
            "discovery_hidden": settings.discovery_hidden,
            "avatar_hidden": settings.avatar_hidden,
            "followers_hidden": settings.followers_hidden,
            "fans_hidden": settings.fans_hidden
        }
    }

@router.put("/settings")
def update_privacy_settings(
    vip_visible: bool | None = None,
    badge_visible: bool | None = None,
    neon_visible: bool | None = None,
    title_visible: bool | None = None,
    entry_effect_visible: bool | None = None,
    location_hidden: bool | None = None,
    dm_privacy: str | None = None,
    discovery_hidden: bool | None = None,
    avatar_hidden: bool | None = None,
    followers_hidden: bool | None = None,
    fans_hidden: bool | None = None,
    authorization: str | None = None,
    db: Session = Depends(get_db)
):
    user = get_current_user(authorization, db)
    settings = db.scalar(select(UserPrivacySettings).where(UserPrivacySettings.user_id == user.id))
    if not settings:
        settings = UserPrivacySettings(user_id=user.id)
        db.add(settings)
        
    if vip_visible is not None: settings.vip_visible = vip_visible
    if badge_visible is not None: settings.badge_visible = badge_visible
    if neon_visible is not None: settings.neon_visible = neon_visible
    if title_visible is not None: settings.title_visible = title_visible
    if entry_effect_visible is not None: settings.entry_effect_visible = entry_effect_visible
    if location_hidden is not None: settings.location_hidden = location_hidden
    if dm_privacy is not None:
        if dm_privacy not in ["everyone", "followers", "nobody"]:
            raise HTTPException(status_code=400, detail="Geçersiz DM gizlilik seviyesi.")
        settings.dm_privacy = dm_privacy
    if discovery_hidden is not None: settings.discovery_hidden = discovery_hidden
    if avatar_hidden is not None: settings.avatar_hidden = avatar_hidden
    if followers_hidden is not None: settings.followers_hidden = followers_hidden
    if fans_hidden is not None: settings.fans_hidden = fans_hidden
    
    db.flush()
    return {"status": "success", "message": "Gizlilik ayarları başarıyla güncellendi."}
