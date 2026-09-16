from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class UserPrivacy(Base):
    __tablename__ = "user_privacy"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    hide_vip: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    hide_vip_badge: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    hide_vip_neon: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    hide_vip_entry: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    hide_vip_title: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    hide_location: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class VipStatus(Base):
    __tablename__ = "vip_status"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    level: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    neon_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    entry_effect: Mapped[str | None] = mapped_column(String(64), nullable=True)
    wallpaper_claimed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    knight_badge_claimed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class UserLocation(Base):
    __tablename__ = "user_locations"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    city: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class DiscoveryPreference(Base):
    __tablename__ = "discovery_preferences"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    gender_filter: Mapped[str] = mapped_column(String(16), default="any", server_default="any", nullable=False)
    random_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reporter_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    target_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    room_id: Mapped[str | None] = mapped_column(ForeignKey("rooms.id"), index=True, nullable=True)
    message_id: Mapped[int | None] = mapped_column(ForeignKey("messages.id"), index=True, nullable=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="open", server_default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Family(Base):
    __tablename__ = "families"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    balance: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    chat_conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FamilyMember(Base):
    __tablename__ = "family_members"
    __table_args__ = (UniqueConstraint("family_id", "user_id", name="uq_family_member"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FamilyDonation(Base):
    __tablename__ = "family_donations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoomAnnouncement(Base):
    __tablename__ = "room_announcements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class GameRound(Base):
    __tablename__ = "game_rounds"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    game_type: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="open", server_default="open", nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    result_key: Mapped[str | None] = mapped_column(String(32), nullable=True)


class GameBet(Base):
    __tablename__ = "game_bets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    round_id: Mapped[str] = mapped_column(ForeignKey("game_rounds.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    choice: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    payout: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FanProfile(Base):
    __tablename__ = "fan_profiles"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    fan_level: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
