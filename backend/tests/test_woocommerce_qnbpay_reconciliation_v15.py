from pathlib import Path
import sys
import unittest
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.woocommerce_qnbpay_reconciliation_v15 import (
    ReferenceClaim, check_reference_conflicts, payment_plan
)

REF = str(uuid4())
OTHER = str(uuid4())

class V15PaymentReconciliation(unittest.TestCase):
    def plan(self, state='created', wc_id=43):
        return payment_plan(order_ref=REF, package_id=1,
                            local_state=state, woocommerce_order_id=wc_id)

    def claim(self, existing=(), ref=REF, wc_id=43, tx='transaction_12345'):
        return check_reference_conflicts(provider='QNBpay', transaction_id=tx,
                                         order_ref=ref, wc_order_id=wc_id,
                                         existing=existing)

    def test_all_flags_fail_closed(self):
        for state in ('created','uncertain','reserved','disabled'):
            p=self.plan(state)
            for key in ('psp_signature_verified','provider_capture_verified',
                        'price_currency_verified','payment_verified',
                        'coin_delivery_authorized','may_retry_order_creation',
                        'durable_transaction_claim_exists'):
                self.assertIs(p[key], False, key)
    def test_created_requires_verification(self):
        self.assertEqual(self.plan()['matching_state'], 'AWAITING_VERIFIED_PSP_TRANSACTION')
    def test_missing_link(self):
        self.assertEqual(self.plan('created',None)['matching_state'], 'MISSING_WOOCOMMERCE_LINK')
    def test_uncertain_requires_manual_review(self):
        self.assertIn('MANUAL_RECONCILIATION',self.plan('uncertain')['matching_state'])
    def test_disabled(self):
        self.assertEqual(self.plan('disabled')['matching_state'],'DISABLED')
    def test_reserved(self):
        self.assertIn('RESERVED',self.plan('reserved')['matching_state'])
    def test_rejects_invalid_ref(self):
        with self.assertRaises(ValueError): payment_plan(order_ref='abc',package_id=1,local_state='created',woocommerce_order_id=3)
    def test_rejects_invalid_package(self):
        with self.assertRaises(ValueError): payment_plan(order_ref=REF,package_id=True,local_state='created',woocommerce_order_id=3)
    def test_rejects_invalid_wc_id(self):
        with self.assertRaises(ValueError): self.plan('created',False)
    def test_rejects_invalid_state(self):
        with self.assertRaises(ValueError): self.plan('paid')
    def test_unseen_transaction_is_not_verified(self):
        self.assertEqual(self.claim(),'UNSEEN_REFERENCE_NOT_VERIFIED')
    def test_recorded_transaction_not_redelivered(self):
        record=ReferenceClaim('QNBpay','transaction_12345',REF,43)
        self.assertEqual(self.claim([record]),'ALREADY_RECORDED_NO_REDELIVERY')
    def test_reused_transaction_rejected(self):
        record=ReferenceClaim('QNBpay','transaction_12345',OTHER,44)
        self.assertEqual(self.claim([record]),'CONFLICT_REFERENCE_REUSED_FOR_OTHER_ORDER')
    def test_duplicate_stored_claims_rejected(self):
        record=ReferenceClaim('QNBpay','transaction_12345',REF,43)
        self.assertEqual(self.claim([record,record]),'CONFLICT_DUPLICATE_STORED_REFERENCE')
    def test_other_provider_does_not_match(self):
        record=ReferenceClaim('OtherPSP','transaction_12345',OTHER,44)
        self.assertEqual(self.claim([record]),'UNSEEN_REFERENCE_NOT_VERIFIED')
    def test_rejects_invalid_transaction_id(self):
        with self.assertRaises(ValueError): self.claim(tx='x')
    def test_rejects_wrong_provider(self):
        with self.assertRaises(ValueError): check_reference_conflicts(provider='Unknown',transaction_id='transaction_12345',order_ref=REF,wc_order_id=43,existing=[])
    def test_rejects_untrusted_inventory(self):
        with self.assertRaises(ValueError): self.claim([{'provider':'QNBpay'}])
    def test_route_auth_and_ownership(self):
        s=(ROOT/'backend/app/woocommerce_qnbpay_routes_v15.py').read_text()
        self.assertIn('Depends(current_user)',s)
        self.assertIn('order.user_id != user.id',s)
        self.assertIn('HTTPException(404',s)
    def test_router_registered(self):
        s=(ROOT/'backend/app/main.py').read_text()
        self.assertIn('woocommerce_qnbpay_routes_v15.register_auth(current_user)',s)
    def test_no_payment_writes(self):
        s=(ROOT/'backend/app/woocommerce_qnbpay_routes_v15.py').read_text()
        for forbidden in ('requests.post(', 'httpx.post(', 'db.commit(', 'db.add(', 'wallet', '@router.post'):
            self.assertNotIn(forbidden,s)
    def test_v13_v12_still_disabled(self):
        from app.woocommerce_qnbpay_gate_v13 import readiness
        self.assertFalse(readiness()['payment_enabled'])
        self.assertFalse(readiness()['coin_delivery_enabled'])
        s=(ROOT/'frontend/payment-assistance.js').read_text()
        self.assertIn('actionButton.disabled=true',s)

if __name__ == '__main__':
    unittest.main()
