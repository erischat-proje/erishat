"""V23 offline test cases; no network or database access."""
import copy
import unittest
from app.woocommerce_qnbpay_preflight_v23 import check_offline_snapshot, PreflightMismatch

REF='dd0959e6-b0fc-4c03-b03f-15e0b7c44c01'
LOCAL={'id':REF,'user_id':'test-user-001','package_id':1,'state':'created','wc_order_id':123}
SNAP={'id':123,'currency':'TRY','status':'pending','date_paid':None,
      'lidyachat_user_id':'test-user-001','lidyachat_order_ref':REF,
      'lidyachat_package_id':1,'line_items':[{'sku':'LIDYA-95','quantity':1,'total':'2.00'}],
      'total':'2.00','shipping_total':'0','discount_total':'0',
      'fee_total':'0','total_tax':'0'}
CAT=({'id':1,'total':95,'price_try':2},)

class V23PreflightTests(unittest.TestCase):
    def run_preflight(self,local=None,snap=None,cat=None):
        return check_offline_snapshot(local_order=copy.deepcopy(LOCAL if local is None else local),
             wc_snapshot=copy.deepcopy(SNAP if snap is None else snap),catalog=copy.deepcopy(CAT if cat is None else cat))
    def bad_local(self,key,value):
        item=dict(LOCAL);item[key]=value
        with self.assertRaises(PreflightMismatch):self.run_preflight(local=item)
    def bad_snap(self,key,value):
        item=copy.deepcopy(SNAP);item[key]=value
        with self.assertRaises(PreflightMismatch):self.run_preflight(snap=item)
    def test_valid_read_only_preflight(self):
        p=self.run_preflight();self.assertEqual(p['expected_amount_kurus'],200)
    def test_all_payment_and_delivery_flags_false(self):
        p=self.run_preflight()
        for field in ('psp_authenticated','provider_capture_verified','payment_authorized','coin_delivery_authorized','payment_enabled'):
            self.assertIs(p[field],False)
    def test_wrong_user(self):self.bad_snap('lidyachat_user_id','other-user')
    def test_wrong_ref(self):self.bad_snap('lidyachat_order_ref','other-order')
    def test_wrong_package_metadata(self):self.bad_snap('lidyachat_package_id',2)
    def test_boolean_package_metadata(self):self.bad_snap('lidyachat_package_id',True)
    def test_wrong_wc_id(self):self.bad_snap('id',124)
    def test_wrong_currency(self):self.bad_snap('currency','USD')
    def test_claimed_paid_order(self):self.bad_snap('status','completed')
    def test_paid_date_present(self):self.bad_snap('date_paid','2026-11-21')
    def test_wrong_product(self):
        s=copy.deepcopy(SNAP);s['line_items'][0]['sku']='LIDYA-96'
        with self.assertRaises(PreflightMismatch):self.run_preflight(snap=s)
    def test_quantity_two(self):
        s=copy.deepcopy(SNAP);s['line_items'][0]['quantity']=2
        with self.assertRaises(PreflightMismatch):self.run_preflight(snap=s)
    def test_boolean_quantity(self):
        s=copy.deepcopy(SNAP);s['line_items'][0]['quantity']=True
        with self.assertRaises(PreflightMismatch):self.run_preflight(snap=s)
    def test_two_products(self):
        s=copy.deepcopy(SNAP);s['line_items'].append(s['line_items'][0])
        with self.assertRaises(PreflightMismatch):self.run_preflight(snap=s)
    def test_wrong_item_amount(self):
        s=copy.deepcopy(SNAP);s['line_items'][0]['total']='3.00'
        with self.assertRaises(PreflightMismatch):self.run_preflight(snap=s)
    def test_wrong_order_amount(self):self.bad_snap('total','1.99')
    def test_decimal_comma_rejected(self):self.bad_snap('total','2,00')
    def test_float_amount_rejected(self):self.bad_snap('total',2.0)
    def test_negative_amount_rejected(self):self.bad_snap('total','-2.00')
    def test_adjusted_tax_rejected(self):self.bad_snap('total_tax','0.01')
    def test_adjusted_shipping_rejected(self):self.bad_snap('shipping_total','1.00')
    def test_adjusted_discount_rejected(self):self.bad_snap('discount_total','1.00')
    def test_adjusted_fee_rejected(self):self.bad_snap('fee_total','0.01')
    def test_uncertain_state(self):self.bad_local('state','uncertain')
    def test_disabled_state(self):self.bad_local('state','disabled')
    def test_bad_ref(self):self.bad_local('id','not-a-uuid')
    def test_package_zero(self):self.bad_local('package_id',0)
    def test_package_boolean(self):self.bad_local('package_id',True)
    def test_invalid_catalog(self):
        with self.assertRaises(PreflightMismatch):self.run_preflight(cat=({'id':1,'total':95,'price_try':-2},))
    def test_duplicate_catalog_entry(self):
        with self.assertRaises(PreflightMismatch):self.run_preflight(cat=CAT+CAT)
    def test_not_provider_verification(self):
        p=self.run_preflight();self.assertIn('not evidence of payment',p['notes'][0])
    def test_no_io_in_module(self):
        from pathlib import Path
        src=(Path(__file__).resolve().parents[1]/'app'/'woocommerce_qnbpay_preflight_v23.py').read_text()
        for forbidden in ('requests.post(', 'db.commit(', 'wallet.balance', 'capture_payment(', 'create_engine('):
            self.assertNotIn(forbidden,src)
