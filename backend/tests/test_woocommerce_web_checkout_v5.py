"""V5 web preflight guarantees no payment or wallet writes."""
import ast
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SRC=(ROOT/'app/woocommerce_web_checkout.py').read_text()

class WebCheckoutV5Tests(unittest.TestCase):
    def test_no_payment_or_balance_mutation(self):
        tree=ast.parse(SRC)
        names={node.func.id for node in ast.walk(tree) if isinstance(node,ast.Call) and isinstance(node.func,ast.Name)}
        self.assertFalse({'requests','post','commit','flush','execute','add'} & names)
        self.assertNotIn('lidya=',SRC)
    def test_authenticated_only(self):
        self.assertIn('Depends(current_user)',SRC)
    def test_all_money_from_server_catalog(self):
        self.assertIn('from .purchase_routes import PACKAGES',SRC)
        self.assertIn('catalog_from_packages(PACKAGES)',SRC)
        self.assertNotIn('price_try: int',SRC)
    def test_locked_status(self):
        self.assertIn('"payment_enabled": False',SRC)
        self.assertIn('"coin_fulfillment_enabled": False',SRC)
        self.assertIn('"order_created": False',SRC)
        self.assertIn('"credited": False',SRC)
    def test_route_registration(self):
        main=(ROOT/'app/main.py').read_text()
        self.assertIn('woocommerce_web_checkout.register_auth(current_user)',main)
    def test_config_default_disabled(self):
        config=(ROOT/'app/config.py').read_text()
        self.assertIn('woocommerce_web_checkout_enabled: bool = False',config)

if __name__ == '__main__': unittest.main()
