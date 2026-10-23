"""Paid direct-message groups, separate from family conversations."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, LargeBinary, String, Text, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class MessageGroup(Base):
    __tablename__ = 'message_groups'
    conversation_id: Mapped[str] = mapped_column(String(128), ForeignKey('conversations.id', ondelete='CASCADE'), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    request_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, default='', nullable=False)
    image: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    image_mime: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class GroupRole(Base):
    __tablename__ = 'message_group_roles'
    __table_args__ = (UniqueConstraint('conversation_id','user_id',name='uq_message_group_role'),)
    conversation_id: Mapped[str] = mapped_column(String(128), ForeignKey('message_groups.conversation_id', ondelete='CASCADE'), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default='member')

class GroupInvitation(Base):
    __tablename__ = 'message_group_invitations'
    __table_args__ = (UniqueConstraint('conversation_id','invitee_id',name='uq_message_group_invitee'),)
    conversation_id: Mapped[str] = mapped_column(String(128), ForeignKey('message_groups.conversation_id', ondelete='CASCADE'), primary_key=True)
    invitee_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    invited_by: Mapped[str] = mapped_column(String(64), ForeignKey('users.id'), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default='pending')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

# Separate tables keep upgrades compatible with existing paid groups.
from sqlalchemy import Boolean, Integer

class GroupSettings(Base):
    __tablename__ = 'message_group_settings'
    conversation_id: Mapped[str] = mapped_column(String(128), ForeignKey('message_groups.conversation_id', ondelete='CASCADE'), primary_key=True)
    closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    admins_only: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    members_can_invite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    admins_edit_info: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    slow_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

class GroupControl(Base):
    __tablename__ = 'message_group_controls'
    conversation_id: Mapped[str] = mapped_column(String(128), ForeignKey('message_groups.conversation_id', ondelete='CASCADE'), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    banned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    muted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class GroupAudit(Base):
    __tablename__ = 'message_group_audit'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(String(128), ForeignKey('message_groups.conversation_id', ondelete='CASCADE'), index=True)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
