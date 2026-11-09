"""Read-only Google Play voided purchase reconciliation tests."""
import hashlib
from types import SimpleNamespace
from app.play_billing import _voided_audit_rows


def _r(token, order='GPA.OK', status='credited'):
    return SimpleNamespace(id=13, token_sha256=hashlib.sha256(token.encode()).hexdigest(),
                           user_id='test-user', product_id='lidya_001',
                           google_order_id=order, purchase_status=status, test_purchase=True)


def test_matched_and_no_raw_token_leak():
    token='private-google-token'
    receipt=_r(token)
    items=[{'purchaseToken':token, 'orderId':'GPA.OK','voidedReason':1,'voidedSource':0,'voidedTimeMillis':'12345'}]
    out=_voided_audit_rows(items, {receipt.token_sha256:receipt})
    assert len(out)==1 and out[0]['receipt_id']==13 and out[0]['lidya']==95
    assert out[0]['action']=='manual_review_required'
    assert token not in str(out) and 'GPA.OK' not in str(out)


def test_order_mismatch_not_attributed():
    receipt=_r('a')
    assert _voided_audit_rows([{'purchaseToken':'a','orderId':'GPA.FAKE'}],{receipt.token_sha256:receipt})==[]


def test_duplicate_does_not_repeat():
    receipt=_r('a')
    item={'purchaseToken':'a','orderId':'GPA.OK'}
    assert len(_voided_audit_rows([item,item],{receipt.token_sha256:receipt}))==1


def test_unmatched_and_invalid_ignored():
    assert _voided_audit_rows([{'purchaseToken':'not-recorded','orderId':'GPA.OK'},None,{}],{})==[]
