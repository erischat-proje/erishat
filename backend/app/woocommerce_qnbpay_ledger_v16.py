"""V16: durable *unverified* provider reference registry schema.

SCHEMA ONLY. No code path inserts evidence, marks a capture verified, or credits
coins. A future authenticated merchant-specific PSP verifier and an atomic
wallet ledger transaction are mandatory before activation.
"""
from datetime import datetime, timezone
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class QnbpayTransactionReferenceV16(Base):
    __tablename__ = 'qnbpay_transaction_references_v16'
    __table_args__ = (
        UniqueConstraint('provider', 'transaction_id', name='uq_qnb_v16_provider_tx'),
        UniqueConstraint('order_ref', name='uq_qnb_v16_order_ref'),
        UniqueConstraint('woocommerce_order_id', name='uq_qnb_v16_wc_order_id'),
        CheckConstraint("provider = 'QNBpay'", name='ck_qnb_v16_provider'),
        CheckConstraint("state = 'unverified'", name='ck_qnb_v16_unverified'),
        CheckConstraint('woocommerce_order_id > 0', name='ck_qnb_v16_wc_positive'),
        CheckConstraint('package_id >= 1 AND package_id <= 16', name='ck_qnb_v16_package'),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(24), nullable=False)
    transaction_id: Mapped[str] = mapped_column(String(128), nullable=False)
    order_ref: Mapped[str] = mapped_column(String(36), ForeignKey('woocommerce_web_orders_v6.id', ondelete='RESTRICT'), nullable=False)
    woocommerce_order_id: Mapped[int] = mapped_column(Integer, nullable=False)
    package_id: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(24), nullable=False, default='unverified', server_default='unverified')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


def v16_readiness() -> dict:
    """Only descriptive flags; never evidence of payment or entitlement."""
    return {
        'provider': 'QNBpay', 'schema_version': 16,
        'reference_table_available_after_migration': True,
        'provider_callback_enabled': False,
        'psp_verification_enabled': False,
        'payment_enabled': False,
        'coin_delivery_enabled': False,
        'wallet_ledger_integrated': False,
    }
