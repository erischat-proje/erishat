"""Isolated DB constraint tests; no production database or PSP calls."""
from pathlib import Path
import sys
import unittest
from uuid import uuid4
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'backend'))
from app.db import Base
from app.models import User
from app.woocommerce_order_v6 import WebOrderV6
from app.woocommerce_qnbpay_ledger_v16 import QnbpayTransactionReferenceV16, v16_readiness

class V16LedgerSchema(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite+pysqlite:///:memory:')
        Base.metadata.create_all(self.engine, tables=[User.__table__, WebOrderV6.__table__, QnbpayTransactionReferenceV16.__table__])
        self.db=Session(self.engine)
        # SQLite FK checking not enabled by default. Test unique/check constraints only.
    def tearDown(self):
        self.db.close();self.engine.dispose()
    def test_table_exists(self):
        self.assertIn('qnbpay_transaction_references_v16',inspect(self.engine).get_table_names())
    def test_transaction_unique_at_database_level(self):
        # Avoid test User inserts, since production User has many required fields.
        self.db.add(QnbpayTransactionReferenceV16(provider='QNBpay', transaction_id='TX-00000001', order_ref=str(uuid4()),woocommerce_order_id=901,package_id=1))
        self.db.commit()
        self.db.add(QnbpayTransactionReferenceV16(provider='QNBpay', transaction_id='TX-00000001', order_ref=str(uuid4()),woocommerce_order_id=902,package_id=1))
        with self.assertRaises(IntegrityError):self.db.commit()
        self.db.rollback()
    def test_order_unique_at_database_level(self):
        ref=str(uuid4())
        self.db.add(QnbpayTransactionReferenceV16(provider='QNBpay',transaction_id='TX-00000001',order_ref=ref,woocommerce_order_id=901,package_id=1));self.db.commit()
        self.db.add(QnbpayTransactionReferenceV16(provider='QNBpay',transaction_id='TX-00000002',order_ref=ref,woocommerce_order_id=902,package_id=1))
        with self.assertRaises(IntegrityError):self.db.commit()
    def test_wc_order_unique(self):
        self.db.add(QnbpayTransactionReferenceV16(provider='QNBpay',transaction_id='TX-00000001',order_ref=str(uuid4()),woocommerce_order_id=901,package_id=1));self.db.commit()
        self.db.add(QnbpayTransactionReferenceV16(provider='QNBpay',transaction_id='TX-00000002',order_ref=str(uuid4()),woocommerce_order_id=901,package_id=1))
        with self.assertRaises(IntegrityError):self.db.commit()
    def test_cannot_mark_verified(self):
        self.db.add(QnbpayTransactionReferenceV16(provider='QNBpay',transaction_id='TX-00000001',order_ref=str(uuid4()),woocommerce_order_id=901,package_id=1,state='verified'))
        with self.assertRaises(IntegrityError):self.db.commit()
    def test_reject_other_provider(self):
        self.db.add(QnbpayTransactionReferenceV16(provider='Other',transaction_id='TX-00000001',order_ref=str(uuid4()),woocommerce_order_id=901,package_id=1))
        with self.assertRaises(IntegrityError):self.db.commit()
    def test_reject_invalid_package(self):
        self.db.add(QnbpayTransactionReferenceV16(provider='QNBpay',transaction_id='TX-00000001',order_ref=str(uuid4()),woocommerce_order_id=901,package_id=17))
        with self.assertRaises(IntegrityError):self.db.commit()
    def test_flags_disabled(self):
        for key in ('provider_callback_enabled','psp_verification_enabled','payment_enabled','coin_delivery_enabled','wallet_ledger_integrated'):
            self.assertFalse(v16_readiness()[key])
    def test_main_import(self):
        src=(ROOT/'backend/app/main.py').read_text()
        self.assertIn('from . import woocommerce_qnbpay_ledger_v16',src)
    def test_no_public_write_route(self):
        src=(ROOT/'backend/app/woocommerce_qnbpay_ledger_v16.py').read_text()
        self.assertNotIn('APIRouter(',src)
        self.assertNotIn('requests.post',src)
        self.assertNotIn('db.commit(',src)
        self.assertNotIn('wallet',src.split('class QnbpayTransactionReferenceV16', 1)[1].split('def v16_readiness', 1)[0].lower())
    def test_v13_v12_remain_off(self):
        from app.woocommerce_qnbpay_gate_v13 import readiness
        self.assertFalse(readiness()['payment_enabled'])
        self.assertIn('actionButton.disabled=true',(ROOT/'frontend/payment-assistance.js').read_text())

if __name__=='__main__':unittest.main()
