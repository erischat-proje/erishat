"""V21: schema-only, permanently unverified payment-event identity journal.

This is a PREPARATION schema, not a QNBpay callback, payment verification,
proof of capture or wallet ledger. No write API or worker is provided.
An event ID is only an opaque future merchant-verified identifier; it cannot
be trusted before the provider's documented authentication and re-query.
"""
from datetime import datetime, timezone
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class QnbpayEventJournalV21(Base):
    __tablename__ = 'qnbpay_event_journal_v21'
    __table_args__ = (
        UniqueConstraint('provider', 'event_id', name='uq_qnb_v21_provider_event'),
        CheckConstraint("provider = 'QNBpay'", name='ck_qnb_v21_provider'),
        CheckConstraint("state = 'unverified'", name='ck_qnb_v21_unverified_only'),
        CheckConstraint('woocommerce_order_id > 0', name='ck_qnb_v21_wc_positive'),
        CheckConstraint('package_id BETWEEN 1 AND 16', name='ck_qnb_v21_package'),
        Index('ix_qnb_v21_provider_transaction', 'provider', 'transaction_id'),
        Index('ix_qnb_v21_order_ref', 'order_ref'),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(24), nullable=False)
    event_id: Mapped[str] = mapped_column(String(128), nullable=False)
    transaction_id: Mapped[str] = mapped_column(String(128), nullable=False)
    order_ref: Mapped[str] = mapped_column(
        String(36), ForeignKey('woocommerce_web_orders_v6.id', ondelete='RESTRICT'), nullable=False
    )
    woocommerce_order_id: Mapped[int] = mapped_column(Integer, nullable=False)
    package_id: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(
        String(24), nullable=False, default='unverified', server_default='unverified'
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


def v21_schema_readiness() -> dict:
    """Descriptive only: table existence must be checked separately on DB."""
    return {
        'provider': 'QNBpay',
        'schema_version': 21,
        'event_journal_schema_declared': True,
        'event_journal_migration_verified': False,
        'provider_callback_enabled': False,
        'provider_authentication_enabled': False,
        'provider_capture_verified': False,
        'payment_enabled': False,
        'coin_delivery_enabled': False,
        'wallet_ledger_integrated': False,
        'refund_processing_enabled': False,
    }
