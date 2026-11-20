"""Isolated V2 account pairing tests. Never connect to production database."""
import sys
import types
import unittest
from datetime import timedelta
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import Boolean, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

# The service module is tested in isolation with an in-memory database. Imports
# from the real application are replaced for this test process only.
class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

fake_config = types.ModuleType('app.config')
fake_config.settings = types.SimpleNamespace(woocommerce_linking_enabled=True, woocommerce_service_secret='s' * 48)
fake_db = types.ModuleType('app.db')
fake_db.Base = Base
fake_db.get_db = lambda: None
fake_models = types.ModuleType('app.models')
fake_models.User = User

# Ensure app package exists without importing the project startup dependencies.
if 'app' not in sys.modules:
    package = types.ModuleType('app')
    from pathlib import Path
    package.__path__ = [str(Path(__file__).resolve().parents[1] / 'app')]
    sys.modules['app'] = package
for name, mod in [('app.config', fake_config), ('app.db', fake_db), ('app.models', fake_models)]:
    sys.modules[name] = mod

from app.woocommerce_account_link import (WooCommerceAccountLink, PairingRedeem, issue, redeem)


class PairingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite+pysqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.user = User(id='test-user-id', is_active=True)
        self.db.add(self.user)
        self.db.commit()
        self.secret = 's' * 48
        fake_config.settings.woocommerce_linking_enabled = True
        fake_config.settings.woocommerce_service_secret = self.secret

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_single_use(self):
        t = issue(self.db, self.user)['ticket']
        p = PairingRedeem(ticket=t, order_id=101)
        r = redeem(self.db, p, self.secret)
        self.assertEqual((r['user_id'], r['credited']), (self.user.id, False))
        with self.assertRaises(HTTPException): redeem(self.db, p, self.secret)

    def test_reject_wrong_secret(self):
        t = issue(self.db, self.user)['ticket']
        with self.assertRaises(HTTPException) as ctx:
            redeem(self.db, PairingRedeem(ticket=t, order_id=102), 'wrong')
        self.assertEqual(ctx.exception.status_code, 401)

    def test_reject_expired(self):
        t = issue(self.db, self.user)['ticket']
        from hashlib import sha256
        row = self.db.get(WooCommerceAccountLink, sha256(t.encode()).hexdigest())
        row.expires_at = row.expires_at - timedelta(minutes=10)
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            redeem(self.db, PairingRedeem(ticket=t, order_id=103), self.secret)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_same_user_fresh_ticket_retries_same_order(self):
        first = issue(self.db, self.user)['ticket']
        redeem(self.db, PairingRedeem(ticket=first, order_id=104), self.secret)
        fresh = issue(self.db, self.user)['ticket']
        result = redeem(self.db, PairingRedeem(ticket=fresh, order_id=104), self.secret)
        self.assertTrue(result['linked'])
        self.assertTrue(result['already_linked'])
        self.assertFalse(result['credited'])
        # Fresh ticket was consumed; must not work on any other order.
        with self.assertRaises(HTTPException):
            redeem(self.db, PairingRedeem(ticket=fresh, order_id=105), self.secret)

    def test_order_cannot_be_reassigned(self):
        first = issue(self.db, self.user)['ticket']
        redeem(self.db, PairingRedeem(ticket=first, order_id=106), self.secret)
        different_user = User(id='different-user', is_active=True)
        self.db.add(different_user)
        self.db.commit()
        other_ticket = issue(self.db, different_user)['ticket']
        with self.assertRaises(HTTPException) as ctx:
            redeem(self.db, PairingRedeem(ticket=other_ticket, order_id=106), self.secret)
        self.assertEqual(ctx.exception.status_code, 409)
        # A rejected ticket must not silently change the order's owner.
        row = self.db.query(WooCommerceAccountLink).filter_by(order_id=106).one()
        self.assertEqual(row.user_id, self.user.id)

    def test_disabled_by_default(self):
        fake_config.settings.woocommerce_linking_enabled = False
        with self.assertRaises(HTTPException) as ctx: issue(self.db, self.user)
        self.assertEqual(ctx.exception.status_code, 503)

    def test_bad_token(self):
        with self.assertRaises(HTTPException):
            redeem(self.db, PairingRedeem(ticket='A'*40, order_id=123), self.secret)

    def test_inactive_user(self):
        self.user.is_active = False
        self.db.commit()
        with self.assertRaises(HTTPException): issue(self.db, self.user)


if __name__ == '__main__':
    unittest.main()
