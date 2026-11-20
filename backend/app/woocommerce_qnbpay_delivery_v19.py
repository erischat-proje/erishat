"""V19: account-scoped, read-only *planned* delivery lifecycle.

No PSP verification, capture claims, wallet writes, refunds, or fulfillment.
State labels describe prerequisites, not completed payment operations.
"""
from dataclasses import asdict, dataclass
from uuid import UUID

REQUIRED_CONTROLS = (
    'Merchant-specific QNBpay authenticated callback and server-side capture re-query',
    'Exact original user/order/package/amount/currency/WooCommerce snapshot matching',
    'Atomic durable unique PSP transaction claim before fulfillment',
    'Atomic unique wallet ledger event and Coin credit in one database transaction',
    'Safe crash recovery: retry only previously verified, uniquely claimed transactions',
    'Separate refund/chargeback review, with no automatic wallet debit',
)

@dataclass(frozen=True)
class DeliveryPlan:
    order_ref: str
    package_id: int
    local_state: str
    woocommerce_order_id: int | None
    planning_state: str
    provider: str = 'QNBpay'
    channel: str = 'web'
    source: str = 'local_order_only'
    lifecycle: tuple[str, ...] = (
        'ORDER_RESERVED',
        'PROVIDER_VERIFICATION_PENDING',
        'PROVIDER_CAPTURE_VERIFIED_REQUIRED',
        'UNIQUE_TRANSACTION_CLAIM_REQUIRED',
        'ATOMIC_SINGLE_COIN_DELIVERY_REQUIRED',
        'REFUND_CHARGEBACK_REVIEW_REQUIRED',
    )
    provider_payment_verified: bool = False
    durable_transaction_claim_exists: bool = False
    coin_delivery_authorized: bool = False
    coin_delivered: bool = False
    refund_processed: bool = False
    wallet_debit_authorized: bool = False
    payment_enabled: bool = False
    required_controls: tuple[str, ...] = REQUIRED_CONTROLS


def delivery_plan(*, order_ref: str, package_id: int, local_state: str,
                  woocommerce_order_id: int | None) -> dict:
    """Reject untrusted/invalid identifiers; never represent an order as paid."""
    if type(order_ref) is not str:
        raise ValueError('invalid order reference')
    try:
        parsed = UUID(order_ref)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError('invalid order reference') from exc
    if parsed.version != 4 or str(parsed) != order_ref:
        raise ValueError('invalid order reference')
    if type(package_id) is not int or not 1 <= package_id <= 16:
        raise ValueError('invalid package')
    if type(local_state) is not str or local_state not in ('reserved', 'created', 'uncertain', 'disabled'):
        raise ValueError('invalid local state')
    if woocommerce_order_id is not None and (type(woocommerce_order_id) is not int or woocommerce_order_id <= 0):
        raise ValueError('invalid WooCommerce order id')

    if local_state == 'disabled':
        state = 'ORDER_DISABLED_NO_DELIVERY'
    elif local_state == 'uncertain':
        state = 'MANUAL_ORDER_RECONCILIATION_REQUIRED'
    elif local_state == 'reserved':
        state = 'REMOTE_ORDER_UNCONFIRMED'
    elif woocommerce_order_id is None:
        state = 'REMOTE_ORDER_LINK_MISSING'
    else:
        state = 'AWAITING_AUTHENTICATED_PROVIDER_CAPTURE_EVIDENCE'

    return asdict(DeliveryPlan(order_ref, package_id, local_state, woocommerce_order_id, state))
