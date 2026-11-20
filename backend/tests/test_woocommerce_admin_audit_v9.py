"""V9 safety checks; never make real network requests."""
import ast
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / 'app/woocommerce_admin_audit_v9.py').read_text()
MAIN = (ROOT / 'app/main.py').read_text()
V6 = (ROOT / 'app/woocommerce_order_v6.py').read_text()

class WooAdminAuditV9Tests(unittest.TestCase):
    def test_compiles(self):
        compile(SRC, 'woocommerce_admin_audit_v9.py', 'exec')
    def test_da_only(self):
        self.assertIn("role.role != 'DA'", SRC)
        self.assertIn('db.get(AdminRole, user.id)', SRC)
        self.assertIn('require_da(db, user)', SRC)
    def test_no_post(self):
        self.assertNotIn('requests.post(', SRC)
        self.assertNotIn('requests.put(', SRC)
        self.assertNotIn('requests.patch(', SRC)
        self.assertNotIn('requests.delete(', SRC)
    def test_no_db_writes(self):
        self.assertNotIn('db.commit(', SRC)
        self.assertNotIn('db.add(', SRC)
        self.assertNotIn('db.delete(', SRC)
    def test_no_wallet(self):
        self.assertNotIn('user.lidya', SRC)
        self.assertIn("'payment_verified': False", SRC)
        self.assertIn("'coin_delivery_verified': False", SRC)
    def test_bound_search(self):
        self.assertIn('per_page=100, max_pages=10', SRC)
        self.assertIn('le=50', SRC)
    def test_no_unsafe_retry(self):
        self.assertIn("'safe_to_retry_order_post': False", SRC)
        self.assertIn('reconcile_pages(', SRC)
    def test_no_redirects(self):
        self.assertIn('allow_redirects=False', SRC)
        self.assertIn('valid_url(settings.woocommerce_rest_base_url)', SRC)
    def test_registered(self):
        self.assertIn('woocommerce_admin_audit_v9.register_auth(current_user)', MAIN)
    def test_prior_safety_kept(self):
        self.assertIn('record.state = \'uncertain\'', V6)
    def test_only_get_routes(self):
        self.assertEqual(SRC.count('@router.get('), 2)
        self.assertNotIn('@router.post(', SRC)

if __name__ == '__main__':
    unittest.main()
