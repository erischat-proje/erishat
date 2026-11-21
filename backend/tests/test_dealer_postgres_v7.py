"""V7 isolated PostgreSQL dealer concurrency tests.

Run only with V7_TEST_DATABASE_URL pointing to a local, disposable PostgreSQL
DATABASE whose name contains lidya_v7_test. Never connects to Railway or live DB.
Creates and removes an isolated PostgreSQL schema per test run.
"""
import os
import sys
import uuid
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

from sqlalchemy import create_engine, event, text, select, func
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def isolated_database_url():
    raw = os.environ.get('V7_TEST_DATABASE_URL', '')
    if not raw:
        raise unittest.SkipTest('V7_TEST_DATABASE_URL tanımlı değil; PostgreSQL V7 testleri çalıştırılmadı')
    url = make_url(raw)
    if not url.drivername.startswith('postgresql'):
        raise RuntimeError('V7 sadece PostgreSQL üzerinde çalışır')
    if url.host not in ('localhost', '127.0.0.1', '::1'):
        raise RuntimeError('GÜVENLİK: V7 yalnızca yerel PostgreSQL sunucusuna bağlanır')
    if not url.database or 'lidya_v7_test' not in url.database.lower():
        raise RuntimeError('GÜVENLİK: veritabanı adında lidya_v7_test geçmelidir')
    if os.environ.get('V7_ISOLATED_CONFIRM') != 'YES':
        raise RuntimeError('GÜVENLİK: V7_ISOLATED_CONFIRM=YES gerekli')
    return raw


