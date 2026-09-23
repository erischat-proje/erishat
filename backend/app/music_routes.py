from __future__ import annotations
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from .session import get_user_from_token
from .music_models import UserMusicTrack, RoomMusicQueue
from .ledger_engine import process_ledger_transaction

router = APIRouter(prefix="/v1/music", tags=["Music & Streaming System"])

UPLOAD_DIR = "backend/uploads/music"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

@router.post("/upload")
def upload_music(
    title: str = Form(...),
    file: UploadFile = File(...),
    authorization: str | None = None,
    db: Session = Depends(get_db)
):
    user = get_current_user(authorization, db)
    
    # 1. 10 Parça Sınırı Kontrolü
    track_count = db.scalar(
        select(func.count(UserMusicTrack.id)).where(UserMusicTrack.user_id == user.id)
    ) or 0
    
    if track_count >= 10:
        raise HTTPException(status_code=400, detail="Maksimum 10 parça yükleme sınırına ulaştınız.")
        
    # 2. Müzik Ödeme Sistemi (Ledger Entegrasyonu - Örn: 50 Lidya yükleme ücreti)
    upload_fee = 50
    idempotency_key = f"music_upload_{user.id}_{file.filename}_{track_count + 1}"
    try:
        process_ledger_transaction(
            db=db,
            user_id=user.id,
            module="music",
            action="debit",
            amount=upload_fee,
            idempotency_key=idempotency_key,
            description=f"Music track upload fee: {title}"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # 3. Gerçek Depolama (Dosyayı diske kaydetme)
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ".mp3"
    safe_filename = f"user_{user.id}_track_{track_count + 1}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    file_size = os.path.getsize(file_path)
    file_url = f"/uploads/music/{safe_filename}"
    
    # 4. Veritabanına kayıt
    track = UserMusicTrack(
        user_id=user.id,
        title=title,
        file_url=file_url,
        file_size=file_size,
        duration=180  # Standart varsayılan süre
    )
    db.add(track)
    db.flush()
    
    return {
        "status": "success",
        "message": "Parça başarıyla yüklendi ve depolandı.",
        "track_id": track.id,
        "title": track.title,
        "file_url": track.file_url,
        "remaining_slots": 10 - (track_count + 1)
    }

@router.get("/tracks")
def list_user_tracks(authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    tracks = db.scalars(
        select(UserMusicTrack).where(UserMusicTrack.user_id == user.id)
    ).all()
    
    return {
        "status": "success",
        "total": len(tracks),
        "tracks": [
            {
                "id": t.id,
                "title": t.title,
                "file_url": t.file_url,
                "file_size": t.file_size,
                "duration": t.duration,
                "created_at": str(t.created_at)
            }
            for t in tracks
        ]
    }

@router.delete("/tracks/{track_id}")
def delete_user_track(track_id: int, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    track = db.scalar(
        select(UserMusicTrack).where(UserMusicTrack.id == track_id, UserMusicTrack.user_id == user.id)
    )
    if not track:
        raise HTTPException(status_code=404, detail="Parça bulunamadı veya yetkiniz yok.")
        
    # Diskten dosyayı sil
    local_path = track.file_url.lstrip("/")
    if os.path.exists(local_path):
        os.remove(local_path)
        
    db.delete(track)
    db.flush()
    
    return {"status": "success", "message": "Parça silindi."}
