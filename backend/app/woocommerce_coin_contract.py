"""WooCommerce -> LidyaChat catalog verification. NO payment capture or wallet mutation.

This module is deliberately read-only and not registered as an HTTP route.
Order data must come from an authenticated, independently verified payment workflow.
"""
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
import re
from typing import Any, Iterable, Mapping

SKU_RE = re.compile(r"^LIDYA-([1-9][0-9]*)$")


class CatalogMismatch(ValueError):
    pass


@dataclass(frozen=True)
class CoinPackage:
    package_id: int
    sku: str
    amount: int
    price_kurus: int


def catalog_from_packages(packages: Iterable[Mapping[str, Any]]) -> dict[str, CoinPackage]:
    """Build mapping from existing authoritative purchase_routes.PACKAGES."""
    result = {}
    ids = set()
    for package in packages:
        package_id, amount, price = int(package["id"]), int(package["total"]), int(package["price_try"])
        if package_id in ids or amount <= 0 or price <= 0 or package_id <= 0:
            raise CatalogMismatch("Invalid or duplicate package")
        ids.add(package_id)
        sku = f"LIDYA-{amount}"
        if sku in result:
            raise CatalogMismatch("Duplicate SKU")
        result[sku] = CoinPackage(package_id, sku, amount, price * 100)
    if not result:
        raise CatalogMismatch("Empty catalog")
    return result


def _money_kurus(raw: Any) -> int:
    """Accept dot-decimal WooCommerce amount, not locale formatted '1.209,00'."""
    if isinstance(raw, bool) or not isinstance(raw, (str, int, Decimal)):
        raise CatalogMismatch("Invalid money type")
    if isinstance(raw, str) and not re.fullmatch(r"[0-9]+(?:\.[0-9]{1,2})?", raw):
        raise CatalogMismatch("Invalid price format")
    try:
        amount = Decimal(str(raw))
    except InvalidOperation as exc:
        raise CatalogMismatch("Invalid amount") from exc
    if not amount.is_finite() or amount < 0 or amount != amount.quantize(Decimal("0.01")):
        raise CatalogMismatch("Invalid precision or negative amount")
    return int(amount * 100)


def verify_order_snapshot(order: Mapping[str, Any], packages: Iterable[Mapping[str, Any]]) -> CoinPackage:
    """Strict v1 one-package checkout validation; NOT proof that payment succeeded.

    Expected WooCommerce REST order data is normalized to keys:
    currency, line_items [{sku, quantity, total}], total, shipping_total,
    discount_total, fee_total, total_tax. Tax-inclusive pricing must be
    reconciled by the payment adapter before enabling fulfillment.
    """
    catalog = catalog_from_packages(packages)
    if order.get("currency") != "TRY":
        raise CatalogMismatch("Only TRY is supported")
    items = order.get("line_items")
    if not isinstance(items, list) or len(items) != 1:
        raise CatalogMismatch("Exactly one product is required")
    item = items[0]
    if not isinstance(item, dict) or type(item.get("quantity")) is not int or item["quantity"] != 1:
        raise CatalogMismatch("Quantity must be exactly one")
    sku = item.get("sku")
    if not isinstance(sku, str) or not SKU_RE.fullmatch(sku) or sku not in catalog:
        raise CatalogMismatch("Unknown product")
    selected = catalog[sku]
    for field in ("shipping_total", "discount_total", "fee_total", "total_tax"):
        if _money_kurus(order.get(field, "0")) != 0:
            raise CatalogMismatch(f"Unsupported {field}; reconcile checkout policy first")
    if _money_kurus(item.get("total")) != selected.price_kurus:
        raise CatalogMismatch("Line total differs from server catalog")
    if _money_kurus(order.get("total")) != selected.price_kurus:
        raise CatalogMismatch("Order amount differs from server catalog")
    return selected
