from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.woocommerce_qnbpay_gate_v13 import (
    PaymentDisabledError, deny_payment_start,
    deny_unverified_fulfillment, readiness
)


class QnbpayV13Security(unittest.TestCase):
    def test_fail_closed_flags(self):
        data = readiness()
        for key in ('payment_enabled', 'order_creation_enabled', 'coin_delivery_enabled', 'supports_card_entry'):
            self.assertIs(data[key], False, key)
    def test_provider_and_channel(self):
        self.assertEqual(readiness()['provider'], 'QNBpay')
        self.assertEqual(readiness()['channel'], 'web')
    def test_deny_payment(self):
        with self.assertRaises(PaymentDisabledError):
            deny_payment_start()
    def test_deny_fulfillment(self):
        with self.assertRaises(PaymentDisabledError):
            deny_unverified_fulfillment()
    def test_no_gateway_post_or_callback(self):
        source = (ROOT / 'backend/app/woocommerce_qnbpay_routes_v13.py').read_text()
        for disallowed in ('requests.post', 'httpx.post', 'callback', 'wallet', 'wc_order_id'):
            self.assertNotIn(disallowed, source)
    def test_route_is_authenticated(self):
        source = (ROOT / 'backend/app/woocommerce_qnbpay_routes_v13.py').read_text()
        self.assertIn('Depends(current_user)', source)
        self.assertIn('user.is_active', source)
    def test_main_router_registered(self):
        source = (ROOT / 'backend/app/main.py').read_text()
        self.assertIn('woocommerce_qnbpay_routes_v13.register_auth(current_user)', source)
    def test_existing_v12_checkout_still_disabled(self):
        source = (ROOT / 'backend/app/woocommerce_web_checkout.py').read_text()
        self.assertIn('"payment_available": False', source)
        self.assertIn('"credited": False', source)
    def test_v12_web_ui_retained(self):
        source = (ROOT / 'frontend/payment-assistance.js').read_text()
        self.assertIn('// WOOCOMMERCE_WEB_PREVIEW_V12', source)
        self.assertIn('actionButton.disabled=true', source)

if __name__ == '__main__':
    unittest.main()
