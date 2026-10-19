"""Dedicated payment queue. Closed chats disappear from inboxes; evidence stays private."""
from datetime import datetime
from sqlalchemy import Index, text, BigInteger, Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class PaymentRequest(Base):
    __tablename__='payment_assistance_requests'
    __table_args__=(UniqueConstraint('user_id','request_key',name='uq_payment_assistance_request'),)
    id: Mapped[str]=mapped_column(String(36),primary_key=True)
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id'),index=True)
    public_id: Mapped[str]=mapped_column(String(32))
    nickname: Mapped[str]=mapped_column(String(32))
    request_key: Mapped[str]=mapped_column(String(64))
    package_id: Mapped[int]=mapped_column(Integer)
    price_try: Mapped[int]=mapped_column(Integer)
    base: Mapped[int]=mapped_column(Integer)
    bonus: Mapped[int]=mapped_column(Integer)
    total: Mapped[int]=mapped_column(Integer)
    status: Mapped[str]=mapped_column(String(24),index=True,default='pending')
    assigned_to: Mapped[str|None]=mapped_column(ForeignKey('users.id'),nullable=True,index=True)
    agent_public_id: Mapped[str|None]=mapped_column(String(32),nullable=True)
    customer_ack: Mapped[bool]=mapped_column(Boolean,default=False)
    agent_ack: Mapped[bool]=mapped_column(Boolean,default=False)
    customer_read: Mapped[int]=mapped_column(Integer,default=0)
    agent_read: Mapped[int]=mapped_column(Integer,default=0)
    accepted_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
    credit_operation_id: Mapped[str|None]=mapped_column(ForeignKey('lidya_manual_operations.id'),nullable=True,unique=True)
    transaction_reference: Mapped[str|None]=mapped_column(String(100),nullable=True,unique=True)
    receipt_sha: Mapped[str|None]=mapped_column(String(64),nullable=True,unique=True)
    reason: Mapped[str]=mapped_column(String(300),default='')
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now(),index=True)
    updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now(),onupdate=func.now())
    closed_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)

class PaymentMessage(Base):
    __tablename__='payment_assistance_messages'
    __table_args__=(UniqueConstraint('request_id','sender_id','request_key',name='uq_payment_assistance_message'),)
    id: Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    request_id: Mapped[str]=mapped_column(ForeignKey('payment_assistance_requests.id'),index=True)
    sender_id: Mapped[str]=mapped_column(ForeignKey('users.id'))
    sender_public_id: Mapped[str]=mapped_column(String(32))
    sender_side: Mapped[str]=mapped_column(String(8))
    request_key: Mapped[str]=mapped_column(String(64))
    message: Mapped[str]=mapped_column(String(2000),default='')
    photo: Mapped[bytes|None]=mapped_column(LargeBinary,nullable=True)
    photo_sha: Mapped[str|None]=mapped_column(String(64),nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class PaymentEvent(Base):
    __tablename__='payment_assistance_events'
    id: Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    request_id: Mapped[str]=mapped_column(ForeignKey('payment_assistance_requests.id'),index=True)
    actor_id: Mapped[str]=mapped_column(ForeignKey('users.id'))
    actor_public_id: Mapped[str]=mapped_column(String(32))
    action: Mapped[str]=mapped_column(String(40))
    details: Mapped[str]=mapped_column(Text,default='{}')
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class PaymentPresence(Base):
    __tablename__='payment_assistance_presence'
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id'),primary_key=True)
    seen_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),index=True)

# Database-level defenses also cover requests from multiple workers.
_live="status IN ('pending','connecting','chat','rejecting','finishing')"
_assigned="assigned_to IS NOT NULL AND status IN ('connecting','chat','rejecting','finishing')"
Index('uq_payment_assistance_live_customer',PaymentRequest.user_id,unique=True,postgresql_where=text(_live),sqlite_where=text(_live))
Index('uq_payment_assistance_busy_da',PaymentRequest.assigned_to,unique=True,postgresql_where=text(_assigned),sqlite_where=text(_assigned))



class PaymentReview(Base):
    __tablename__='payment_assistance_reviews'
    request_id: Mapped[str]=mapped_column(ForeignKey('payment_assistance_requests.id'),primary_key=True)
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id'),primary_key=True)
    reviewed_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class PaymentReviewClosure(Base):
    __tablename__='payment_assistance_review_closures'
    request_id: Mapped[str]=mapped_column(ForeignKey('payment_assistance_requests.id'),primary_key=True)
    required_da_ids: Mapped[str]=mapped_column(Text)
    archived_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())
