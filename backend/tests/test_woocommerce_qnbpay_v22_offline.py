"""V22 disposable-only tests. These do NOT exercise PostgreSQL production."""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from sqlalchemy import insert, select, func, text
from sqlalchemy.exc import IntegrityError
from app.woocommerce_qnbpay_event_journal_v21 import QnbpayEventJournalV21
from scripts.qnbpay_v22_offline_journal import (
    make_disposable_db,event,duplicate_event_concurrency,ORDER_A,ORDER_B,
)

class V22DisposableJournal(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(prefix="lidyachat-v22-test-")
        self.engine,self.parent,self.journal=make_disposable_db(Path(self.temp.name)/"isolated.db")
        with self.engine.begin() as con:
            con.execute(insert(self.parent),[{"id":ORDER_A},{"id":ORDER_B}])

    def tearDown(self):
        self.engine.dispose()
        self.temp.cleanup()

    def put(self, **kw):
        with self.engine.begin() as con:
            con.execute(text("PRAGMA foreign_keys=ON"))
            con.execute(insert(self.journal).values(**event(**kw)))

    def count(self):
        with self.engine.connect() as con:
            return con.scalar(select(func.count()).select_from(self.journal))

    def rejects(self, **kw):
        with self.assertRaises(IntegrityError):
            self.put(**kw)

    def test_first_event_insert(self):
        self.put()
        self.assertEqual(self.count(),1)
    def test_duplicate_provider_event_rejected(self):
        self.put()
        self.rejects()
        self.assertEqual(self.count(),1)
    def test_duplicate_event_other_transaction_rejected(self):
        self.put()
        self.rejects(transaction_id="TRANSACTION0002")
    def test_duplicate_event_other_order_rejected(self):
        self.put()
        self.rejects(order_ref=ORDER_B)
    def test_distinct_event_same_tx_allowed_but_not_payment_proof(self):
        self.put()
        self.put(event_id="EVENT0002")
        self.assertEqual(self.count(),2)
    def test_distinct_event_another_order_allowed(self):
        self.put()
        self.put(event_id="EVENT0002",transaction_id="TRANSACTION0002",order_ref=ORDER_B)
        self.assertEqual(self.count(),2)
    def test_other_provider_rejected(self):
        self.rejects(provider="fake")
    def test_paid_state_rejected(self):
        self.rejects(state="paid")
    def test_verified_state_rejected(self):
        self.rejects(state="verified")
    def test_negative_order_rejected(self):
        self.rejects(woocommerce_order_id=-10)
    def test_zero_order_rejected(self):
        self.rejects(woocommerce_order_id=0)
    def test_package_zero_rejected(self):
        self.rejects(package_id=0)
    def test_package_seventeen_rejected(self):
        self.rejects(package_id=17)
    def test_missing_parent_fk_rejected(self):
        self.rejects(order_ref="11111111-1111-4111-8111-111111111111")
    def test_rollback_preserves_existing_records(self):
        self.put()
        self.rejects(event_id="EVENT0001",state="paid")
        self.assertEqual(self.count(),1)
    def test_concurrent_same_id_single_record(self):
        self.assertEqual(duplicate_event_concurrency(),(1,1,1))
    def test_actual_v21_unique_constraint_declared(self):
        self.assertIn("uq_qnb_v21_provider_event",
          {c.name for c in QnbpayEventJournalV21.__table__.constraints})
    def test_actual_v21_state_check_declared(self):
        self.assertIn("ck_qnb_v21_unverified_only",
          {c.name for c in QnbpayEventJournalV21.__table__.constraints})
    def test_actual_v21_no_money_methods(self):
        self.assertFalse(any(hasattr(QnbpayEventJournalV21,attr) for attr in
                             ("credit_wallet","capture_payment","process_refund")))
