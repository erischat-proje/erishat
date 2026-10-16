"""Visibility of personal fan lists and received gifts, enforced server-side."""
from fastapi import HTTPException
from .platform_models import UserSocialPrivacy


def social_flags(db, owner_id, viewer_id):
    if owner_id == viewer_id:
        return {"fans_hidden": False, "gifts_hidden": False}
    row = db.get(UserSocialPrivacy, owner_id)
    return {"fans_hidden": bool(row and row.hide_fans), "gifts_hidden": bool(row and row.hide_received_gifts)}


def require_social_visible(db, owner_id, viewer_id, section):
    flags = social_flags(db, owner_id, viewer_id)
    if flags[section + "_hidden"]:
        raise HTTPException(status_code=403, detail="Bu kullanıcı hayran listesini gizlemiş." if section == "fans" else "Bu kullanıcı aldığı hediyeleri gizlemiş.")
    return flags
