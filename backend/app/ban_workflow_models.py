"""Additional ban workflow state; existing ban tables remain compatible."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class BanWorkflow(Base):
    __tablename__ = 'ban_workflows'
    approval_id: Mapped[int] = mapped_column(ForeignKey('ban_approvals.id'), primary_key=True)
    assigned_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    skipped_json: Mapped[str] = mapped_column(Text, default='[]', nullable=False)
    evidence_json: Mapped[str] = mapped_column(Text, default='[]', nullable=False)
    requester_role: Mapped[str] = mapped_column(String(2), nullable=False)
    reviewer_role: Mapped[str | None] = mapped_column(String(2), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ban_id: Mapped[int | None] = mapped_column(ForeignKey('user_bans.id'), nullable=True, unique=True)
    thanked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    undone_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    undone_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    log_text: Mapped[str] = mapped_column(Text, default='', nullable=False)

class BanReviewSession(Base):
    __tablename__ = 'ban_review_sessions'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    pending_id: Mapped[int | None] = mapped_column(ForeignKey('ban_approvals.id'), nullable=True)

class BanPresence(Base):
    __tablename__ = 'ban_admin_presence'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    restricted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class BanEvent(Base):
    __tablename__ = 'ban_workflow_events'
    __table_args__ = (UniqueConstraint('approval_id','recipient_id','kind'),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    approval_id: Mapped[int] = mapped_column(ForeignKey('ban_approvals.id'), nullable=False)
    recipient_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True, nullable=False)
    notification_id: Mapped[int] = mapped_column(ForeignKey('notifications.id'), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class UserBrowserDevice(Base):
    __tablename__ = 'user_browser_devices'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    device_hash: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
