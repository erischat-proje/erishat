"""V8 read-only dealer audit regression tests; isolated SQLite."""
import unittest
from uuid import uuid4
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.db import Base
from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app import dealer_routes as dealers
from backend.app.dealer_audit_v8 import reconcile, review_signals

class DealerAuditV8Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        dealers.register_auth(lambda: None)
        cls.endpoint = {r.path:r.endpoint for r in dealers.router.routes}['/v1/dealers/admin/audit']

    def setUp(self):
        self.engine=create_engine('sqlite+pysqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
        Base.metadata.create_all(self.engine,tables=[User.__table__,AdminRole.__table__,
            dealers.DealerInventory.__table__,dealers.DealerTransfer.__table__, dealers.DealerStockGrant.__table__])
        self.db=sessionmaker(bind=self.engine,expire_on_commit=False)()
        self.da=User(id='admin',public_id='910003',_nickname='admin',is_active=True,lidya=0)
        self.dealer=User(id='dealer',public_id='910001',_nickname='dealer',is_active=True,lidya=0)
        self.other=User(id='other',public_id='910002',_nickname='other',is_active=True,lidya=0)
        self.db.add_all([self.da,self.dealer,self.other,AdminRole(user_id='admin',role='DA'),
                         dealers.DealerInventory(user_id='dealer',active=True,stock=70)])
        self.db.commit()

    def tearDown(self):
        self.db.rollback(); self.db.close();self.engine.dispose()

    def audit(self,actor=None):
        return type(self).endpoint(public_id=None,limit=50,db=self.db,user=actor or self.da)

    def record(self):
        self.db.add(dealers.DealerStockGrant(id=str(uuid4()),dealer_id='dealer',admin_id='admin',amount=100,request_key=str(uuid4())))
        self.db.add(dealers.DealerTransfer(id=str(uuid4()),dealer_id='dealer',recipient_id='other',amount=30,request_key=str(uuid4())))
        self.db.commit()

    def test_01_balanced_ledger(self):
        self.record()
        result=self.audit()['items'][0]
        self.assertEqual(result['difference'],0)
        self.assertEqual(result['status'],'OK')

    def test_02_unbalanced_ledger_flagged_not_changed(self):
        self.record()
        self.db.get(dealers.DealerInventory,'dealer').stock=71
        self.db.commit()
        result=self.audit()['items'][0]
        self.assertEqual(result['difference'],1)
        self.assertIn('STOCK_LEDGER_MISMATCH_REVIEW',result['review_flags'])
        self.db.expire_all()
        self.assertEqual(self.db.get(dealers.DealerInventory,'dealer').stock,71)

    def test_03_non_da_rejected(self):
        with self.assertRaises(HTTPException) as error:
            self.audit(actor=self.other)
        self.assertEqual(error.exception.status_code,403)

    def test_04_no_financial_writes(self):
        self.record()
        before=(self.db.query(dealers.DealerTransfer).count(),self.db.query(dealers.DealerStockGrant).count())
        self.audit();self.audit()
        self.assertEqual(before,(self.db.query(dealers.DealerTransfer).count(),self.db.query(dealers.DealerStockGrant).count()))

    def test_05_signal_thresholds_are_review_only(self):
        x=reconcile(100,20,80)
        self.assertEqual(review_signals(x,20,1000000),['HIGH_TRANSFER_FREQUENCY_REVIEW','HIGH_HOURLY_TRANSFER_VOLUME_REVIEW'])
