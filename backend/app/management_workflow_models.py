"""Persistent evidence and independent management review records."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, BigInteger, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class ManagementEvidence(Base):
    __tablename__='management_evidence'
    id:Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    case_id:Mapped[int]=mapped_column(ForeignKey('management_cases.id'),index=True)
    actor_id:Mapped[str]=mapped_column(ForeignKey('users.id'))
    mime:Mapped[str]=mapped_column(String(32))
    data:Mapped[str]=mapped_column(Text)
    sha256:Mapped[str]=mapped_column(String(64),index=True)
    description:Mapped[str]=mapped_column(String(1000))
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class ManagementFinanceRequest(Base):
    __tablename__='management_finance_requests'
    id:Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    request_key:Mapped[str]=mapped_column(String(64),unique=True)
    requester_id:Mapped[str]=mapped_column(ForeignKey('users.id'),index=True)
    target_id:Mapped[str]=mapped_column(ForeignKey('users.id'),index=True)
    operation:Mapped[str]=mapped_column(String(10))
    amount:Mapped[int]=mapped_column(BigInteger)
    reason:Mapped[str]=mapped_column(String(2000))
    evidence:Mapped[str]=mapped_column(Text)
    status:Mapped[str]=mapped_column(String(24),default='pending_review',index=True)
    reviewer_id:Mapped[str|None]=mapped_column(ForeignKey('users.id'),nullable=True)
    review_note:Mapped[str|None]=mapped_column(String(2000),nullable=True)
    reviewed_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
    approver_id:Mapped[str|None]=mapped_column(ForeignKey('users.id'),nullable=True)
    decision_note:Mapped[str|None]=mapped_column(String(2000),nullable=True)
    operation_id:Mapped[str|None]=mapped_column(ForeignKey('lidya_manual_operations.id'),nullable=True,unique=True)
    decided_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now(),index=True)

class ManagementSignalReview(Base):
    __tablename__='management_signal_reviews'
    id:Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    signal_key:Mapped[str]=mapped_column(String(160),unique=True)
    operation_id:Mapped[str]=mapped_column(ForeignKey('lidya_manual_operations.id'),index=True)
    signal_type:Mapped[str]=mapped_column(String(64))
    status:Mapped[str]=mapped_column(String(24))
    note:Mapped[str]=mapped_column(String(2000))
    case_id:Mapped[int|None]=mapped_column(ForeignKey('management_cases.id'),nullable=True)
    actor_id:Mapped[str]=mapped_column(ForeignKey('users.id'))
    updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now(),onupdate=func.now())
