"""Offline V6 safety regression tests. Never call external WooCommerce or a real DB."""
import ast
import pathlib
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
SRC=(ROOT/'app/woocommerce_order_v6.py').read_text()
CONFIG=(ROOT/'app/config.py').read_text()
MAIN=(ROOT/'app/main.py').read_text()
class WooOrderV6Safety(unittest.TestCase):
    def test_compile(self): compile(SRC,'woocommerce_order_v6.py','exec')
    def test_opt_in_only(self):
        self.assertIn('woocommerce_order_creation_enabled: bool = False',CONFIG)
        self.assertIn("if not configured():",SRC)
    def test_no_wallet_write(self):
        self.assertNotIn('user.lidya',SRC)
        self.assertNotIn('credited\': True',SRC)
    def test_server_authoritative(self):
        self.assertIn('from .purchase_routes import PACKAGES',SRC)
        self.assertIn('verify_order_snapshot(remote, PACKAGES)',SRC)
        self.assertIn("'set_paid': False",SRC)
        self.assertIn("'status': 'pending'",SRC)
    def test_idempotency(self):
        self.assertIn('UniqueConstraint(',SRC)
        self.assertIn('db.commit() # Durable before any external POST.',SRC)
        self.assertIn("record.state = 'uncertain'",SRC)
    def test_no_browser_secrets(self):
        self.assertIn('settings.woocommerce_rest_consumer_secret',SRC)
        self.assertIn('Depends(current_user)',SRC)
    def test_registered(self):
        self.assertIn('woocommerce_order_v6.register_auth(current_user)',MAIN)
if __name__=='__main__':unittest.main()
