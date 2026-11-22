"""LidyaChat 90 normal hediye + 60 yüzük katalog testleri."""

import ast
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "backend/app"

ITEMS = json.loads(
    (APP / "gift_catalog.json").read_text(encoding="utf-8")
)
ACTIVE_IDS = json.loads(
    (APP / "gift_active_ids.json").read_text(encoding="utf-8")
)
ACTIVE = [g for g in ITEMS if g["id"] in ACTIVE_IDS]
REMOVED = [g for g in ITEMS if g["id"] not in ACTIVE_IDS]


def restriction_helper():
    source = (APP / "main.py").read_text(encoding="utf-8")
    module = ast.parse(source)
    function = next(
        node for node in module.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_active_restriction_gift"
    )
    compiled = compile(
        ast.Module(body=[function], type_ignores=[]),
        str(APP / "main.py"),
        "exec",
    )
    namespace = {
        "GIFT_ITEMS": ITEMS,
        "GIFT_META": {g["name"]: g for g in ITEMS},
        "GIFT_CATALOG": {
            g["name"]: g["price"] for g in ACTIVE
        },
    }
    exec(compiled, namespace)
    return namespace["_active_restriction_gift"]


class GiftCatalog90Tests(unittest.TestCase):

    def test_catalog_counts(self):
        self.assertEqual(len(ITEMS), 200)
        self.assertEqual(len(ACTIVE_IDS), 90)
        self.assertEqual(len(set(ACTIVE_IDS)), 90)
        self.assertEqual(len(ACTIVE), 90)
        self.assertEqual(len(REMOVED), 110)

    def test_category_distribution(self):
        expected = {
            1: 12, 2: 10, 3: 10,
            4: 10, 5: 12, 6: 10,
            7: 10, 8: 8, 9: 8,
        }
        actual = {
            tier: sum(g["tier"] == tier for g in ACTIVE)
            for tier in expected
        }
        self.assertEqual(actual, expected)

    def test_existing_prices_and_visuals_preserved(self):
        for gift in ITEMS:
            self.assertGreater(gift["price"], 0)
            self.assertTrue(gift["name"])
            self.assertTrue(gift["image_url"])

    def test_all_removed_gifts_have_replacements(self):
        resolve = restriction_helper()
        prices = {g["name"]: g["price"] for g in ACTIVE}

        for gift in REMOVED:
            replacement = resolve(gift["name"])
            self.assertIn(replacement, prices)
            self.assertGreaterEqual(
                prices[replacement], gift["price"]
            )

    def test_active_gifts_are_unchanged(self):
        resolve = restriction_helper()
        for gift in ACTIVE:
            self.assertEqual(
                resolve(gift["name"]), gift["name"]
            )

    def test_unknown_legacy_key_has_safe_fallback(self):
        resolve = restriction_helper()
        result = resolve("olmayan-eski-hediye")
        self.assertIn(result, {g["name"] for g in ACTIVE})

    def test_room_and_dm_use_shared_active_catalog(self):
        room = (APP / "room_routes.py").read_text(
            encoding="utf-8"
        )
        main = (APP / "main.py").read_text(
            encoding="utf-8"
        )

        self.assertIn("ACTIVE_GIFT_IDS", room)
        self.assertIn("gift_active_ids.json", room)
        self.assertIn("if gift[\"id\"] in ACTIVE_GIFT_IDS", room)
        self.assertIn("GIFT_META = ", room)

        self.assertIn(
            "for key, price in GIFT_CATALOG.items()", room
        )
        self.assertIn(
            "for key, price in GIFT_CATALOG.items()", main
        )
        self.assertIn(
            "_active_restriction_gift(restriction.gift_key)",
            main,
        )

    def test_60_ring_keys_remain_separate(self):
        room = (APP / "room_routes.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("RING_GIFT_PRICES", room)
        self.assertIn(
            'for _number in range(1, 21):', room
        )
        self.assertIn(
            "GIFT_CATALOG[_ring_key] = _price", room
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
