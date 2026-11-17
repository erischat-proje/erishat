"""LidyaChat Bayi V6: isolated SQLite transaction regression tests.

Run from repository root: python -m unittest discover -s backend/tests -p 'test_dealer_security_v6.py' -v
No network calls; no production database sessions; no real balances modified.
SQLite does NOT exercise PostgreSQL row-locking semantics.
"""
import unittest
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db import Base
from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app import dealer_routes as dealers


def unique_key():
    return str(uuid4())


class DealerSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Register routes in this isolated Python process; no API server starts.
        dealers.register_auth(lambda: None)
        cls.routes = {route.path: route.endpoint for route in dealers.router.routes}

    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[User.__table__, AdminRole.__table__, dealers.DealerInventory.__table__,
                    dealers.DealerTransfer.__table__, dealers.DealerStockGrant.__table__],
        )
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.Session()
        self.dealer = self.user("dealer", "900001")
        self.recipient = self.user("recipient", "900002")
        self.da = self.user("da", "900003")
        self.stranger = self.user("stranger", "900004")
        self.db.add_all([
            dealers.DealerInventory(user_id=self.dealer.id, stock=0, active=True),
            AdminRole(user_id=self.da.id, role="DA"),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        self.db.close()
        self.engine.dispose()

    def user(self, user_id, public_id, lidya=0):
        user = User(id=user_id, public_id=public_id, _nickname=user_id,
                    is_active=True, lidya=lidya)
        self.db.add(user)
        self.db.flush()
        return user

    def stock(self):
        self.db.expire_all()
        return self.db.get(dealers.DealerInventory, self.dealer.id).stock

    def wallet(self):
        self.db.expire_all()
        return self.db.get(User, self.recipient.id).lidya

    def invoke(self, path, body, actor):
        try:
            return self.routes[path](body=body, db=self.db, user=actor)
        except Exception:
            self.db.rollback()
            raise

    def transfer(self, amount, key=None, to=None, actor=None):
        return self.invoke("/v1/dealers/transfer", dealers.TransferBody(
            recipient_public_id=to or self.recipient.public_id,
            amount=amount, request_key=key or unique_key()), actor or self.dealer)

    def grant(self, amount, key=None, actor=None):
        return self.invoke("/v1/dealers/admin/stock", dealers.StockBody(
            public_id=self.dealer.public_id, amount=amount,
            request_key=key or unique_key()), actor or self.da)

    def assert_http(self, status, fn):
        with self.assertRaises(HTTPException) as caught:
            fn()
        self.assertEqual(caught.exception.status_code, status)

    def test_01_zero_stock_cannot_send(self):
        self.assert_http(409, lambda: self.transfer(100_000))
        self.assertEqual(self.stock(), 0)
        self.assertEqual(self.wallet(), 0)
        self.assertEqual(self.db.query(dealers.DealerTransfer).count(), 0)

    def test_02_insufficient_stock_cannot_send(self):
        self.grant(10)
        self.assert_http(409, lambda: self.transfer(11))
        self.assertEqual(self.stock(), 10)
        self.assertEqual(self.wallet(), 0)

    def test_03_negative_and_zero_amount_rejected(self):
        for amount in (0, -1):
            with self.assertRaises(ValidationError):
                dealers.TransferBody(recipient_public_id=self.recipient.public_id,
                                     amount=amount, request_key=unique_key())
        self.assertEqual(self.wallet(), 0)

    def test_04_success_debits_stock_and_credits_wallet(self):
        self.grant(500)
        response = self.transfer(230)
        self.assertFalse(response["replayed"])
        self.assertEqual(self.stock(), 270)
        self.assertEqual(self.wallet(), 230)
        self.assertEqual(self.db.query(dealers.DealerTransfer).count(), 1)

    def test_05_transfer_replay_does_not_double_credit(self):
        self.grant(500)
        key = unique_key()
        first = self.transfer(200, key)
        second = self.transfer(200, key)
        self.assertTrue(second["replayed"])
        self.assertEqual(first["transfer_id"], second["transfer_id"])
        self.assertEqual(self.wallet(), 200)
        self.assertEqual(self.stock(), 300)
        self.assertEqual(self.db.query(dealers.DealerTransfer).count(), 1)

    def test_06_reused_key_with_changed_amount_rejected(self):
        self.grant(500)
        key = unique_key()
        self.transfer(200, key)
        self.assert_http(409, lambda: self.transfer(201, key))
        self.assertEqual(self.wallet(), 200)
        self.assertEqual(self.stock(), 300)

    def test_07_self_transfer_rejected(self):
        self.grant(500)
        self.assert_http(400, lambda: self.transfer(100, to=self.dealer.public_id))
        self.assertEqual(self.stock(), 500)

    def test_08_non_dealer_cannot_transfer(self):
        self.assert_http(403, lambda: self.transfer(100, actor=self.stranger))
        self.assertEqual(self.wallet(), 0)

    def test_09_non_da_cannot_grant_stock(self):
        self.assert_http(403, lambda: self.grant(10_000, actor=self.stranger))
        self.assertEqual(self.stock(), 0)

    def test_10_stock_grant_replay_does_not_double_grant(self):
        key = unique_key()
        first = self.grant(100, key)
        second = self.grant(100, key)
        self.assertFalse(first["replayed"])
        self.assertTrue(second["replayed"])
        self.assertEqual(self.stock(), 100)
        self.assertEqual(self.db.query(dealers.DealerStockGrant).count(), 1)

    def test_11_grant_replay_changed_amount_rejected(self):
        key = unique_key()
        self.grant(100, key)
        self.assert_http(409, lambda: self.grant(200, key))
        self.assertEqual(self.stock(), 100)

    def test_12_wallet_overflow_rolls_back_stock(self):
        self.recipient.lidya = 9_223_372_036_854_775_807
        self.db.commit()
        self.grant(100)
        self.assert_http(409, lambda: self.transfer(1))
        self.assertEqual(self.stock(), 100)
        self.assertEqual(self.wallet(), 9_223_372_036_854_775_807)
        self.assertEqual(self.db.query(dealers.DealerTransfer).count(), 0)

    def test_13_deactivated_dealer_cannot_transfer(self):
        self.grant(100)
        inv = self.db.get(dealers.DealerInventory, self.dealer.id)
        inv.active = False
        self.db.commit()
        self.assert_http(403, lambda: self.transfer(20))
        self.assertEqual(self.wallet(), 0)

    def test_14_grant_stock_limit_rejected(self):
        self.grant(dealers.MAX_STOCK)
        self.assert_http(409, lambda: self.grant(1))
        self.assertEqual(self.stock(), dealers.MAX_STOCK)

    def test_15_reuse_transfer_key_for_other_recipient_rejected(self):
        other = self.user("recipient2", "900005")
        self.db.commit()
        self.grant(100)
        key = unique_key()
        self.transfer(20, key)
        self.assert_http(409, lambda: self.transfer(20, key, to=other.public_id))
        self.assertEqual(self.stock(), 80)
        self.assertEqual(self.wallet(), 20)
        self.db.expire_all()
        self.assertEqual(self.db.get(User, other.id).lidya, 0)


if __name__ == "__main__":
    unittest.main()
