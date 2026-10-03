from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class Couple(Base):
    __tablename__ = 'relationship_couples'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    male_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    female_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    level: Mapped[int] = mapped_column(Integer, default=1)
    ring: Mapped[str | None] = mapped_column(String(32), nullable=True)
    married: Mapped[bool] = mapped_column(Boolean, default=False)
    brick: Mapped[int] = mapped_column(Integer, default=0)
    wood: Mapped[int] = mapped_column(Integer, default=0)
    paint: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CoupleMember(Base):
    __tablename__ = 'relationship_members'
    # One active relationship per account, including concurrent acceptances.
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    couple_id: Mapped[str] = mapped_column(ForeignKey('relationship_couples.id'), index=True)


class LoveRequest(Base):
    __tablename__ = 'relationship_requests'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sender_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    recipient_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    couple_id: Mapped[str | None] = mapped_column(ForeignKey('relationship_couples.id'), nullable=True)
    ring: Mapped[str | None] = mapped_column(String(32), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default='pending', index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CoupleOperation(Base):
    __tablename__ = 'relationship_operations'
    __table_args__ = (UniqueConstraint('user_id', 'request_key', name='uq_relationship_operation_key'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    couple_id: Mapped[str] = mapped_column(ForeignKey('relationship_couples.id'), index=True)
    request_key: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(16))
    item: Mapped[str] = mapped_column(String(32))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    amount: Mapped[int] = mapped_column(Integer)
    request_id: Mapped[str | None] = mapped_column(ForeignKey('relationship_requests.id'), nullable=True)
    thanked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CoupleEvent(Base):
    __tablename__ = 'relationship_events'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    kind: Mapped[str] = mapped_column(String(24))
    payload: Mapped[str] = mapped_column(Text)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
