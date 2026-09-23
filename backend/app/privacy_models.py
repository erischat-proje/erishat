from __future__ import annotations
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, func
from .db import Base

class UserPrivacySettings(Base):
    __tablename__ = "user_privacy_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(64), ForeignKey("users.id"), unique=True, index=True, nullable=False)
    
    # Görünürlük Tercihleri (334 - 338)
    vip_visible = Column(Boolean, default=True)
    badge_visible = Column(Boolean, default=True)
    neon_visible = Column(Boolean, default=True)
    title_visible = Column(Boolean, default=True)
    entry_effect_visible = Column(Boolean, default=True)
    
    # Mahremiyet ve Erişim Tercihleri (339 - 344)
    location_hidden = Column(Boolean, default=False)
    dm_privacy = Column(String(32), default="everyone")  # everyone, followers, nobody
    discovery_hidden = Column(Boolean, default=False)
    avatar_hidden = Column(Boolean, default=False)
    followers_hidden = Column(Boolean, default=False)
    fans_hidden = Column(Boolean, default=False)
    
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
