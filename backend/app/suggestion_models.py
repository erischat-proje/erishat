from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class UserSuggestion(Base):
    __tablename__ = "user_suggestions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    read_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    thanked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SuggestionReviewSession(Base):
    __tablename__ = "suggestion_review_sessions"
    admin_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    pending_id: Mapped[int | None] = mapped_column(ForeignKey("user_suggestions.id"), nullable=True)


class SuggestionEvent(Base):
    __tablename__ = "suggestion_events"
    __table_args__ = (UniqueConstraint("suggestion_id", "kind", name="uq_suggestion_event_kind"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    suggestion_id: Mapped[int] = mapped_column(ForeignKey("user_suggestions.id", ondelete="CASCADE"), nullable=False)
    recipient_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    notification_id: Mapped[int] = mapped_column(ForeignKey("notifications.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
