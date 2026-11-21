import unittest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db import Base
from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app import dealer_routes as d


class RepresentativeV1Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        d.register_auth(lambda: None)
        cls.routes = {r.path: r.endpoint for r in d.router.routes}

    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool)
        Base.metadata.create_all(self.engine, tables=[
            User.__table__, AdminRole.__table__,
            d.DealerInventory.__table__,
            d.DealerDesignation.__table__,
            d.DealerTransfer.__table__,
            d.DealerStockGrant.__table__])
        self.db = sessionmaker(bind=self.engine)()
        self.admin = User(id="admin", public_id="900001",
                          _nickname="Admin", is_active=True)
        self.target = User(id="target", public_id="900002",
                           _nickname="Target", is_active=True)
        self.db.add_all([self.admin, self.target])
        self.db.flush()
        self.db.add(AdminRole(user_id="admin", role="DA"))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def assign(self, kind, actor=None):
        return self.routes["/v1/dealers/admin/assign"](
            body=d.AssignBody(public_id="900002", kind=kind),
            db=self.db, user=actor or self.admin)

    def test_01_non_da_cannot_assign(self):
        with self.assertRaises(HTTPException) as ctx:
            self.assign("support", self.target)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIsNone(self.db.get(d.DealerInventory, "target"))

    def test_02_support_gets_bt_badge(self):
        self.assign("support")
        result = self.routes["/v1/dealers/me"](
            db=self.db, user=self.target)
        self.assertEqual(result["badge"], "BT")
        self.assertEqual(result["kind"], "support")

    def test_03_switch_preserves_stock(self):
        self.assign("coin")
        self.db.get(d.DealerInventory, "target").stock = 750
        self.db.commit()
        self.assign("support")
        self.db.expire_all()
        self.assertEqual(
            self.db.get(d.DealerInventory, "target").stock, 750)
        self.assertEqual(d.designation(self.db, "target"), "support")
        self.assign("coin")
        self.assertEqual(
            self.db.get(d.DealerInventory, "target").stock, 750)

    def test_04_badges_match_roles(self):
        self.assign("support")
        result = self.routes["/v1/dealers/badges"](
            ids="target", db=self.db, user=self.admin)
        self.assertEqual(result["roles"]["target"], "support")


if __name__ == "__main__":
    unittest.main()
