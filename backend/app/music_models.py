from __future__ import annotations
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, func
from .db import Base

class UserMusicTrack(Base):
    __tablename__ = "user_music_tracks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(64), ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String(128), nullable=False)
    file_url = Column(String(512), nullable=False)  # Gerçek depolama (S3, local vb.)
    file_size = Column(Integer, nullable=False, default=0)
    duration = Column(Integer, nullable=False, default=0)  # Saniye cinsinden
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class RoomMusicQueue(Base):
    __tablename__ = "room_music_queue"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    room_id = Column(String(64), index=True, nullable=False)
    track_id = Column(Integer, ForeignKey("user_music_tracks.id"), nullable=False)
    added_by = Column(String(64), ForeignKey("users.id"), nullable=False)
    is_playing = Column(Boolean, default=False)
    position = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
