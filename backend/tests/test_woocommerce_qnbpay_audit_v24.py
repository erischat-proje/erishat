"""Offline tests for V24 runner itself; no app, DB or network calls."""
import ast
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from scripts.qnbpay_v24_prelaunch_audit import SUITES, CRITICAL_MARKERS, audit_layout


class V24PrelaunchAuditTests(unittest.TestCase):
    def test_suites_are_distinct(self):
        self.assertEqual(len(SUITES), len(set(SUITES)))

    def test_prior_stages_included(self):
        for n in range(17, 24):
            self.assertTrue(any(f'v{n}' in s for s in SUITES))

    def test_no_psp_or_wallet_mutations(self):
        source = (Path(__file__).resolve().parents[1] / 'scripts' /
                  'qnbpay_v24_prelaunch_audit.py').read_text()
        for forbidden in ('requests.post(', 'wallet.balance =', 'db.commit(',
                          'CREATE TABLE ', 'UPDATE users ', 'DATABASE_URL'):
            self.assertNotIn(forbidden, source)

    def test_source_syntax(self):
        path = Path(__file__).resolve().parents[1] / 'scripts' / 'qnbpay_v24_prelaunch_audit.py'
        ast.parse(path.read_text())

    def test_required_markers_defined(self):
        self.assertIn('woocommerce_qnbpay_event_journal_v21.py', CRITICAL_MARKERS)

    def test_missing_layout_rejected(self):
        with TemporaryDirectory() as d, self.assertRaises(ValueError):
            audit_layout(Path(d))

    def test_missing_suites_flagged(self):
        with TemporaryDirectory() as d:
            folder = Path(d) / 'backend'
            (folder / 'app').mkdir(parents=True)
            (folder / 'tests').mkdir()
            (folder / 'app' / 'main.py').write_text('# test')
            result = audit_layout(Path(d))
            self.assertEqual(set(result['missing_test_suites']), set(SUITES))
            self.assertFalse(result['live_payment_ready'])

    def test_fake_payment_approval_never_reported(self):
        with TemporaryDirectory() as d:
            folder = Path(d) / 'backend'
            (folder / 'app').mkdir(parents=True)
            (folder / 'tests').mkdir()
            (folder / 'app' / 'main.py').write_text('# test')
            self.assertFalse(audit_layout(Path(d))['live_payment_ready'])


if __name__ == '__main__':
    unittest.main()
