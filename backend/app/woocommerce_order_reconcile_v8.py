"""V8 operator-only, read-only WooCommerce order reconciliation.

Run inside trusted API container:
 PYTHONPATH=/app python -m app.woocommerce_order_reconcile_v8 --order-ref UUID
No HTTP route, writes, retries of POST, payment or coin delivery. Missing results
when scans are incomplete are INCONCLUSIVE rather than proof of absence.
"""
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urlsplit

REF_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _metas(order: dict) -> dict[str, Any]:
    entries = order.get('meta_data', [])
    if not isinstance(entries, list):
        raise ValueError('invalid metadata')
    result: dict[str, Any] = {}
    for row in entries:
        if isinstance(row, dict) and row.get('key') in ('_lidyachat_order_ref', '_lidyachat_user_id', '_lidyachat_package_id'):
            key = row['key']
            if key in result:
                raise ValueError('duplicate trusted metadata')
            result[key] = row.get('value')
    return result


def is_candidate(order: dict, order_ref: str) -> bool:
    return any(isinstance(x, dict) and x.get('key') == '_lidyachat_order_ref' and x.get('value') == order_ref
               for x in order.get('meta_data', []) if isinstance(order.get('meta_data'), list))


def validate_match(order: dict, *, order_ref: str, user_id: str, package_id: int, packages: list[dict]) -> None:
    from .woocommerce_coin_contract import verify_order_snapshot
    if type(order.get('id')) is not int or order['id'] <= 0:
        raise ValueError('invalid WooCommerce order id')
    meta = _metas(order)
    if meta.get('_lidyachat_order_ref') != order_ref or meta.get('_lidyachat_user_id') != user_id:
        raise ValueError('order identity mismatch')
    raw_package = meta.get('_lidyachat_package_id')
    if type(raw_package) not in (str, int) or str(raw_package) != str(package_id):
        raise ValueError('package identity mismatch')
    match = verify_order_snapshot(order, packages)
    if match.package_id != package_id:
        raise ValueError('order pricing or package mismatch')
    # A WooCommerce status is NOT a payment provider receipt; no fulfillment is authorized.


@dataclass(frozen=True)
class AuditResult:
    verdict: str  # MATCHED, NOT_FOUND, INCONCLUSIVE, CONFLICT
    wc_order_id: int | None
    pages_scanned: int


def reconcile_pages(fetch_page: Callable[[int, int], list[dict]], *, order_ref: str,
                    user_id: str, package_id: int, packages: list[dict],
                    per_page: int = 100, max_pages: int = 10) -> AuditResult:
    if not REF_RE.fullmatch(order_ref) or not user_id or type(package_id) is not int:
        raise ValueError('invalid local order identity')
    matches: list[dict] = []
    for page in range(1, max_pages + 1):
        batch = fetch_page(page, per_page)
        if not isinstance(batch, list) or len(batch) > per_page:
            return AuditResult('INCONCLUSIVE', None, page)
        for order in batch:
            if not isinstance(order, dict):
                return AuditResult('INCONCLUSIVE', None, page)
            if is_candidate(order, order_ref):
                matches.append(order)
                if len(matches) > 1:
                    return AuditResult('CONFLICT', None, page)
        if len(batch) < per_page:
            if not matches:
                return AuditResult('NOT_FOUND', None, page)
            try:
                validate_match(matches[0], order_ref=order_ref, user_id=user_id,
                               package_id=package_id, packages=packages)
            except (ValueError, TypeError):
                return AuditResult('CONFLICT', None, page)
            return AuditResult('MATCHED', matches[0]['id'], page)
    # Exhausting a search cap does not prove order uniqueness or absence.
    return AuditResult('INCONCLUSIVE', None, max_pages)


def run(ref: str) -> int:
    import requests
    from .config import settings
    from .db import SessionLocal
    from .purchase_routes import PACKAGES
    from .woocommerce_order_v6 import WebOrderV6
    from .woocommerce_catalog_audit_v7 import valid_url

    if not valid_url(settings.woocommerce_rest_base_url):
        print('CONFIG INVALID')
        return 2
    if not (settings.woocommerce_rest_consumer_key.startswith('ck_') and
            settings.woocommerce_rest_consumer_secret.startswith('cs_')):
        print('CREDENTIALS MISSING')
        return 2
    with SessionLocal() as db:
        row = db.get(WebOrderV6, ref)
        if row is None:
            print('LOCAL ORDER NOT FOUND')
            return 2
        if row.state not in ('reserved', 'uncertain', 'created'):
            print('LOCAL STATUS NOT ELIGIBLE FOR AUDIT')
            return 2
        user_id, package_id, known_wc_id = row.user_id, row.package_id, row.wc_order_id

    url = settings.woocommerce_rest_base_url.rstrip('/') + '/wp-json/wc/v3/orders'
    def fetch_page(page: int, per_page: int) -> list[dict]:
        resp = requests.get(url, auth=(settings.woocommerce_rest_consumer_key,
                                      settings.woocommerce_rest_consumer_secret),
                            params={'page': page, 'per_page': per_page, 'orderby': 'date', 'order': 'desc'},
                            timeout=(4, 12), allow_redirects=False)
        if resp.status_code != 200:
            raise ValueError('WooCommerce read error')
        return resp.json()
    try:
        result = reconcile_pages(fetch_page, order_ref=ref, user_id=user_id,
                                 package_id=package_id, packages=PACKAGES)
    except (requests.RequestException, ValueError, TypeError):
        print('AUDIT: INCONCLUSIVE (network or response error)')
        return 2
    if result.verdict == 'MATCHED' and known_wc_id is not None and result.wc_order_id != known_wc_id:
        print('AUDIT: CONFLICT (local remote-id mismatch)')
        return 2
    print('AUDIT:', result.verdict)
    print('PAGES SCANNED:', result.pages_scanned)
    if result.verdict == 'MATCHED':
        print('WOO ORDER ID:', result.wc_order_id)
    print('NO DATABASE WRITES / NO ORDER POST / NO PAYMENT OR COIN DELIVERY')
    # Even NOT_FOUND is not authorization to retry POST; deleted/hidden orders may exist.
    return 0 if result.verdict == 'MATCHED' else 2


def main() -> int:
    parser = argparse.ArgumentParser(description='Read-only operator order audit')
    parser.add_argument('--order-ref', required=True)
    args = parser.parse_args()
    if not REF_RE.fullmatch(args.order_ref):
        parser.error('invalid UUID order reference')
    return run(args.order_ref)


if __name__ == '__main__':
    raise SystemExit(main())
