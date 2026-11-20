from pathlib import Path
import sys
import unittest
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.woocommerce_qnbpay_audit_v14 import audit_plan

REF = str(uuid4())

class V14ReadOnlyAudit(unittest.TestCase):
    def make(self, state='created', wc_id=123):
        return audit_plan(order_ref=REF, package_id=1, local_state=state,
                          woocommerce_order_id=wc_id)
    def test_created_never_proves_payment(self):
        result = self.make()
        self.assertFalse(result['payment_verified'])
        self.assertFalse(result['coin_delivery_authorized'])
    def test_duplicate_order_post_always_denied(self):
        for state in ('created','uncertain','reserved','disabled'):
            self.assertFalse(self.make(state, None)['retry_order_creation_allowed'])
    def test_uncertain_is_ambiguous(self):
        self.assertEqual(self.make('uncertain',None)['reconciliation_state'], 'AMBIGUOUS_REMOTE_CREATION_DO_NOT_RETRY')
    def test_created_without_wc_id(self):
        self.assertEqual(self.make('created',None)['reconciliation_state'], 'LOCAL_REMOTE_LINK_MISSING')
    def test_created_with_wc_id_requires_review(self):
        self.assertEqual(self.make()['reconciliation_state'], 'REMOTE_ORDER_LINK_REQUIRES_REVIEW')
    def test_reserved(self):
        self.assertEqual(self.make('reserved',None)['reconciliation_state'], 'RESERVATION_ONLY_DO_NOT_RETRY')
    def test_disabled(self):
        self.assertEqual(self.make('disabled',None)['reconciliation_state'], 'DISABLED')
    def test_reject_bad_id(self):
        with self.assertRaises(ValueError): self.make('created',0)
    def test_reject_bad_package(self):
        with self.assertRaises(ValueError): audit_plan(order_ref=REF,package_id=True,local_state='created',woocommerce_order_id=1)
    def test_reject_bad_ref(self):
        with self.assertRaises(ValueError): audit_plan(order_ref='not-a-uuid',package_id=1,local_state='created',woocommerce_order_id=1)
    def test_route_account_scoped(self):
        src=(ROOT/'backend/app/woocommerce_qnbpay_routes_v14.py').read_text()
        self.assertIn('Depends(current_user)',src)
        self.assertIn('row.user_id != user.id',src)
        self.assertIn("HTTPException(404",src)
        self.assertNotIn('requests.post',src)
    def test_router_is_registered(self):
        src=(ROOT/'backend/app/main.py').read_text()
        self.assertIn('woocommerce_qnbpay_routes_v14.register_auth(current_user)',src)
    def test_v13_stays_disabled(self):
        from app.woocommerce_qnbpay_gate_v13 import readiness
        status=readiness()
        self.assertFalse(status['payment_enabled'])
        self.assertFalse(status['coin_delivery_enabled'])
    def test_v12_stays_disabled(self):
        src=(ROOT/'frontend/payment-assistance.js').read_text()
        self.assertIn('actionButton.disabled=true',src)

if __name__ == '__main__': unittest.main()
