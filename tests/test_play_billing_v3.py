"""Play V3 strict receipt validation: pure offline tests, no Google or DB access."""
import unittest
from app.play_billing import verify_payload, verify_credited_payload

PRODUCT='lidya_008'
ACCOUNT='a'*64

def sample():
    return {'purchaseStateContext':{'purchaseState':'PURCHASED'},
            'purchaseCompletionTime':'2026-11-09T00:01:00Z',
            'orderId':'GPA.1234-5678-9012-34567',
            'obfuscatedExternalAccountId':ACCOUNT,
            'productLineItem':[{'productId':PRODUCT,'productOfferDetails':{
                'purchaseOptionId':'standart','quantity':1,'refundableQuantity':1,
                'consumptionState':'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}]}

class PlayVerificationV3(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(verify_payload(sample(),PRODUCT,ACCOUNT)['order_id'],sample()['orderId'])
    def test_refunded(self):
        d=sample();d['productLineItem'][0]['productOfferDetails']['refundableQuantity']=0
        with self.assertRaises(ValueError):verify_payload(d,PRODUCT,ACCOUNT)
    def test_missing_refundable_quantity(self):
        d=sample();del d['productLineItem'][0]['productOfferDetails']['refundableQuantity']
        with self.assertRaises(ValueError):verify_payload(d,PRODUCT,ACCOUNT)
    def test_multi_quantity(self):
        d=sample();d['productLineItem'][0]['productOfferDetails']['quantity']=2
        with self.assertRaises(ValueError):verify_payload(d,PRODUCT,ACCOUNT)
    def test_consumed(self):
        d=sample();d['productLineItem'][0]['productOfferDetails']['consumptionState']='CONSUMPTION_STATE_CONSUMED'
        with self.assertRaises(ValueError):verify_payload(d,PRODUCT,ACCOUNT)
    def test_pending(self):
        d=sample();d['purchaseStateContext']['purchaseState']='PENDING'
        with self.assertRaises(ValueError):verify_payload(d,PRODUCT,ACCOUNT)
    def test_wrong_account(self):
        with self.assertRaises(ValueError):verify_payload(sample(),PRODUCT,'b'*64)
    def test_wrong_product(self):
        with self.assertRaises(ValueError):verify_payload(sample(),'lidya_009',ACCOUNT)
    def test_missing_order(self):
        d=sample();del d['orderId']
        with self.assertRaises(ValueError):verify_payload(d,PRODUCT,ACCOUNT)


def test_retry_consumed_valid():
    p=sample()
    p['productLineItem'][0]['productOfferDetails']['consumptionState']='CONSUMPTION_STATE_CONSUMED'
    assert verify_credited_payload(p,PRODUCT,ACCOUNT,p['orderId'],False) is True


def test_retry_pending_consumption_valid():
    p=sample()
    assert verify_credited_payload(p,PRODUCT,ACCOUNT,p['orderId'],False) is False


def test_retry_refunded_rejected():
    p=sample()
    p['productLineItem'][0]['productOfferDetails']['consumptionState']='CONSUMPTION_STATE_CONSUMED'
    p['productLineItem'][0]['productOfferDetails']['refundableQuantity']=0
    with unittest.TestCase().assertRaises(ValueError):
        verify_credited_payload(p,PRODUCT,ACCOUNT,p['orderId'],False)


def test_retry_wrong_order_rejected():
    p=sample()
    with unittest.TestCase().assertRaises(ValueError):
        verify_credited_payload(p,PRODUCT,ACCOUNT,'GPA.FAKE',False)


def test_retry_wrong_account_rejected():
    p=sample()
    with unittest.TestCase().assertRaises(ValueError):
        verify_credited_payload(p,PRODUCT,'b'*64,p['orderId'],False)


def test_retry_test_purchase_mismatch_rejected():
    p=sample()
    with unittest.TestCase().assertRaises(ValueError):
        verify_credited_payload(p,PRODUCT,ACCOUNT,p['orderId'],True)

if __name__=='__main__':unittest.main()
