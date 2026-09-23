from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from .db import get_db
from .session import get_user_from_token

router = APIRouter(prefix="/v1", tags=["Follow & Fan System"])

class FollowRequest(BaseModel):
    target_user_id: str

FAN_LEVELS = [
    {"level": 1, "min_lidya": 0, "title": "Acemi Hayran"},
    {"level": 2, "min_lidya": 500, "title": "Takipçi"},
    {"level": 3, "min_lidya": 2_000, "title": "Sadık Hayran"},
    {"level": 4, "min_lidya": 5_000, "title": "Süper Hayran"},
    {"level": 5, "min_lidya": 15_000, "title": "Elit Hayran"},
    {"level": 6, "min_lidya": 30_000, "title": "VIP Hayran"},
    {"level": 7, "min_lidya": 75_000, "title": "Efsane Hayran"},
    {"level": 8, "min_lidya": 150_000, "title": "Kral Hayran"},
    {"level": 9, "min_lidya": 300_000, "title": "İmparatorluk Muhafızı"},
    {"level": 10, "min_lidya": 1_000_000, "title": "Eris Tanrısı"}
]

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

@router.post("/follow")
def follow_user(payload: FollowRequest, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    target_id = payload.target_user_id
    if user.id == target_id:
        raise HTTPException(status_code=400, detail="Kendinizi takip edemezsiniz")
    
    exists = db.execute(
        text("SELECT 1 FROM follows WHERE follower_id=:uid AND following_id=:tid"),
        {"uid": user.id, "tid": target_id}
    ).first()
    if exists:
        return {"status": "success", "message": "Zaten takip ediyorsunuz"}
    
    db.execute(
        text("INSERT INTO follows (follower_id, following_id) VALUES (:uid, :tid)"),
        {"uid": user.id, "tid": target_id}
    )
    db.commit()
    return {"status": "success", "message": "Kullanıcı takip edildi"}

@router.post("/unfollow")
def unfollow_user(payload: FollowRequest, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    target_id = payload.target_user_id
    
    db.execute(
        text("DELETE FROM follows WHERE follower_id=:uid AND following_id=:tid"),
        {"uid": user.id, "tid": target_id}
    )
    db.commit()
    return {"status": "success", "message": "Takipten çıkıldı"}

@router.get("/followers")
def list_followers(authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    rows = db.execute(
        text("SELECT u.id, u.username, u.avatar_asset FROM follows f JOIN users u ON f.follower_id = u.id WHERE f.following_id=:uid"),
        {"uid": user.id}
    ).mappings().all()
    return {"status": "success", "followers": [dict(r) for r in rows]}

@router.get("/following")
def list_following(authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    rows = db.execute(
        text("SELECT u.id, u.username, u.avatar_asset FROM follows f JOIN users u ON f.following_id = u.id WHERE f.follower_id=:uid"),
        {"uid": user.id}
    ).mappings().all()
    return {"status": "success", "following": [dict(r) for r in rows]}

@router.get("/fan/levels")
def get_fan_levels():
    return {"status": "success", "levels": FAN_LEVELS}

@router.get("/donors/top30")
def get_top_donors(db: Session = Depends(get_db)):
    try:
        query = """
            SELECT sender_id as user_id, SUM(total_price) as total_lidya, COUNT(*) as gift_count 
            FROM gift_transactions 
            GROUP BY sender_id 
            ORDER BY total_lidya DESC 
            LIMIT 30
        """
        rows = db.execute(text(query)).mappings().all()
        donors = [dict(r) for r in rows]
    except Exception:
        donors = []
    return {"status": "success", "donors": donors}
