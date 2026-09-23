from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .session import get_user_from_token
from .music_models import UserMusicTrack, RoomMusicQueue

router = APIRouter(prefix="/v1/rooms", tags=["Room Music & Queue"])

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

@router.post("/{room_id}/music/queue")
def add_to_room_queue(
    room_id: str,
    track_id: int,
    authorization: str | None = None,
    db: Session = Depends(get_db)
):
    user = get_current_user(authorization, db)
    
    # Parçanın kullanıcıya ait olduğunu doğrula
    track = db.scalar(
        select(UserMusicTrack).where(UserMusicTrack.id == track_id, UserMusicTrack.user_id == user.id)
    )
    if not track:
        raise HTTPException(status_code=404, detail="Parça bulunamadı veya size ait değil.")
        
    # Kuyruktaki mevcut eleman sayısını bul
    position = db.scalar(
        select(RoomMusicQueue).where(RoomMusicQueue.room_id == room_id)
    )
    count = db.query(RoomMusicQueue).filter(RoomMusicQueue.room_id == room_id).count()
    
    queue_item = RoomMusicQueue(
        room_id=room_id,
        track_id=track_id,
        added_by=user.id,
        is_playing=(count == 0),  # İlk parçaysa otomatik çalmaya başla
        position=count
    )
    db.add(queue_item)
    db.flush()
    
    return {
        "status": "success",
        "message": "Parça oda kuyruğuna eklendi.",
        "queue_id": queue_item.id,
        "is_playing": queue_item.is_playing
    }

@router.get("/{room_id}/music/queue")
def get_room_queue(room_id: str, db: Session = Depends(get_db)):
    items = db.scalars(
        select(RoomMusicQueue)
        .where(RoomMusicQueue.room_id == room_id)
        .order_by(RoomMusicQueue.position.asc())
    ).all()
    
    queue_list = []
    for item in items:
        track = db.get(UserMusicTrack, item.track_id)
        queue_list.append({
            "queue_id": item.id,
            "track_id": item.track_id,
            "title": track.title if track else "Bilinmeyen Parça",
            "file_url": track.file_url if track else "",
            "added_by": item.added_by,
            "is_playing": item.is_playing,
            "position": item.position
        })
        
    return {
        "status": "success",
        "room_id": room_id,
        "queue": queue_list
    }

@router.delete("/{room_id}/music/queue/{queue_id}")
def remove_from_room_queue(
    room_id: str,
    queue_id: int,
    authorization: str | None = None,
    db: Session = Depends(get_db)
):
    user = get_current_user(authorization, db)
    item = db.scalar(
        select(RoomMusicQueue).where(RoomMusicQueue.id == queue_id, RoomMusicQueue.room_id == room_id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Kuyruk öğesi bulunamadı.")
        
    # Sadece ekleyen veya oda yetkilisi silebilir (Basit kontrol: ekleyen)
    if item.added_by != user.id:
        raise HTTPException(status_code=403, detail="Bu parçayı kuyruktan kaldırma yetkiniz yok.")
        
    db.delete(item)
    db.flush()
    
    return {"status": "success", "message": "Parça kuyruktan kaldırıldı."}
