"""V15: provider-neutral *read-only* payment matching plan.

This is NOT a QNBpay callback verifier, ledger, PSP integration or proof of
payment. It describes requirements for a future server-side verified pipeline.
All outputs explicitly deny payment authorization and coin fulfillment.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Sequence
from uuid import UUID


@dataclass(frozen=True)
class ReferenceClaim:
    """Trusted, persisted reference index entry (future integration only)."""
    provider: str
    transaction_id: str
    order_ref: str
    wc_order_id: int


def _reference(value: str) -> str:
    if type(value) is not str:
        raise ValueError('invalid order reference')
    try:
        parsed = UUID(value)
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError('invalid order reference') from exc
    if parsed.version != 4 or str(parsed) != value:
        raise ValueError('invalid order reference')
    return value


def _positive_integer(value: int, *, field: str) -> int:
    if type(value) is not int or value <= 0:
        raise ValueError('invalid ' + field)
    return value


def check_reference_conflicts(*, provider: str, transaction_id: str,
                              order_ref: str, wc_order_id: int,
                              existing: Sequence[ReferenceClaim]) -> str:
    """Pure collision detector; caller MUST provide trusted durable DB entries.

    This function does not write a lock. A future transactional unique constraint
    on (provider, transaction_id) is essential; this preview is not that guard.
    """
    _reference(order_ref)
    _positive_integer(wc_order_id, field='WooCommerce order id')
    if provider != 'QNBpay':
        raise ValueError('unsupported provider')
    if type(transaction_id) is not str or not (8 <= len(transaction_id) <= 128) or not all(
            c.isascii() and (c.isalnum() or c in '-_') for c in transaction_id):
        raise ValueError('invalid provider transaction id')
    if type(existing) not in (list, tuple):
        raise ValueError('invalid reference inventory')
    seen = []
    for claim in existing:
        if type(claim) is not ReferenceClaim:
            raise ValueError('invalid trusted reference inventory')
        if claim.provider == provider and claim.transaction_id == transaction_id:
            seen.append(claim)
    if len(seen) > 1:
        return 'CONFLICT_DUPLICATE_STORED_REFERENCE'
    if not seen:
        return 'UNSEEN_REFERENCE_NOT_VERIFIED'
    claim = seen[0]
    if claim.order_ref != order_ref or claim.wc_order_id != wc_order_id:
        return 'CONFLICT_REFERENCE_REUSED_FOR_OTHER_ORDER'
    return 'ALREADY_RECORDED_NO_REDELIVERY'


@dataclass(frozen=True)
class PaymentPlan:
    order_ref: str
    package_id: int
    local_state: str
    woocommerce_order_id: int | None
    provider: str = 'QNBpay'
    channel: str = 'web'
    matching_state: str = 'WAITING_FOR_LOCAL_ORDER'
    psp_signature_verified: bool = False
    provider_capture_verified: bool = False
    price_currency_verified: bool = False
    payment_verified: bool = False
    coin_delivery_authorized: bool = False
    may_retry_order_creation: bool = False
    durable_transaction_claim_exists: bool = False
    required_controls: tuple[str, ...] = (
        'Merchant-specific QNBpay server-to-server verification',
        'Exact order/user/package/amount/currency identity matching',
        'Durable unique (provider,transaction_id) claim in a DB transaction',
        'Atomic idempotent wallet ledger delivery linked to the verified claim',
        'Refund, chargeback and failed-payment handling',
    )


def payment_plan(*, order_ref: str, package_id: int,
                 local_state: str, woocommerce_order_id: int | None) -> dict:
    """Read-only state analysis from an authenticated user's local order row."""
    _reference(order_ref)
    if type(package_id) is not int or not 1 <= package_id <= 16:
        raise ValueError('invalid package id')
    if type(local_state) is not str or local_state not in ('reserved', 'created', 'uncertain', 'disabled'):
        raise ValueError('invalid local state')
    if woocommerce_order_id is not None:
        _positive_integer(woocommerce_order_id, field='WooCommerce order id')
    if local_state == 'disabled':
        state = 'DISABLED'
    elif local_state == 'uncertain':
        state = 'UNCERTAIN_ORDER_MANUAL_RECONCILIATION_REQUIRED'
    elif local_state == 'reserved':
        state = 'RESERVED_REMOTE_ORDER_NOT_CONFIRMED'
    elif woocommerce_order_id is None:
        state = 'MISSING_WOOCOMMERCE_LINK'
    else:
        state = 'AWAITING_VERIFIED_PSP_TRANSACTION'
    return asdict(PaymentPlan(order_ref, package_id, local_state,
                              woocommerce_order_id, matching_state=state))
