"""Run with: python -m unittest discover -s backend/tests -p 'test_woocommerce_coin_contract.py'"""
import unittest
from backend.app.woocommerce_coin_contract import CatalogMismatch, catalog_from_packages, verify_order_snapshot

PACKAGES = [
    dict(id=1, total=95, price_try=2),
    dict(id=2, total=399, price_try=7),
    dict(id=16, total=204000, price_try=3627),
]


def order(sku="LIDYA-399", price="7.00"):
    return {"currency": "TRY", "line_items": [{"sku": sku, "quantity": 1, "total": price}],
            "total": price, "shipping_total": "0.00", "discount_total": "0.00",
            "fee_total": "0.00", "total_tax": "0.00"}


class ContractTests(unittest.TestCase):
    def test_catalog(self):
        self.assertEqual(catalog_from_packages(PACKAGES)["LIDYA-204000"].price_kurus, 362700)

    def test_valid_order(self):
        x = verify_order_snapshot(order(), PACKAGES)
        self.assertEqual((x.amount, x.package_id), (399, 2))

    def test_reject_wrong_price(self):
        with self.assertRaises(CatalogMismatch):
            verify_order_snapshot(order(price="6.99"), PACKAGES)

    def test_reject_unknown_sku(self):
        with self.assertRaises(CatalogMismatch):
            verify_order_snapshot(order(sku="LIDYA-999"), PACKAGES)

    def test_reject_duplicate_quantity(self):
        x = order(); x["line_items"][0]["quantity"] = 2
        with self.assertRaises(CatalogMismatch):
            verify_order_snapshot(x, PACKAGES)

    def test_reject_mixed_cart(self):
        x = order(); x["line_items"].append(x["line_items"][0].copy())
        with self.assertRaises(CatalogMismatch):
            verify_order_snapshot(x, PACKAGES)

    def test_reject_wrong_currency(self):
        x = order(); x["currency"] = "USD"
        with self.assertRaises(CatalogMismatch):
            verify_order_snapshot(x, PACKAGES)

    def test_reject_discount_or_tax(self):
        for key in ("discount_total", "total_tax", "shipping_total", "fee_total"):
            x = order(); x[key] = "0.01"
            with self.subTest(key=key), self.assertRaises(CatalogMismatch):
                verify_order_snapshot(x, PACKAGES)

    def test_reject_bad_precision(self):
        with self.assertRaises(CatalogMismatch):
            verify_order_snapshot(order(price="7.001"), PACKAGES)

    def test_reject_bad_catalog(self):
        with self.assertRaises(CatalogMismatch):
            catalog_from_packages(PACKAGES + [PACKAGES[0]])


if __name__ == "__main__":
    unittest.main()
