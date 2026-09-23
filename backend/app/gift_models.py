from __future__ import annotations
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .db import Base

class GiftItem(Base):
    __tablename__ = "gift_items"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    price = Column(Integer, nullable=False)  # Coin/Kredi değeri
    tier = Column(Integer, default=1)        # 1-10 kademe
    animation_level = Column(String, default="none") # none, standard, high, announcement
    icon_url = Column(String, nullable=True)

class GiftTransaction(Base):
    __tablename__ = "gift_transactions"
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=True)
    gift_id = Column(Integer, ForeignKey("gift_items.id"), nullable=False)
    quantity = Column(Integer, default=1)
    total_price = Column(Integer, nullable=False)
    idempotency_key = Column(String, unique=True, nullable=True) # Tekrar işlenmeyi önleme
    created_at = Column(DateTime, default=datetime.utcnow)

class UserProfileGift(Base):
    __tablename__ = "user_profile_gifts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False) # Hedefi alan profil
    gift_id = Column(Integer, ForeignKey("gift_items.id"), nullable=False)
    count = Column(Integer, default=1)

class GiftAuditLog(Base):
    __tablename__ = "gift_audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("gift_transactions.id"), nullable=False)
    details = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
