import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db import Base
from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app import dealer_routes as d
from backend.app.dealer_referrals import BTReferral


class BTReferralV1Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        d.register_auth(lambda: None)
        cls.routes = {
            route.path: route.endpoint
            for route in d.router.routes
        }

    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[
                User.__table__,
                AdminRole.__table__,
                d.DealerInventory.__table__,
                d.DealerDesignation.__table__,
                d.DealerTransfer.__table__,
                d.DealerStockGrant.__table__,
                BTReferral.__table__,
            ],
        )
        self.db = sessionmaker(bind=self.engine)()

        self.admin = User(
            id="admin", public_id="900001",
            _nickname="Admin", is_active=True,
        )
        self.root = User(
            id="root", public_id="900002",
            _nickname="Root", is_active=True,
        )
        self.child = User(
            id="child", public_id="900003",
            _nickname="Child", is_active=True,
        )
        self.db.add_all([
            self.admin, self.root, self.child,
        ])
        self.db.flush()
        self.db.add(AdminRole(
            user_id="admin", role="DA",
        ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def call(self, path, user, **kwargs):
        return self.routes[
            "/v1/dealers" + path
        ](db=self.db, user=user, **kwargs)

    def assign(self, person):
        return self.call(
            "/admin/assign",
            self.admin,
            body=d.AssignBody(
                public_id=person.public_id,
                kind="support",
            ),
        )

    def activate_root(self):
        from backend.app.dealer_referrals import (
            BTBootstrapBody,
        )
        self.assign(self.root)
        return self.call(
            "/admin/reference/bootstrap",
            self.admin,
            body=BTBootstrapBody(
                public_id=self.root.public_id,
            ),
        )

    def test_01_unique_16_digit_codes(self):
        self.assign(self.root)
        self.assign(self.child)
        a = self.call("/reference/me", self.root)
        b = self.call("/reference/me", self.child)

        self.assertRegex(a["code"], r"^[0-9]{16}$")
        self.assertRegex(b["code"], r"^[0-9]{16}$")
        self.assertNotEqual(a["code"], b["code"])
        self.assertFalse(a["active"])
        self.assertFalse(b["active"])

    def test_02_bootstrap_and_activation(self):
        from backend.app.dealer_referrals import (
            BTActivationBody,
        )
        self.activate_root()
        self.assign(self.child)

        parent = self.call(
            "/reference/me", self.root,
        )
        self.assertTrue(parent["active"])

        result = self.call(
            "/reference/activate",
            self.child,
            body=BTActivationBody(
                code=parent["code"],
            ),
        )
        self.assertTrue(result["active"])
        self.assertTrue(result["locked"])

        child = self.call(
            "/reference/me", self.child,
        )
        self.assertTrue(child["parent_locked"])

        team = self.call(
            "/reference/team", self.root,
            limit=100,
        )
        self.assertEqual(
            [x["public_id"] for x in team["items"]],
            [self.child.public_id],
        )

    def test_03_code_cannot_change(self):
        from backend.app.dealer_referrals import (
            BTActivationBody,
        )
        self.activate_root()
        self.assign(self.child)

        code = self.call(
            "/reference/me", self.root,
        )["code"]

        self.call(
            "/reference/activate",
            self.child,
            body=BTActivationBody(code=code),
        )

        with self.assertRaises(HTTPException) as ctx:
            self.call(
                "/reference/activate",
                self.child,
                body=BTActivationBody(code=code),
            )

        self.assertEqual(
            ctx.exception.status_code, 409,
        )

    def test_04_self_code_rejected(self):
        from backend.app.dealer_referrals import (
            BTActivationBody,
        )
        self.assign(self.child)
        code = self.call(
            "/reference/me", self.child,
        )["code"]

        with self.assertRaises(HTTPException) as ctx:
            self.call(
                "/reference/activate",
                self.child,
                body=BTActivationBody(code=code),
            )

        self.assertEqual(
            ctx.exception.status_code, 400,
        )

    def test_05_second_bootstrap_rejected(self):
        from backend.app.dealer_referrals import (
            BTBootstrapBody,
        )
        self.activate_root()
        self.assign(self.child)

        with self.assertRaises(HTTPException) as ctx:
            self.call(
                "/admin/reference/bootstrap",
                self.admin,
                body=BTBootstrapBody(
                    public_id=self.child.public_id,
                ),
            )

        self.assertEqual(
            ctx.exception.status_code, 409,
        )


if __name__ == "__main__":
    unittest.main()
