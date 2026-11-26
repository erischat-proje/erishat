"""Isolated WooCommerce V6 order security regression tests."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, select, update, delete, func
from sqlalchemy.orm import Session

from backend.app import woocommerce_order_v6 as wc
from backend.app.models import User
from backend.app.admin_models import AdminRole


class WooOrderLockSecurity(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if os.getenv("LIDYA_WC_LOCK_POSTGRES") == "1":
            assert os.getenv("GITHUB_ACTIONS") == "true"
            url = (
                "postgresql+psycopg://"
                "security_test:isolated_test_only"
                "@127.0.0.1:5432/lidya_wc_lock_test"
            )
        else:
            tmp = tempfile.TemporaryDirectory()
            cls.addClassCleanup(tmp.cleanup)
            url = "sqlite:///" + str(
                Path(tmp.name) / "isolated.sqlite3"
            )

        cls.engine = create_engine(url)
        cls.addClassCleanup(cls.engine.dispose)

        User.__table__.create(cls.engine)
        AdminRole.__table__.create(cls.engine)
        wc.WebOrderV6.__table__.create(cls.engine)

    def setUp(self):
        with self.engine.begin() as conn:
            conn.execute(delete(wc.WebOrderV6))
            conn.execute(delete(AdminRole))
            conn.execute(delete(User))
            conn.execute(
                User.__table__.insert().values(
                    id="wc-lock-test-user",
                    public_id="9900000001",
                    nickname="TestUser",
                    is_active=True,
                    lidya=0,
                    lidya_gem=0,
                )
            )

        flag = patch.object(
            wc, "configured", return_value=True
        )
        self.addCleanup(flag.stop)
        flag.start()

        remote = patch.object(
            wc, "create_remote_pending_order",
            return_value=12345
        )
        self.addCleanup(remote.stop)
        self.remote = remote.start()

    def session(self):
        return Session(
            self.engine,
            expire_on_commit=False,
            autoflush=False
        )

    def request(self, key="security-test-key-001", package=2):
        return wc.OrderRequest(
            package_id=package,
            request_key=key
        )

    def count_orders(self, db):
        return db.scalar(
            select(func.count()).select_from(wc.WebOrderV6)
        )

    def test_active_account(self):
        with self.session() as db:
            user = db.get(User, "wc-lock-test-user")
            result = wc.create(db, user, self.request())

            self.assertEqual(result["status"], "created")
            self.assertFalse(result["credited"])
            self.assertEqual(self.count_orders(db), 1)
            self.remote.assert_called_once()

    def test_stale_active_account_rejected(self):
        with self.session() as db:
            user = db.get(User, "wc-lock-test-user")
            db.commit()

            self.assertTrue(user.is_active)

            with self.engine.begin() as other:
                other.execute(
                    update(User)
                    .where(User.id == user.id)
                    .values(is_active=False)
                )

            # ORM still holds the previous account state.
            self.assertTrue(user.is_active)

            with self.assertRaises(HTTPException) as error:
                wc.create(db, user, self.request())

            self.assertEqual(error.exception.status_code, 403)
            self.assertFalse(user.is_active)
            self.assertEqual(self.count_orders(db), 0)
            self.remote.assert_not_called()

    def test_inactive_account_rejected(self):
        with self.engine.begin() as conn:
            conn.execute(
                update(User).values(is_active=False)
            )

        with self.session() as db:
            user = db.get(User, "wc-lock-test-user")

            with self.assertRaises(HTTPException) as error:
                wc.create(db, user, self.request())

            self.assertEqual(error.exception.status_code, 403)
            self.assertEqual(self.count_orders(db), 0)
            self.remote.assert_not_called()

    def test_duplicate_request(self):
        with self.session() as db:
            user = db.get(User, "wc-lock-test-user")

            first = wc.create(db, user, self.request())
            second = wc.create(db, user, self.request())

            self.assertEqual(first["id"], second["id"])
            self.assertEqual(self.count_orders(db), 1)
            self.remote.assert_called_once()

    def test_duplicate_key_different_package(self):
        with self.session() as db:
            user = db.get(User, "wc-lock-test-user")
            wc.create(db, user, self.request())

            with self.assertRaises(HTTPException) as error:
                wc.create(db, user, self.request(package=3))

            self.assertEqual(error.exception.status_code, 409)
            self.assertEqual(self.count_orders(db), 1)
            self.remote.assert_called_once()

    def test_second_open_order_rejected(self):
        with self.session() as db:
            user = db.get(User, "wc-lock-test-user")
            wc.create(db, user, self.request())

            with self.assertRaises(HTTPException) as error:
                wc.create(
                    db, user,
                    self.request("security-test-key-002")
                )

            self.assertEqual(error.exception.status_code, 409)
            self.assertEqual(self.count_orders(db), 1)
            self.remote.assert_called_once()


if __name__ == "__main__":
    unittest.main()
