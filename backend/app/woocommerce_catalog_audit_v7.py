"""Read-only WooCommerce catalog audit. Never write an order or wallet entry.

Run only on the trusted LidyaChat backend host:
    PYTHONPATH=backend python -m app.woocommerce_catalog_audit_v7
Never print the secret or request authentication headers.
"""
from __future__ import annotations

import sys
from urllib.parse import urlsplit
from typing import Mapping

from .woocommerce_coin_contract import catalog_from_packages, _money_kurus, CatalogMismatch


def validate_catalog(products: list[dict], packages: list[dict]) -> list[str]:
    """Validate that all 16 authoritative products are unique, published and priced correctly."""
    expected = catalog_from_packages(packages)
    errors: list[str] = []
    found: dict[str, dict] = {}
    for row in products:
        if not isinstance(row, dict):
            errors.append('Invalid product entry')
            continue
        sku = row.get('sku')
        if not isinstance(sku, str) or sku not in expected:
            continue  # Other store items are not part of this Lidya catalog.
        if sku in found:
            errors.append(f'{sku}: duplicate SKU')
            continue
        found[sku] = row
    for sku, package in expected.items():
        row = found.get(sku)
        if row is None:
            errors.append(f'{sku}: missing')
            continue
        try:
            correct_price = _money_kurus(row.get('price')) == package.price_kurus
        except (CatalogMismatch, ValueError, TypeError):
            correct_price = False
        if not correct_price:
            errors.append(f'{sku}: price mismatch')
        if row.get('status') != 'publish':
            errors.append(f'{sku}: not published')
        if row.get('virtual') is not True or row.get('type') != 'simple':
            errors.append(f'{sku}: expected virtual simple product')
        if type(row.get('id')) is not int or row['id'] <= 0:
            errors.append(f'{sku}: invalid product ID')
    return errors


def valid_url(base: str) -> bool:
    p = urlsplit(base.strip().rstrip('/'))
    return (p.scheme == 'https' and p.hostname == 'magaza.lidyachat.com' and
            p.port is None and not p.username and not p.password and
            p.path in ('', '/') and not p.query and not p.fragment)


def main() -> int:
    from .config import settings
    from .purchase_routes import PACKAGES
    import requests

    base = settings.woocommerce_rest_base_url.strip().rstrip('/')
    key = settings.woocommerce_rest_consumer_key
    secret = settings.woocommerce_rest_consumer_secret
    if not valid_url(base) or not key.startswith('ck_') or not secret.startswith('cs_') or len(key) < 20 or len(secret) < 20:
        print('CONFIG: INCOMPLETE (URL / key / secret invalid or missing)')
        return 2
    try:
        endpoint = base + '/wp-json/wc/v3/products'
        # Read-only: one GET with redirect suppression. Do not log response headers or request URL credentials.
        response = requests.get(endpoint, auth=(key, secret), params={'per_page': 100, 'page': 1},
                                timeout=(4, 12), allow_redirects=False)
        if response.status_code != 200:
            print('WC READ: FAILED (HTTP %d)' % response.status_code)
            return 2
        products = response.json()
        if not isinstance(products, list):
            print('WC READ: INVALID RESPONSE')
            return 2
        errors = validate_catalog(products, PACKAGES)
    except (requests.RequestException, ValueError, TypeError, CatalogMismatch):
        print('WC READ: FAILED (network or response error)')
        return 2
    if errors:
        print('CATALOG CHECK: FAILED')
        for issue in errors:
            print('- ' + issue)
        return 1
    print('WC READ: OK')
    print('LIDYA CATALOG: %d/%d VERIFIED' % (len(catalog_from_packages(PACKAGES)), len(catalog_from_packages(PACKAGES))))
    print('ORDER CREATION / PAYMENT / COIN DELIVERY: NOT TESTED OR ENABLED')
    return 0


if __name__ == '__main__':
    sys.exit(main())
