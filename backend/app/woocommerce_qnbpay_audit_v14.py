"""V14: offline, read-only reconciliation safety contract.

No payment-provider adapter exists. A WooCommerce order (even 'completed')
is never proof of capture or authorization to credit the user wallet.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from uuid import UUID


@dataclass(frozen=True)
class AuditPlan:
    order_ref: str
    package_id: int
    local_state: str
    woocommerce_order_id: int | None
    reconciliation_state: str
    payment_verified: bool = False
    coin_delivery_authorized: bool = False
    retry_order_creation_allowed: bool = False
    reason: str = "QNBpay server-verified transaction evidence and delivery ledger are not integrated"


def audit_plan(*, order_ref: str, package_id: int, local_state: str,
               woocommerce_order_id: int | None) -> dict:
    """Describe next review step; never infer payment from local order state.

    Strictly validates all values before generating a result. Does not use
    request-supplied payment credentials, receipts, URLs, or signatures.
    """
    try:
        parsed = UUID(order_ref)
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("invalid local order reference") from exc
    if str(parsed) != order_ref or parsed.version != 4:
        raise ValueError("invalid local order reference")
    if type(package_id) is not int or not 1 <= package_id <= 16:
        raise ValueError("invalid package")
    if local_state not in ('reserved', 'uncertain', 'created', 'disabled'):
        raise ValueError("invalid local order state")
    if woocommerce_order_id is not None and (type(woocommerce_order_id) is not int or woocommerce_order_id <= 0):
        raise ValueError("invalid remote order id")
    if local_state == 'created' and woocommerce_order_id is None:
        state = 'LOCAL_REMOTE_LINK_MISSING'
    elif local_state == 'created':
        state = 'REMOTE_ORDER_LINK_REQUIRES_REVIEW'
    elif local_state == 'uncertain':
        state = 'AMBIGUOUS_REMOTE_CREATION_DO_NOT_RETRY'
    elif local_state == 'reserved':
        state = 'RESERVATION_ONLY_DO_NOT_RETRY'
    else:
        state = 'DISABLED'
    return asdict(AuditPlan(order_ref, package_id, local_state,
                            woocommerce_order_id, state))
