"""Offline catalog checks with synthetic products; no network or payments."""
import unittest
from app.woocommerce_catalog_audit_v7 import validate_catalog, valid_url

PACKAGES = [dict(id=1, total=95, price_try=2), dict(id=2, total=812, price_try=14)]

def rows():
    return [dict(id=11, sku='LIDYA-95', price='2.00', status='publish', virtual=True, type='simple'),
            dict(id=12, sku='LIDYA-812', price='14.00', status='publish', virtual=True, type='simple')]

class WooCatalogAuditV7Tests(unittest.TestCase):
    def test_correct_catalog(self): self.assertEqual(validate_catalog(rows(), PACKAGES), [])
    def test_missing_product(self): self.assertIn('LIDYA-812: missing', validate_catalog(rows()[:1], PACKAGES))
    def test_duplicate(self): self.assertIn('LIDYA-95: duplicate SKU', validate_catalog(rows()+[rows()[0]], PACKAGES))
    def test_price_mismatch(self):
        products=rows();products[0]['price']='3.00'
        self.assertIn('LIDYA-95: price mismatch', validate_catalog(products, PACKAGES))
    def test_not_virtual(self):
        products=rows();products[0]['virtual']=False
        self.assertIn('LIDYA-95: expected virtual simple product', validate_catalog(products, PACKAGES))
    def test_wrong_status(self):
        products=rows();products[0]['status']='draft'
        self.assertIn('LIDYA-95: not published', validate_catalog(products, PACKAGES))
    def test_url_guard(self):
        self.assertTrue(valid_url('https://magaza.lidyachat.com'))
        for url in ['http://magaza.lidyachat.com', 'https://evil.com', 'https://magaza.lidyachat.com.evil.com', 'https://magaza.lidyachat.com:8443', 'https://magaza.lidyachat.com@evil.com', 'https://magaza.lidyachat.com/path']:
            self.assertFalse(valid_url(url), url)
    def test_ignores_other_products(self):
        products=rows()+[dict(id=100, sku='SOMETHING-ELSE', price='5', status='publish')]
        self.assertEqual(validate_catalog(products,PACKAGES),[])

if __name__ == '__main__': unittest.main()
