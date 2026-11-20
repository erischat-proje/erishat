"""Offline V19 safety tests. Does not need QNBpay or a database."""
import ast
import unittest
from pathlib import Path
from uuid import uuid4
from app.woocommerce_qnbpay_delivery_v19 import delivery_plan

ROOT = Path(__file__).resolve().parents[1] / 'app'

class V19DeliveryPlan(unittest.TestCase):
    def setUp(self):
        self.ref = str(uuid4())

    def plan(self, state='created', wc_id=123, pkg=1, ref=None):
        return delivery_plan(order_ref=self.ref if ref is None else ref,
                             package_id=pkg, local_state=state,
                             woocommerce_order_id=wc_id)

    def test_created_linked(self):
        self.assertEqual(self.plan()['planning_state'], 'AWAITING_AUTHENTICATED_PROVIDER_CAPTURE_EVIDENCE')

    def test_created_unlinked(self):
        self.assertEqual(self.plan(wc_id=None)['planning_state'], 'REMOTE_ORDER_LINK_MISSING')

    def test_reserved(self):
        self.assertEqual(self.plan('reserved')['planning_state'], 'REMOTE_ORDER_UNCONFIRMED')

    def test_uncertain(self):
        self.assertEqual(self.plan('uncertain')['planning_state'], 'MANUAL_ORDER_RECONCILIATION_REQUIRED')

    def test_disabled(self):
        self.assertEqual(self.plan('disabled')['planning_state'], 'ORDER_DISABLED_NO_DELIVERY')

    def test_money_flags_fail_closed(self):
        for state in ('created', 'reserved', 'uncertain', 'disabled'):
            value = self.plan(state)
            for field in ('provider_payment_verified', 'durable_transaction_claim_exists',
                          'coin_delivery_authorized', 'coin_delivered', 'refund_processed',
                          'wallet_debit_authorized', 'payment_enabled'):
                self.assertIs(value[field], False, (state, field))

    def test_no_status_claims_success(self):
        for state in ('created', 'reserved', 'uncertain', 'disabled'):
            self.assertNotIn('SUCCESS', self.plan(state)['planning_state'])

    def test_bad_order_ref(self):
        for bad in ('BAD', str(uuid4()).upper(), '00000000-0000-4000-8000-000000000000x', True):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.plan(ref=bad)
        with self.assertRaises(ValueError):
            delivery_plan(order_ref=None, package_id=1, local_state='created', woocommerce_order_id=1)

    def test_invalid_package(self):
        for bad in (0, 17, True, '1', None, 1.0):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.plan(pkg=bad)

    def test_invalid_order_state(self):
        for bad in ('paid', 'fulfilled', '', None, 1, True):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.plan(state=bad)

    def test_invalid_wc_id(self):
        for bad in (0, -1, True, '123', 1.0):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.plan(wc_id=bad)

    def test_stable_metadata(self):
        self.assertEqual(self.plan()['source'], 'local_order_only')
        self.assertEqual(self.plan()['provider'], 'QNBpay')
        self.assertEqual(self.plan()['channel'], 'web')

    def test_required_prerequisites(self):
        value = self.plan()
        self.assertGreaterEqual(len(value['required_controls']), 5)
        self.assertIn('ATOMIC_SINGLE_COIN_DELIVERY_REQUIRED', value['lifecycle'])

    def test_no_provider_or_wallet_writes(self):
        for filename in ('woocommerce_qnbpay_delivery_v19.py', 'woocommerce_qnbpay_routes_v19.py'):
            tree = ast.parse((ROOT / filename).read_text(encoding='utf-8'))
            calls = [node.func.attr for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)]
            self.assertFalse(set(calls) & {'commit','flush','add','execute','post','put','patch','delete'})

    def test_account_scoped_read_only_route(self):
        source = (ROOT / 'woocommerce_qnbpay_routes_v19.py').read_text(encoding='utf-8')
        self.assertIn('user_id != user.id', source)
        self.assertIn('@router.get(', source)
        self.assertNotIn('@router.post(', source)

    def test_main_registered(self):
        source = (ROOT / 'main.py').read_text(encoding='utf-8')
        self.assertIn('woocommerce_qnbpay_routes_v19.register_auth(current_user)', source)

    def test_v18_remains_read_only(self):
        source = (ROOT / 'woocommerce_qnbpay_risk_v18.py').read_text(encoding='utf-8')
        self.assertIn('coin_delivery_authorized: bool = False', source)

    def test_v16_still_unverified_only(self):
        source = (ROOT / 'woocommerce_qnbpay_ledger_v16.py').read_text(encoding='utf-8')
        self.assertIn('state = \'unverified\'', source)

if __name__ == '__main__':
    unittest.main()
