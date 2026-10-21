import sys, unittest
from pathlib import Path
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.upload_rewards import compute

class UploadRewardsTest(unittest.TestCase):
    def test_rolling_and_boundaries(self):
        at = datetime(2026, 10, 21, tzinfo=timezone.utc)
        rows = [SimpleNamespace(amount=500, purchased_at=at-timedelta(days=5)), SimpleNamespace(amount=999, purchased_at=at-timedelta(days=31))]
        self.assertEqual(compute(rows, at, (100, 200, 400, 900))['level'], 3)
        self.assertEqual(compute(rows, at, (100, 200, 400, 900))['rolling_purchased'], 500)
    def test_unconfigured_is_locked(self):
        at=datetime.now(timezone.utc)
        obj=compute([SimpleNamespace(amount=99999,purchased_at=at)],at,None)
        self.assertEqual(obj['level'],0)
        self.assertFalse(any(x['unlocked'] for x in obj['tiers']))
if __name__ == '__main__': unittest.main()
