"""Offline V17 schema contract and safe-target tests. Does not connect to DB."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
GATE = ROOT / 'backend/scripts/qnbpay_v17_disposable_pg.py'
SCHEMA = ROOT / 'backend/app/woocommerce_qnbpay_ledger_v16.py'

class V17PostgresSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('v17_disposable', GATE)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def test_v16_schema_exists(self): self.assertIn('qnbpay_transaction_references_v16', SCHEMA.read_text())
    def test_provider_transaction_unique(self): self.assertIn("UniqueConstraint('provider', 'transaction_id'", SCHEMA.read_text())
    def test_order_unique(self): self.assertIn("UniqueConstraint('order_ref'", SCHEMA.read_text())
    def test_wc_unique(self): self.assertIn("UniqueConstraint('woocommerce_order_id'", SCHEMA.read_text())
    def test_default_unverified(self): self.assertIn("server_default='unverified'", SCHEMA.read_text())
    def test_no_psp_access(self):
        s=GATE.read_text()
        self.assertNotIn('requests.post(',s)
        self.assertNotIn('from app.',s)
    def test_reject_no_consent(self):
        with self.assertRaises(ValueError):
            self.module.validate_target('postgresql://a:b@db/lidyachat_v17_test', '')
    def test_reject_prod_name(self):
        with self.assertRaises(ValueError):
            self.module.validate_target('postgresql://a:b@db/railway', self.module.CONSENT)
    def test_reject_sqlite(self):
        with self.assertRaises(ValueError):
            self.module.validate_target('sqlite:///lidyachat_v17_test', self.module.CONSENT)
    def test_accept_separate_pg_name(self):
        self.assertEqual(self.module.validate_target('postgresql://a:b@db/lidyachat_v17_test', self.module.CONSENT), 'postgresql://a:b@db/lidyachat_v17_test')

if __name__ == '__main__': unittest.main()
