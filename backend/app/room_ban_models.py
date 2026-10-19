"""Timed, individually reversible bans of one user in one room."""
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class RoomUserBan(Base):
    __tablename__='room_user_admin_bans'
    id: Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    room_id: Mapped[str]=mapped_column(ForeignKey('rooms.id'),index=True,nullable=False)
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id'),index=True,nullable=False)
    banned_by: Mapped[str]=mapped_column(ForeignKey('users.id'),nullable=False)
    expires_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
    active: Mapped[bool]=mapped_column(Boolean,default=True,nullable=False)
    reason: Mapped[str]=mapped_column(Text,nullable=False)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now(),nullable=False)

class RoomBanRequestBinding(Base):
    __tablename__='room_ban_request_bindings'
    id: Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    approval_id: Mapped[int]=mapped_column(ForeignKey('ban_approvals.id'),unique=True,nullable=False)
    ban_id: Mapped[int|None]=mapped_column(ForeignKey('room_user_admin_bans.id'),unique=True,nullable=True)

class BanRestrictionReason(Base):
    __tablename__='ban_restriction_reasons'
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id'),primary_key=True)
    message: Mapped[str]=mapped_column(String(250),nullable=False)