class DealerPostgresV7(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        raw = isolated_database_url()
        # Set BEFORE importing backend.app.db: the app db module reads config at import time.
        os.environ['DATABASE_URL'] = raw
        from backend.app.db import Base
        from backend.app.models import User
        from backend.app.admin_models import AdminRole
        from backend.app.dealer_routes import (
            DealerInventory, DealerDesignation, DealerTransfer, DealerStockGrant,
            TransferBody, StockBody, register_auth,
        )
        cls.User, cls.AdminRole = User, AdminRole
        cls.DealerInventory, cls.DealerTransfer, cls.DealerStockGrant = DealerInventory, DealerTransfer, DealerStockGrant
        cls.TransferBody, cls.StockBody = TransferBody, StockBody
        cls.schema = 'v7_' + uuid.uuid4().hex[:16]
        cls.admin_engine = create_engine(raw, pool_pre_ping=True)
        with cls.admin_engine.begin() as conn:
            conn.execute(text('CREATE SCHEMA ' + cls.schema))
        cls.engine = create_engine(raw, pool_size=8, max_overflow=8, pool_pre_ping=True)
        @event.listens_for(cls.engine, 'connect')
        def set_schema(dbapi_connection, connection_record):
            with dbapi_connection.cursor() as cursor:
                cursor.execute('SET search_path TO ' + cls.schema + ', public')
            dbapi_connection.commit()
        cls.Session = sessionmaker(cls.engine, autoflush=False, expire_on_commit=False)
        tables = [User.__table__, AdminRole.__table__, DealerInventory.__table__, DealerDesignation.__table__, DealerTransfer.__table__, DealerStockGrant.__table__]
        try:
            Base.metadata.create_all(cls.engine, tables=tables)
            router = register_auth(lambda: None)
            cls.endpoints = {r.path: r.endpoint for r in router.routes}
        except Exception:
            cls.tearDownClass()
            raise

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, 'engine'):
            cls.engine.dispose()
        if hasattr(cls, 'admin_engine'):
            if hasattr(cls, 'schema'):
                with cls.admin_engine.begin() as conn:
                    conn.execute(text('DROP SCHEMA IF EXISTS ' + cls.schema + ' CASCADE'))
            cls.admin_engine.dispose()

    def setUp(self):
        self.dealer_id = 'dealer-' + uuid.uuid4().hex[:16]
        self.recipient_id = 'receiver-' + uuid.uuid4().hex[:16]
        self.admin_id = 'admin-' + uuid.uuid4().hex[:16]
        self.dealer_public = uuid.uuid4().hex[:12]
        self.recipient_public = uuid.uuid4().hex[:12]
        self.admin_public = uuid.uuid4().hex[:12]
        with self.Session.begin() as db:
            db.add_all([
                self.User(id=self.dealer_id, public_id=self.dealer_public, _nickname='Bayi V7', _avatar='🦊', lidya=0),
                self.User(id=self.recipient_id, public_id=self.recipient_public, _nickname='Alıcı V7', _avatar='🦊', lidya=0),
                self.User(id=self.admin_id, public_id=self.admin_public, _nickname='Yönetici V7', _avatar='🦊', lidya=0),
            ])
            db.flush()
            db.add(self.DealerInventory(user_id=self.dealer_id, active=True, stock=100))
            db.add(self.AdminRole(user_id=self.admin_id, role='DA'))

    def snapshot(self):
        with self.Session() as db:
            stock = db.get(self.DealerInventory, self.dealer_id).stock
            lidya = db.get(self.User, self.recipient_id).lidya
            transfers = db.scalar(select(func.count()).select_from(self.DealerTransfer).where(self.DealerTransfer.dealer_id == self.dealer_id))
            grants = db.scalar(select(func.count()).select_from(self.DealerStockGrant).where(self.DealerStockGrant.dealer_id == self.dealer_id))
            return stock, lidya, transfers, grants

    def invoke(self, path, body, user_id):
        with self.Session() as db:
            user = db.get(self.User, user_id)
            try:
                return self.endpoints[path](body=body, db=db, user=user)
            except HTTPException as exc:
                db.rollback()
                return {'error': exc.status_code, 'detail': str(exc.detail)}

    def parallel(self, requests):
        barrier = Barrier(len(requests))
        def one(req):
            barrier.wait(timeout=10)
            return self.invoke(*req)
        with ThreadPoolExecutor(max_workers=len(requests)) as pool:
            return list(pool.map(one, requests))

    def transfer(self, amount, key):
        return ('/v1/dealers/transfer', self.TransferBody(recipient_public_id=self.recipient_public, amount=amount, request_key=key), self.dealer_id)

    def grant(self, amount, key):
        return ('/v1/dealers/admin/stock', self.StockBody(public_id=self.dealer_public, amount=amount, request_key=key), self.admin_id)

    def test_01_parallel_distinct_transfers_never_overspend(self):
        result = self.parallel([self.transfer(70, uuid.uuid4().hex), self.transfer(70, uuid.uuid4().hex)])
        self.assertEqual(sum('transfer_id' in x for x in result), 1, result)
        self.assertEqual(sum(x.get('error') == 409 for x in result), 1, result)
        self.assertEqual(self.snapshot(), (30, 70, 1, 0))

    def test_02_parallel_same_transfer_key_one_credit(self):
        key = uuid.uuid4().hex
        result = self.parallel([self.transfer(60, key), self.transfer(60, key)])
        self.assertEqual(sum('transfer_id' in x for x in result), 2, result)
        self.assertEqual(sum(x.get('replayed') is True for x in result), 1, result)
        self.assertEqual(self.snapshot(), (40, 60, 1, 0))

    def test_03_parallel_grants_same_key_one_grant(self):
        key = uuid.uuid4().hex
        result = self.parallel([self.grant(40, key), self.grant(40, key)])
        self.assertEqual(sum(x.get('ok') is True for x in result), 2, result)
        self.assertEqual(sum(x.get('replayed') is True for x in result), 1, result)
        self.assertEqual(self.snapshot(), (140, 0, 0, 1))

    def test_04_parallel_grant_and_transfer_conserve_balance(self):
        result = self.parallel([self.grant(90, uuid.uuid4().hex), self.transfer(150, uuid.uuid4().hex)])
        stock, lidya, transfers, grants = self.snapshot()
        self.assertEqual(grants, 1, result)
        self.assertEqual(stock + lidya, 190, result)
        self.assertIn((stock, lidya, transfers), [(190, 0, 0), (40, 150, 1)], result)

    def test_05_failed_wallet_credit_rolls_back_stock(self):
        with self.Session.begin() as db:
            db.get(self.User, self.recipient_id).lidya = 9_223_372_036_854_775_800
        result = self.invoke(*self.transfer(20, uuid.uuid4().hex))
        self.assertEqual(result.get('error'), 409, result)
        stock, lidya, transfers, grants = self.snapshot()
        self.assertEqual((stock, lidya, transfers, grants), (100, 9_223_372_036_854_775_800, 0, 0))


if __name__ == '__main__':
    unittest.main()
