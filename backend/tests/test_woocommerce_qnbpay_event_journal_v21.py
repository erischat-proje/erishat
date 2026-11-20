"""V21 schema tests; never require a running provider or live PostgreSQL."""
import pathlib
import unittest
from sqlalchemy import CheckConstraint, Index, UniqueConstraint
from app.woocommerce_qnbpay_event_journal_v21 import QnbpayEventJournalV21, v21_schema_readiness
from app.woocommerce_order_v6 import WebOrderV6  # registers referenced local order table


class V21EventJournalSchema(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.table = QnbpayEventJournalV21.__table__
        cls.file = pathlib.Path(__file__).resolve().parents[1] / 'app' / 'woocommerce_qnbpay_event_journal_v21.py'

    def test_table_name(self):
        self.assertEqual(self.table.name, 'qnbpay_event_journal_v21')

    def test_provider_event_unique(self):
        self.assertTrue(any(isinstance(c, UniqueConstraint) and c.name == 'uq_qnb_v21_provider_event' and
                            [x.name for x in c.columns] == ['provider','event_id'] for c in self.table.constraints))

    def test_multiple_events_per_transaction_supported(self):
        self.assertFalse(any(isinstance(c, UniqueConstraint) and
                            [x.name for x in c.columns] == ['provider','transaction_id'] for c in self.table.constraints))

    def test_transaction_index(self):
        self.assertTrue(any(isinstance(i,Index) and i.name == 'ix_qnb_v21_provider_transaction' and
                            [x.name for x in i.columns] == ['provider','transaction_id'] for i in self.table.indexes))

    def test_order_index(self):
        self.assertTrue(any(isinstance(i,Index) and i.name == 'ix_qnb_v21_order_ref' for i in self.table.indexes))

    def test_order_fk(self):
        self.assertEqual(str(next(iter(self.table.c.order_ref.foreign_keys)).target_fullname),
                         'woocommerce_web_orders_v6.id')

    def test_fk_restrict(self):
        self.assertEqual(next(iter(self.table.c.order_ref.foreign_keys)).ondelete, 'RESTRICT')

    def test_unverified_only_check(self):
        self.assertTrue(any(isinstance(c,CheckConstraint) and c.name == 'ck_qnb_v21_unverified_only' and
                            "state = 'unverified'" in str(c.sqltext) for c in self.table.constraints))

    def test_provider_check(self):
        self.assertTrue(any(isinstance(c,CheckConstraint) and c.name == 'ck_qnb_v21_provider'
                            for c in self.table.constraints))

    def test_positive_order_id(self):
        self.assertTrue(any(isinstance(c,CheckConstraint) and c.name == 'ck_qnb_v21_wc_positive'
                            for c in self.table.constraints))

    def test_package_bounds(self):
        self.assertTrue(any(isinstance(c,CheckConstraint) and c.name == 'ck_qnb_v21_package'
                            for c in self.table.constraints))

    def test_required_columns_nonnullable(self):
        for name in ('provider','event_id','transaction_id','order_ref','woocommerce_order_id','package_id','state','created_at'):
            with self.subTest(column=name):
                self.assertFalse(self.table.c[name].nullable)

    def test_state_default(self):
        self.assertEqual(self.table.c.state.server_default.arg, 'unverified')

    def test_status_fail_closed(self):
        result=v21_schema_readiness()
        self.assertEqual(result['provider'], 'QNBpay')
        for name in ('event_journal_migration_verified','provider_callback_enabled',
                     'provider_authentication_enabled','provider_capture_verified',
                     'payment_enabled','coin_delivery_enabled','wallet_ledger_integrated',
                     'refund_processing_enabled'):
            with self.subTest(flag=name):
                self.assertIs(result[name],False)

    def test_main_import_registration(self):
        main=(self.file.parent/'main.py').read_text(encoding='utf-8')
        self.assertIn('from . import woocommerce_qnbpay_event_journal_v21',main)

    def test_model_never_writes_money(self):
        src=self.file.read_text(encoding='utf-8')
        for marker in ('db.commit(', 'requests.post(', 'credit_coins(', 'wallet.balance', '@router.post'):
            with self.subTest(marker=marker):
                self.assertNotIn(marker,src)

    def test_v16_schema_still_unverified(self):
        src=(self.file.parent/'woocommerce_qnbpay_ledger_v16.py').read_text(encoding='utf-8')
        self.assertIn("state = 'unverified'",src)

    def test_older_event_plan_still_read_only(self):
        src=(self.file.parent/'woocommerce_qnbpay_routes_v20.py').read_text(encoding='utf-8')
        self.assertIn('@router.get',src)
        self.assertNotIn('@router.post',src)


if __name__=='__main__':
    unittest.main()
