import unittest
from app.woocommerce_order_reconcile_v8 import reconcile_pages

ORDER_REF='11111111-2222-3333-4444-555555555555'
PACKAGES=[{'id':1,'total':95,'price_try':2}]

def order(**changes):
    obj={'id':12,'currency':'TRY','total':'2.00','line_items':[{'sku':'LIDYA-95','quantity':1,'total':'2.00'}],
         'meta_data':[{'key':'_lidyachat_order_ref','value':ORDER_REF},
                      {'key':'_lidyachat_user_id','value':'u1'},
                      {'key':'_lidyachat_package_id','value':'1'}]}
    obj.update(changes)
    return obj

def scan(pages, **kwargs):
    return reconcile_pages(lambda page,size: pages[page-1] if page <=len(pages) else [],
                           order_ref=ORDER_REF,user_id='u1',package_id=1,packages=PACKAGES,**kwargs)

class ReconcileTests(unittest.TestCase):
    def test_valid(self): self.assertEqual(scan([[order()]]).verdict,'MATCHED')
    def test_no_match(self): self.assertEqual(scan([[]]).verdict,'NOT_FOUND')
    def test_wrong_user(self):
        x=order();x['meta_data'][1]['value']='u2';self.assertEqual(scan([[x]]).verdict,'CONFLICT')
    def test_price_tamper(self): self.assertEqual(scan([[order(total='3.00')]]).verdict,'CONFLICT')
    def test_duplicate(self): self.assertEqual(scan([[order(),order(id=13)]]).verdict,'CONFLICT')
    def test_incomplete_limit(self): self.assertEqual(scan([[order()]],per_page=1,max_pages=1).verdict,'INCONCLUSIVE')
    def test_incomplete_absence(self): self.assertEqual(scan([[{'id':1}]],per_page=1,max_pages=1).verdict,'INCONCLUSIVE')
    def test_not_automatically_retry(self):
        import inspect,app.woocommerce_order_reconcile_v8 as m
        src=inspect.getsource(m)
        self.assertNotIn('requests.post(',src)
        self.assertNotIn('db.commit(',src)
        self.assertNotIn('user.lidya',src)
    def test_duplicate_metadata(self):
        x=order();x['meta_data'].append({'key':'_lidyachat_user_id','value':'u1'})
        self.assertEqual(scan([[x]]).verdict,'CONFLICT')

if __name__=='__main__':unittest.main()
