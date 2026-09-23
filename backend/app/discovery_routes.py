from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from .db import get_db
from .session import get_user_from_token

router = APIRouter(prefix="/v1/discovery", tags=["Discovery System"])

class LocationUpdate(BaseModel):
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    hide_exact_location: bool | None = True

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

@router.get("/users")
def discover_users(gender: str | None = None, city: str | None = None, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    query = "SELECT id, username, avatar_asset, bio FROM users WHERE id != :uid"
    params = {"uid": user.id}
    
    if gender and gender in ["female", "male"]:
        try:
            query += " AND gender = :gender"
            params["gender"] = gender
        except Exception:
            pass
            
    if city:
        try:
            query += " AND city = :city"
            params["city"] = city
        except Exception:
            pass
            
    query += " LIMIT 30"
    rows = db.execute(text(query), params).mappings().all()
    return {"status": "success", "users": [dict(r) for r in rows]}

@router.get("/rooms")
def discover_rooms(db: Session = Depends(get_db)):
    try:
        rows = db.execute(text("SELECT id, name, owner_id FROM chat_rooms LIMIT 20")).mappings().all()
        rooms = [dict(r) for r in rows]
    except Exception:
        rooms = []
    return {"status": "success", "rooms": rooms}

@router.get("/random-user")
def random_user(authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    try:
        row = db.execute(
            text("SELECT id, username, avatar_asset, bio FROM users WHERE id != :uid ORDER BY RANDOM() LIMIT 1"),
            {"uid": user.id}
        ).mappings().first()
        rand_user = dict(row) if row else None
    except Exception:
        rand_user = None
    return {"status": "success", "user": rand_user}

@router.get("/random-room")
def random_room(db: Session = Depends(get_db)):
    try:
        row = db.execute(text("SELECT id, name, owner_id FROM chat_rooms ORDER BY RANDOM() LIMIT 1")).mappings().first()
        room = dict(row) if row else None
    except Exception:
        room = None
    return {"status": "success", "room": room}

@router.post("/location")
def update_location(payload: LocationUpdate, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    try:
        db.execute(
            text("UPDATE users SET city=:city, latitude=:lat, longitude=:lon, hide_exact_location=:hide WHERE id=:uid"),
            {
                "city": payload.city,
                "lat": payload.latitude,
                "lon": payload.longitude,
                "hide": 1 if payload.hide_exact_location else 0,
                "uid": user.id
            }
        )
        db.commit()
    except Exception:
        db.rollback()
    return {"status": "success", "message": "Konum ve gizlilik ayarları güncellendi"}
