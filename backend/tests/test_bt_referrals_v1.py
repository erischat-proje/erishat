"""BT kod verir, LB kod girerek kalici aktivasyon yapar."""
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db import Base
from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app import dealer_routes as d
from backend.app.dealer_referrals import (
    BTReferral, LBReferral, BTActivationBody,
)


class BTReferralV2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        d.register_auth(lambda: None)
        cls.routes = {
            r.path: r.endpoint for r in d.router.routes
        }

    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine, tables=[
            User.__table__, AdminRole.__table__,
            d.DealerInventory.__table__,
            d.DealerDesignation.__table__,
            d.DealerTransfer.__table__,
            d.DealerStockGrant.__table__,
            BTReferral.__table__, LBReferral.__table__,
        ])
        self.db = sessionmaker(bind=self.engine)()

        self.admin = User(
            id="admin", public_id="900001",
            _nickname="Admin", is_active=True,
        )
        self.bt = User(
            id="bt", public_id="900002",
            _nickname="BT", is_active=True,
        )
        self.lb = User(
            id="lb", public_id="900003",
            _nickname="LB", is_active=True,
        )
        self.other = User(
            id="other", public_id="900004",
            _nickname="Other", is_active=True,
        )
        self.db.add_all([
            self.admin, self.bt, self.lb, self.other,
        ])
        self.db.flush()
        self.db.add(AdminRole(user_id="admin", role="DA"))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def call(self, path, user, **kwargs):
        return self.routes["/v1/dealers" + path](
            db=self.db, user=user, **kwargs
        )

    def assign(self, person, kind):
        return self.call(
            "/admin/assign", self.admin,
            body=d.AssignBody(
                public_id=person.public_id, kind=kind
            ),
        )

    def code(self):
        return self.call("/reference/me", self.bt)["code"]

    def activate(self, user, code):
        return self.call(
            "/reference/activate", user,
            body=BTActivationBody(code=code),
        )

    def test_01_bt_code_is_16_digits_and_stable(self):
        self.assign(self.bt, "support")
        first = self.code()
        self.assertRegex(first, r"^[0-9]{16}$")
        self.assertEqual(first, self.code())
        self.assertTrue(
            self.call("/reference/me", self.bt)["active"]
        )

    def test_02_lb_activates_with_bt_code(self):
        self.assign(self.bt, "support")
        self.assign(self.lb, "dealer")
        self.assertFalse(
            self.call("/reference/me", self.lb)["active"]
        )
        result = self.activate(self.lb, self.code())
        self.assertTrue(result["active"])
        self.assertTrue(
            self.call("/reference/me", self.lb)["active"]
        )
        self.assertEqual(
            self.db.get(LBReferral, self.lb.id).bt_user_id,
            self.bt.id,
        )

    def test_03_lb_cannot_activate_twice(self):
        self.assign(self.bt, "support")
        self.assign(self.lb, "dealer")
        code = self.code()
        self.activate(self.lb, code)

        with self.assertRaises(HTTPException) as ctx:
            self.activate(self.lb, code)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_04_bt_cannot_enter_reference_code(self):
        self.assign(self.bt, "support")
        with self.assertRaises(HTTPException) as ctx:
            self.activate(self.bt, self.code())
        self.assertEqual(ctx.exception.status_code, 403)

    def test_05_bt_team_contains_linked_lb(self):
        self.assign(self.bt, "support")
        self.assign(self.lb, "dealer")
        self.activate(self.lb, self.code())

        result = self.call(
            "/reference/team", self.bt, limit=100
        )
        self.assertEqual(
            [x["public_id"] for x in result["items"]],
            [self.lb.public_id],
        )

    def test_06_unassigned_user_cannot_activate(self):
        self.assign(self.bt, "support")
        with self.assertRaises(HTTPException) as ctx:
            self.activate(self.other, self.code())
        self.assertEqual(ctx.exception.status_code, 403)

    def test_07_invalid_code_rejected(self):
        self.assign(self.lb, "dealer")
        with self.assertRaises(HTTPException) as ctx:
            self.activate(self.lb, "9999999999999999")
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
