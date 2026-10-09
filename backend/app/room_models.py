from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Room(Base):
    __tablename__ = "rooms"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    public_id: Mapped[str] = mapped_column(String(12), unique=True, index=True, nullable=False)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    seat_count: Mapped[int] = mapped_column(Integer, default=16, server_default="16", nullable=False)
    seat_layout_version: Mapped[int] = mapped_column(Integer, default=2, server_default="2", nullable=False)
    theme: Mapped[str] = mapped_column(String(32), default="normal", server_default="normal", nullable=False)
    chat_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    lock_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)



class RoomInvitation(Base):
    __tablename__ = "room_invitations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    recipient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending", nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoomMember(Base):
    __tablename__ = "room_members"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_member"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    ghost: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoomFollow(Base):
    __tablename__ = "room_follows"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_follow"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoomModerator(Base):
    __tablename__ = "room_moderators"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_moderator"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoomBan(Base):
    __tablename__ = "room_bans"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_ban"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    banned_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoomChatMute(Base):
    __tablename__ = "room_chat_mutes"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_chat_mute"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    muted_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoomSeat(Base):
    __tablename__ = "room_seats"
    __table_args__ = (UniqueConstraint("room_id", "seat_number", name="uq_room_seat"), UniqueConstraint("room_id", "user_id", name="uq_room_user_seat"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    seat_number: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    muted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)


class RoomGiftEvent(Base):
    __tablename__ = "room_gift_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    recipient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    gift_key: Mapped[str] = mapped_column(String(64), nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    total_price: Mapped[int] = mapped_column(Integer, nullable=False)
    recipient_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    recipient_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoomMusicAccess(Base):
    __tablename__ = "room_music_access"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class RoomMusic(Base):
    __tablename__ = "room_music"
    __table_args__ = (UniqueConstraint("room_id", "user_id", "slot", name="uq_room_music_slot"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    slot: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    audio_bytes: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True, nullable=True)
    audio_mime: Mapped[str | None] = mapped_column(String(32), nullable=True)
    paid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_playing: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    position_seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoomChatMessage(Base):
    __tablename__ = "room_chat_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoomPassword(Base):
    __tablename__ = "room_passwords"
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class RoomWallpaper(Base):
    __tablename__ = "room_wallpapers"
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True)
    asset_key: Mapped[str] = mapped_column(String(255), nullable=False)
    paid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class RoomWallpaperState(Base):
    __tablename__ = "room_wallpaper_states"
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True)
    applied: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
