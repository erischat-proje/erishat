from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    subject: Mapped[str] = mapped_column(String(120), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    attachments_json: Mapped[str] = mapped_column(Text, default="[]", server_default="[]", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SupportAgent(Base):
    __tablename__ = "support_live_agents"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    online_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    available_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    restricted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SupportFlow(Base):
    __tablename__ = "support_live_flows"
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), primary_key=True)
    phase: Mapped[str] = mapped_column(String(24), default="pending", nullable=False)
    offered_to: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    offer_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tier: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    not_assigned_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    snapshot: Mapped[str] = mapped_column(Text, default="", nullable=False)
    context_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    customer_read_id: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    agent_read_id: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    closed_by: Mapped[str | None] = mapped_column(String(16), nullable=True)


class SupportReview(Base):
    __tablename__ = "support_live_reviews"
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), primary_key=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SupportArchive(Base):
    __tablename__ = "support_live_archives"
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), primary_key=True)
    audit_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
