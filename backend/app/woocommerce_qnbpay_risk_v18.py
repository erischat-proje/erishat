"""V18: fail-closed, offline refund/chargeback review plan.

No QNBpay integrations or payment/refund evidence exists. This plan must NEVER
be interpreted as proof that a payment, refund or chargeback happened.
"""
from dataclasses import asdict, dataclass
from uuid import UUID


@dataclass(frozen=True)
class RiskPlan:
    order_ref: str
    package_id: int
    local_state: str
    woocommerce_order_id: int | None
    review_state: str
    provider: str = 'QNBpay'
    source: str = 'local_order_only'
    provider_payment_verified: bool = False
    refund_observed: bool = False
    chargeback_observed: bool = False
    coin_delivery_authorized: bool = False
    automatic_wallet_debit_authorized: bool = False
    refund_execution_enabled: bool = False
    required_controls: tuple[str, ...] = (
        'QNBpay merchant documentation and authenticated event verification',
        'Server-side provider status re-query; reconcile original transaction',
        'Amount, currency, order, user, package and WC order consistency',
        'Durable event identity and idempotent journal',
        'Human-reviewed refund and chargeback policy; never guess wallet debit',
    )


def review_plan(*, order_ref: str, package_id: int, local_state: str,
                woocommerce_order_id: int | None) -> dict:
    """Accept only validated persisted local order fields; never accept PSP claims."""
    if type(order_ref) is not str:
        raise ValueError('invalid order reference')
    try:
        parsed = UUID(order_ref)
    except (ValueError, AttributeError, TypeError) as exc:
        raise ValueError('invalid order reference') from exc
    if parsed.version != 4 or str(parsed) != order_ref:
        raise ValueError('invalid order reference')
    if type(package_id) is not int or not 1 <= package_id <= 16:
        raise ValueError('invalid package')
    if local_state not in ('reserved', 'created', 'uncertain', 'disabled'):
        raise ValueError('invalid local state')
    if woocommerce_order_id is not None and (type(woocommerce_order_id) is not int or woocommerce_order_id <= 0):
        raise ValueError('invalid WooCommerce order id')

    if local_state == 'disabled':
        review_state = 'ORDER_DISABLED_NO_PROVIDER_EVIDENCE'
    elif local_state == 'uncertain':
        review_state = 'AMBIGUOUS_ORDER_REQUIRES_MANUAL_RECONCILIATION'
    elif local_state == 'reserved':
        review_state = 'RESERVATION_NOT_PROOF_OF_PAYMENT'
    elif woocommerce_order_id is None:
        review_state = 'REMOTE_ORDER_LINK_MISSING'
    else:
        review_state = 'ORDER_LINKED_PROVIDER_EVIDENCE_NOT_AVAILABLE'
    return asdict(RiskPlan(order_ref, package_id, local_state, woocommerce_order_id, review_state))
