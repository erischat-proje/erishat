import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import HTTPException
from test_representatives_v1 import RepresentativeV1Tests
from backend.app import dealer_routes as d


class RepresentativeV2Tests(RepresentativeV1Tests):

    def revoke(self, actor=None, confirm="900002"):
        return self.routes["/v1/dealers/admin/revoke"](
            body=d.RevokeBody(
                public_id="900002",
                confirm_public_id=confirm),
            db=self.db,
            user=actor or self.admin)

    def test_05_legacy_dealer_keeps_lb(self):
        self.assign("dealer")
        result = self.routes["/v1/dealers/me"](
            db=self.db, user=self.target)
        self.assertEqual(result["kind"], "dealer")
        self.assertEqual(result["badge"], "LB")

    def test_06_revoke_preserves_stock(self):
        self.assign("support")
        self.db.get(d.DealerInventory, "target").stock = 750
        self.db.commit()

        self.revoke()
        self.db.expire_all()

        inventory = self.db.get(d.DealerInventory, "target")
        self.assertFalse(inventory.active)
        self.assertEqual(inventory.stock, 750)
        self.assertIsNone(
            self.db.get(d.DealerDesignation, "target"))

        with self.assertRaises(HTTPException) as ctx:
            self.routes["/v1/dealers/me"](
                db=self.db, user=self.target)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_07_non_da_cannot_revoke(self):
        self.assign("dealer")
        with self.assertRaises(HTTPException) as ctx:
            self.revoke(actor=self.target)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertTrue(
            self.db.get(d.DealerInventory, "target").active)

    def test_08_wrong_confirmation_rejected(self):
        self.assign("support")
        with self.assertRaises(HTTPException) as ctx:
            self.revoke(confirm="WRONG-ID")
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertTrue(
            self.db.get(d.DealerInventory, "target").active)

    def test_09_restore_starts_as_lb(self):
        self.assign("support")
        self.revoke()
        self.assign("dealer")

        result = self.routes["/v1/dealers/me"](
            db=self.db, user=self.target)
        self.assertEqual(result["badge"], "LB")
        self.assertEqual(result["kind"], "dealer")
        self.assertTrue(
            self.db.get(d.DealerInventory, "target").active)
