"""V20 offline event identity and replay-review planning, never a PSP verifier.

All inputs represent *hypothetical trusted persistence* in offline tests.
Never pass client-submitted event data here and never treat these decisions
as provider payment evidence or authorization for wallet operations.
"""
from dataclasses import asdict, dataclass
from uuid import UUID
import re

_EVENT_ID = re.compile(r"^[A-Za-z0-9_-]{8,128}$")

@dataclass(frozen=True)
class EventClaim:
    event_id: str
    transaction_id: str
    order_ref: str
    wc_order_id: int

@dataclass(frozen=True)
class EventSafetyPlan:
    order_ref: str
    package_id: int
    local_state: str
    woocommerce_order_id: int | None
    review_state: str
    source: str = "local_order_only"
    provider: str = "QNBpay"
    provider_event_authenticated: bool = False
    provider_capture_verified: bool = False
    payment_enabled: bool = False
    event_ingestion_enabled: bool = False
    coin_delivery_authorized: bool = False
    coin_delivered: bool = False
    wallet_debit_authorized: bool = False
    required_controls: tuple[str,...] = (
        "Merchant-specific callback authentication and server-side provider re-query",
        "Persist event identity with durable unique constraints and atomic conflict handling",
        "Bind event to original transaction, user, order, package, amount and currency",
        "Never infer payment status from event arrival, duplicate, or WooCommerce state",
        "Idempotent atomic wallet journal and coin credit after verified capture",
        "Audit out-of-order, replayed, refund and chargeback notifications without automatic debits",
    )

def _uuid4(value: str) -> str:
    if type(value) is not str:
        raise ValueError("invalid order reference")
    try:
        item = UUID(value)
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("invalid order reference") from exc
    if item.version != 4 or str(item) != value:
        raise ValueError("invalid order reference")
    return value

def _id(value: str) -> str:
    if type(value) is not str or _EVENT_ID.fullmatch(value) is None:
        raise ValueError("invalid event/transaction id")
    return value

def _positive(value: int) -> int:
    if type(value) is not int or value <= 0:
        raise ValueError("invalid WooCommerce order id")
    return value

def compare_trusted_event_claim(
    *, event_id: str, transaction_id: str, order_ref: str, wc_order_id: int,
    existing: tuple[EventClaim,...]
) -> str:
    """Offline collision classification, NOT an insert, lock or replay defense.

    A real integration must use database uniqueness and verified PSP evidence.
    """
    _id(event_id)
    _id(transaction_id)
    _uuid4(order_ref)
    _positive(wc_order_id)
    if type(existing) is not tuple or any(type(c) is not EventClaim for c in existing):
        raise ValueError("invalid trusted inventory")
    for claim in existing:
        _id(claim.event_id)
        _id(claim.transaction_id)
        _uuid4(claim.order_ref)
        _positive(claim.wc_order_id)
    matching_event = [c for c in existing if c.event_id == event_id]
    if len(matching_event) > 1:
        return "CONFLICT_DUPLICATE_PERSISTED_EVENT"
    if matching_event:
        old = matching_event[0]
        if (old.transaction_id,old.order_ref,old.wc_order_id) == (
            transaction_id,order_ref,wc_order_id
        ):
            return "REPLAY_SAME_EVENT_NO_DELIVERY"
        return "CONFLICT_EVENT_ID_REUSED"
    matching_tx = [c for c in existing if c.transaction_id == transaction_id]
    if any(c.order_ref != order_ref or c.wc_order_id != wc_order_id for c in matching_tx):
        return "CONFLICT_TRANSACTION_LINKED_TO_OTHER_ORDER"
    matching_order = [c for c in existing if c.order_ref == order_ref or c.wc_order_id == wc_order_id]
    if any(c.order_ref != order_ref or c.wc_order_id != wc_order_id or
           c.transaction_id != transaction_id for c in matching_order):
        return "CONFLICT_ORDER_LINKED_TO_OTHER_TRANSACTION"
    if matching_tx:
        return "DISTINCT_EVENT_SAME_TRANSACTION_REQUIRES_PROVIDER_VERIFICATION"
    return "UNSEEN_EVENT_REQUIRES_PROVIDER_VERIFICATION"

def event_safety_plan(
    *, order_ref: str, package_id: int, local_state: str,
    woocommerce_order_id: int | None
) -> dict:
    _uuid4(order_ref)
    if type(package_id) is not int or not 1 <= package_id <= 16:
        raise ValueError("invalid package")
    if type(local_state) is not str or local_state not in (
        "reserved", "created", "uncertain", "disabled"
    ):
        raise ValueError("invalid local state")
    if woocommerce_order_id is not None:
        _positive(woocommerce_order_id)
    if local_state == "disabled":
        state = "ORDER_DISABLED_NO_EVENTS"
    elif local_state == "uncertain":
        state = "ORDER_UNCERTAIN_MANUAL_REVIEW"
    elif local_state == "reserved":
        state = "RESERVATION_NOT_PROVIDER_EVIDENCE"
    elif woocommerce_order_id is None:
        state = "REMOTE_ORDER_LINK_MISSING"
    else:
        state = "AWAITING_AUTHENTICATED_PROVIDER_EVENT"
    return asdict(EventSafetyPlan(order_ref, package_id, local_state, woocommerce_order_id, state))
