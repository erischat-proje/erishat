"""Private payment evidence, immutable balance audits and dedicated DA sessions."""
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class PaymentSettings(Base):
    __tablename__ = 'lidya_payment_settings'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    iban: Mapped[str] = mapped_column(String(26), default='')
    account_name: Mapped[str] = mapped_column(String(160), default='')
    bank_name: Mapped[str] = mapped_column(String(100), default='')
    updated_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)

class LidyaOrder(Base):
    __tablename__ = 'lidya_purchase_orders'
    __table_args__ = (UniqueConstraint('user_id','request_key',name='uq_lidya_order_request'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    request_key: Mapped[str] = mapped_column(String(64))
    package_id: Mapped[int] = mapped_column(Integer)
    price_try: Mapped[int] = mapped_column(Integer)
    base: Mapped[int] = mapped_column(Integer)
    bonus: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(16))
    reference: Mapped[str] = mapped_column(String(48), unique=True)
    status: Mapped[str] = mapped_column(String(16), index=True)
    bank_json: Mapped[str] = mapped_column(Text, default='{}')
    evidence: Mapped[str] = mapped_column(Text, default='')
    accepted_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    decided_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    transaction_reference: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    approved_document_sha: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    decision_note: Mapped[str] = mapped_column(String(1000), default='')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class LidyaOperation(Base):
    __tablename__ = 'lidya_manual_operations'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    request_key: Mapped[str] = mapped_column(String(64), unique=True)
    admin_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    admin_role: Mapped[str] = mapped_column(String(2), index=True)
    admin_name: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    public_id: Mapped[str] = mapped_column(String(32))
    amount: Mapped[int] = mapped_column(BigInteger)
    before: Mapped[int] = mapped_column(BigInteger)
    after: Mapped[int] = mapped_column(BigInteger)
    operation: Mapped[str] = mapped_column(String(10))
    evidence: Mapped[str] = mapped_column(Text, default='')
    exemption_sha: Mapped[str] = mapped_column(String(64), default='')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class LidyaPurchaseMessage(Base):
    __tablename__ = 'lidya_purchase_messages'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(ForeignKey('lidya_purchase_orders.id'), index=True)
    sender_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    message: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
