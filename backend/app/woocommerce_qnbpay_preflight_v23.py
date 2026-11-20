"""V23: OFFLINE-only checkout matching preflight, never payment evidence.

No routes, DB writes, PSP calls, wallet writes or QNBpay integration.
The caller must supply trusted server-side local order data and WooCommerce
snapshot; this helper must never be used as an authorization to deliver coins.
"""
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from uuid import UUID
import re

PRICE_RE = re.compile(r'^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$')
SKU_RE = re.compile(r'^LIDYA-[1-9][0-9]*$')

class PreflightMismatch(ValueError):
    pass

@dataclass(frozen=True)
class PreflightResult:
    order_ref: str
    package_id: int
    user_id: str
    wc_order_id: int
    expected_amount_kurus: int
    currency: str = 'TRY'
    snapshot_matches_catalog: bool = True
    psp_authenticated: bool = False
    provider_capture_verified: bool = False
    payment_authorized: bool = False
    coin_delivery_authorized: bool = False
    payment_enabled: bool = False
    notes: tuple[str, ...] = (
        'Offline trusted-input consistency check only, not evidence of payment',
        'QNBpay callback must be authenticated with merchant-specific specification',
        'Server-side capture re-query and exact user/order/amount/currency verification required',
        'Atomic durable unique PSP transaction claim and unique wallet journal required',
    )

def _uuid4(value):
    if type(value) is not str:
        raise PreflightMismatch('invalid order reference')
    try:
        parsed = UUID(value)
    except (ValueError, TypeError, AttributeError) as exc:
        raise PreflightMismatch('invalid order reference') from exc
    if parsed.version != 4 or str(parsed) != value:
        raise PreflightMismatch('invalid order reference')
    return value

def _money(value):
    if type(value) is not str or not PRICE_RE.fullmatch(value):
        raise PreflightMismatch('invalid money formatting')
    try:
        parsed=Decimal(value)
    except InvalidOperation as exc:
        raise PreflightMismatch('invalid money') from exc
    if not parsed.is_finite():
        raise PreflightMismatch('invalid money')
    return int(parsed * 100)

def check_offline_snapshot(*, local_order, wc_snapshot, catalog):
    """Fail closed for mismatch. The result ALWAYS disallows payments and coins."""
    if type(local_order) is not dict or type(wc_snapshot) is not dict or type(catalog) is not tuple:
        raise PreflightMismatch('trusted data structure required')
    if any(type(p) is not dict for p in catalog):
        raise PreflightMismatch('invalid catalog')
    ref = _uuid4(local_order.get('id'))
    uid = local_order.get('user_id')
    if type(uid) is not str or not uid or len(uid) > 128:
        raise PreflightMismatch('invalid user')
    package_id=local_order.get('package_id')
    if type(package_id) is not int or not (1 <= package_id <= 16):
        raise PreflightMismatch('invalid package')
    if local_order.get('state') != 'created':
        raise PreflightMismatch('order must be linked and created')
    wc_id=local_order.get('wc_order_id')
    if type(wc_id) is not int or wc_id <= 0 or wc_snapshot.get('id') != wc_id or type(wc_snapshot.get('id')) is not int:
        raise PreflightMismatch('WooCommerce order ID mismatch')
    if wc_snapshot.get('currency') != 'TRY':
        raise PreflightMismatch('currency mismatch')
    if wc_snapshot.get('status') != 'pending' or wc_snapshot.get('date_paid') is not None:
        raise PreflightMismatch('unexpected payment status')
    # WC order metadata must be server-controlled and exactly match local user and ref.
    if wc_snapshot.get('lidyachat_user_id') != uid or wc_snapshot.get('lidyachat_order_ref') != ref:
        raise PreflightMismatch('user or order ownership mismatch')
    if wc_snapshot.get('lidyachat_package_id') != package_id or type(wc_snapshot.get('lidyachat_package_id')) is not int:
        raise PreflightMismatch('package metadata mismatch')
    selected=[p for p in catalog if p.get('id') == package_id and type(p.get('id')) is int]
    if len(selected) != 1:
        raise PreflightMismatch('ambiguous catalog')
    p=selected[0]
    if (type(p.get('total')) is not int or p['total'] <= 0 or
        type(p.get('price_try')) is not int or p['price_try'] <= 0):
        raise PreflightMismatch('invalid catalog amounts')
    items=wc_snapshot.get('line_items')
    if type(items) is not list or len(items) != 1 or type(items[0]) is not dict:
        raise PreflightMismatch('exactly one product expected')
    item=items[0]
    sku='LIDYA-' + str(p['total'])
    if (not SKU_RE.fullmatch(sku) or item.get('sku') != sku or
        type(item.get('quantity')) is not int or item['quantity'] != 1):
        raise PreflightMismatch('product identity or quantity mismatch')
    amount=p['price_try']*100
    if _money(item.get('total')) != amount or _money(wc_snapshot.get('total')) != amount:
        raise PreflightMismatch('amount mismatch')
    for field in ('shipping_total','discount_total','fee_total','total_tax'):
        if _money(wc_snapshot.get(field, '0')) != 0:
            raise PreflightMismatch('unsupported adjustments')
    return asdict(PreflightResult(ref,package_id,uid,wc_id,amount))
