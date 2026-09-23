from __future__ import annotations
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, func
from .db import Base

class UserBlock(Base):
    __tablename__ = "user_blocks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    blocker_id = Column(String(64), ForeignKey("users.id"), index=True, nullable=False)
    blocked_id = Column(String(64), ForeignKey("users.id"), index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ContentReport(Base):
    __tablename__ = "content_reports"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    reporter_id = Column(String(64), ForeignKey("users.id"), index=True, nullable=False)
    target_type = Column(String(32), nullable=False)  # user, room, message
    target_id = Column(String(64), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(32), default="pending")  # pending, resolved, dismissed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class UserBan(Base):
    __tablename__ = "user_bans"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(64), ForeignKey("users.id"), index=True, nullable=False)
    ban_type = Column(String(32), nullable=False)  # global, chat, room, device
    room_id = Column(String(64), nullable=True)     # Oda banı için
    device_id = Column(String(128), nullable=True) # Device ban için
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    admin_id = Column(String(64), ForeignKey("users.id"), index=True, nullable=False)
    action = Column(String(128), nullable=False)
    target_detail = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
