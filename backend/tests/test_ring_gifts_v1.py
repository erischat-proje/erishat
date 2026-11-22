"""LidyaChat ring gift regression checks."""
import ast
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

class RingGiftTests(unittest.TestCase):

    def test_60_rings_and_prices(self):
        source = read("backend/app/room_routes.py")
        tree = ast.parse(source)
        prices = None

        for node in tree.body:
            if isinstance(node, ast.Assign):
                if any(
                    isinstance(t, ast.Name)
                    and t.id == "RING_GIFT_PRICES"
                    for t in node.targets
                ):
                    prices = ast.literal_eval(node.value)

        self.assertEqual(
            prices,
            {"copper": 1200, "silver": 2100, "gold": 2800}
        )
        keys = [
            f"{metal}-{n}"
            for metal in prices
            for n in range(1, 21)
        ]
        self.assertEqual(len(keys), 60)
        self.assertEqual(len(set(keys)), 60)
        self.assertIn("GIFT_CATALOG[_ring_key] = _price", source)
        self.assertIn("GIFT_META[_ring_key]", source)

    def test_room_and_dm_share_catalog(self):
        room = read("backend/app/room_routes.py")
        main = read("backend/app/main.py")

        self.assertIn("GIFT_CATALOG.get(payload.gift_key)", room)
        self.assertIn("GIFT_CATALOG.get(gift_key)", main)
        self.assertIn("GIFT_META[gift_key]", main)

    def test_gift_categories(self):
        room = read("frontend/room-gift-ui-live.js")
        dm = read("frontend/dm-live.js")

        room_categories = next(
            line for line in room.splitlines()
            if "const cats=" in line
        )
        dm_categories = next(
            line for line in dm.splitlines()
            if "const categories=" in line
            and "💍 Yüzükler" in line
        )

        self.assertIn("'rings','💍 Yüzükler'", room_categories)
        self.assertIn("'rings','💍 Yüzükler'", dm_categories)
        self.assertNotIn("'all','Tüm hediyeler'", room_categories)
        self.assertNotIn("'all','Tümü'", dm_categories)

    def test_relationship_system_unchanged(self):
        room = read("frontend/room-gift-ui-live.js")
        relationship = read("frontend/relationship-live.js")

        self.assertNotIn("openRingFromGift", room)
        self.assertNotIn("openRingFromGift", relationship)

    def test_animation_scope_and_deduplication(self):
        room = read("backend/app/room_routes.py")
        stage = read("frontend/ring-gift-stage-v1.js")

        self.assertIn("ring_delivery_id", room)
        self.assertIn("seen.has(unique)", stage)
        self.assertIn("'erischat:room-gift'", stage)
        self.assertIn("'erischat:dm-gift'", stage)
        self.assertIn("'dm_message'", stage)

    def test_mp4_asset(self):
        path = ROOT / "frontend/LidyaChat_Yuzuk_Teklifi_5sn_2x.mp4"
        self.assertTrue(path.is_file())
        self.assertGreater(path.stat().st_size, 100000)

        with path.open("rb") as f:
            header = f.read(16)
        self.assertIn(b"ftyp", header)

    def test_script_loaded(self):
        html = read("frontend/erischat-main.html")
        self.assertIn("ring-gift-stage-v1.js", html)

if __name__ == "__main__":
    unittest.main(verbosity=2)
