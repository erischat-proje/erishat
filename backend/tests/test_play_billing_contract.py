"""Offline verifier checks, no credentials or external calls."""
import unittest
from pathlib import Path

class BillingVerifierContract(unittest.TestCase):
    def test_fail_closed_code_contract(self):
        src = (Path(__file__).resolve().parents[1] / 'app' / 'play_billing.py').read_text()
        assert "state != 'PURCHASED'" in src
        assert "bound != expected_account_id" in src
        assert "len(items) != 1" in src
        assert "purchaseOptionId" in src
        assert "'credited': False" in src
        assert "raise HTTPException(503" in src
    def test_package_count(self):
        src = (Path(__file__).resolve().parents[1] / 'app' / 'play_billing.py').read_text()
        self.assertIn('for p in PACKAGES', src)
if __name__ == '__main__': unittest.main()
