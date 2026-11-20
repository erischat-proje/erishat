from pathlib import Path
import sys
import unittest
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.woocommerce_qnbpay_risk_v18 import review_plan

REF = str(uuid4())


class V18RiskPlan(unittest.TestCase):
    def plan(self, state='created', wc=123):
        return review_plan(order_ref=REF, package_id=3, local_state=state,
                           woocommerce_order_id=wc)

    def test_created_with_wc_id(self):
        self.assertEqual(self.plan()['review_state'], 'ORDER_LINKED_PROVIDER_EVIDENCE_NOT_AVAILABLE')

    def test_created_without_wc_id(self):
        self.assertEqual(self.plan(wc=None)['review_state'], 'REMOTE_ORDER_LINK_MISSING')

    def test_uncertain(self):
        self.assertEqual(self.plan(state='uncertain')['review_state'], 'AMBIGUOUS_ORDER_REQUIRES_MANUAL_RECONCILIATION')

    def test_reserved(self):
        self.assertEqual(self.plan(state='reserved')['review_state'], 'RESERVATION_NOT_PROOF_OF_PAYMENT')

    def test_disabled(self):
        self.assertEqual(self.plan(state='disabled')['review_state'], 'ORDER_DISABLED_NO_PROVIDER_EVIDENCE')

    def test_all_money_flags_disabled(self):
        for state in ('reserved', 'uncertain', 'created', 'disabled'):
            p = self.plan(state)
            for key in ('provider_payment_verified', 'refund_observed', 'chargeback_observed',
                        'coin_delivery_authorized', 'automatic_wallet_debit_authorized',
                        'refund_execution_enabled'):
                self.assertIs(p[key], False, key)

    def test_reject_bad_ref(self):
        with self.assertRaises(ValueError):
            review_plan(order_ref='abc', package_id=1, local_state='created', woocommerce_order_id=12)

    def test_reject_bad_package_bool(self):
        with self.assertRaises(ValueError):
            review_plan(order_ref=REF, package_id=True, local_state='created', woocommerce_order_id=12)

    def test_reject_bad_package_range(self):
        with self.assertRaises(ValueError):
            review_plan(order_ref=REF, package_id=17, local_state='created', woocommerce_order_id=12)

    def test_reject_state(self):
        with self.assertRaises(ValueError):
            self.plan('paid')

    def test_reject_wc_id(self):
        with self.assertRaises(ValueError):
            self.plan(wc=False)

    def test_route_account_scoped(self):
        src=(ROOT/'backend/app/woocommerce_qnbpay_routes_v18.py').read_text()
        self.assertIn('Depends(current_user)', src)
        self.assertIn('row.user_id != user.id', src)
        self.assertIn('HTTPException(404',src)
        self.assertIn('@router.get',src)
        self.assertNotIn('@router.post',src)

    def test_no_payment_writes(self):
        src=(ROOT/'backend/app/woocommerce_qnbpay_routes_v18.py').read_text()
        for banned in ('requests.post', 'db.commit(', 'wallet', 'set_paid', 'checkout-complete'):
            self.assertNotIn(banned, src)

    def test_main_registered(self):
        src=(ROOT/'backend/app/main.py').read_text()
        self.assertIn('woocommerce_qnbpay_routes_v18.register_auth(current_user)',src)

    def test_v13_stays_disabled(self):
        from app.woocommerce_qnbpay_gate_v13 import readiness
        self.assertFalse(readiness()['payment_enabled'])
        self.assertFalse(readiness()['coin_delivery_enabled'])

    def test_v12_stays_disabled(self):
        src=(ROOT/'frontend/payment-assistance.js').read_text()
        self.assertIn('actionButton.disabled=true',src)


if __name__=='__main__': unittest.main()
