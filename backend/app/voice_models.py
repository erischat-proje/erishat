from __future__ import annotations
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, func
from .db import Base

class RoomMicSeat(Base):
    __tablename__ = "room_mic_seats"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    room_id = Column(String(64), index=True, nullable=False)
    seat_index = Column(Integer, nullable=False)  # 0 ile 8 arası koltuklar
    user_id = Column(String(64), ForeignKey("users.id"), nullable=True)
    is_muted = Column(Boolean, default=False)
    is_locked = Column(Boolean, default=False)  # Oda sahibi tarafından kilitlenebilir
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
