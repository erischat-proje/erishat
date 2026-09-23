from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base
import enum

class RoomRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MODERATOR = "moderator"
    MEMBER = "member"

class Room(Base):
    __tablename__ = "rooms"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    password = Column(String, nullable=True)  # Şifreli odalar için
    is_private = Column(Boolean, default=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    max_users = Column(Integer, default=50)
    created_at = Column(DateTime, default=datetime.utcnow)

    # İlişkiler
    members = relationship("RoomMember", back_populates="room", cascade="all, delete-orphan")
    bans = relationship("RoomBan", back_populates="room", cascade="all, delete-orphan")
    mutes = relationship("RoomMute", back_populates="room", cascade="all, delete-orphan")

class RoomMember(Base):
    __tablename__ = "room_members"
    
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String, default=RoomRole.MEMBER)  # owner, admin, moderator, member
    joined_at = Column(DateTime, default=datetime.utcnow)

    room = relationship("Room", back_populates="members")

class RoomBan(Base):
    __tablename__ = "room_bans"
    
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    banned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(String, nullable=True)
    banned_at = Column(DateTime, default=datetime.utcnow)

    room = relationship("Room", back_populates="bans")

class RoomMute(Base):
    __tablename__ = "room_mutes"
    
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    muted_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    muted_at = Column(DateTime, default=datetime.utcnow)

    room = relationship("Room", back_populates="mutes")


class RoomKick(Base):
    __tablename__ = "room_kicks"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    kicked_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    room = relationship("Room", back_populates="kicks")

class RoomModerationLog(Base):
    __tablename__ = "room_moderation_logs"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    moderator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)  # KICK, BAN, UNBAN, MUTE etc.
    details = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    room = relationship("Room", back_populates="moderation_logs")
