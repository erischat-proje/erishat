"""Keşfet/Story moderation records; imported on startup before Base.create_all."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class SafetyReview(Base):
    __tablename__ = 'safety_reviews'
    __table_args__ = (UniqueConstraint('user_id', 'sha256', name='uq_safety_user_file'),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    surface: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str] = mapped_column(String(64), default='sexual', nullable=False)
    score: Mapped[str] = mapped_column(String(32), default='', nullable=False)
    status: Mapped[str] = mapped_column(String(24), default='pending', nullable=False)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    second_reviewer_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SafetySuspension(Base):
    __tablename__ = 'safety_suspensions'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True, nullable=False)
    review_id: Mapped[int] = mapped_column(ForeignKey('safety_reviews.id', ondelete='CASCADE'), unique=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
