"""Actual purchase engine: deadlines, downgrade, ledger replay and paid-credit boundaries."""

import os, sys, unittest
from pathlib import Path
from datetime import datetime, timedelta, timezone

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from sqlalchemy import create_engine, select, BigInteger
from sqlalchemy.ext.compiler import compiles


@compiles(BigInteger, "sqlite")
def sqlite_bigint(type_, compiler, **kw):
    return "INTEGER"


from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.main import app
from app.db import Base
from app.models import User
from app.platform_models import VipStatus
from app.vip_membership_models import VipMembership, VipPurchaseReceipt, VipCycleAudit
from app import vip_membership as v, vip_spending
from app.purchase_models import LidyaOrder


class Membership(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(
            bind=self.engine, expire_on_commit=False, autoflush=False
        )()
        self.at = datetime(2026, 10, 17, 11, tzinfo=timezone.utc)
        self.user = User(
            id="u",
            public_id="000000000001",
            nickname="Kaan",
            gender="male",
            lidya=50000,
        )
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def buy(self, amount, key="a", days=0):
        result = v.record_purchase(
            self.db, "u", amount, "assisted", key, self.at + timedelta(days=days)
        )
        self.db.commit()
        return result

    def status(self):
        return self.db.get(VipStatus, "u")

    def test_thresholds_all_tiers_and_exact_boundaries(self):
        self.assertEqual(len(v.THRESHOLDS), 12)
        self.assertEqual(v.THRESHOLDS[12], 10000000)
        for tier, amount in v.THRESHOLDS.items():
            self.assertEqual(v.level_for(amount), tier)
            self.assertEqual(v.level_for(amount - 1), tier - 1)
            self.assertEqual(v.TARGETS[tier], amount // 20)

    def test_spending_never_raises_vip(self):
        status = vip_spending.record_spend(self.db, "u", 20000000, "cosmetic", "item")
        self.db.commit()
        self.assertEqual(status.level, 0)
        self.assertEqual(status.total_spent, 20000000)

    def test_duplicate_paid_callback_does_not_double_count(self):
        a = self.buy(180000)
        deadline = v.utc(a.cycle_ends_at)
        self.buy(180000)
        self.assertEqual(a.total_purchased, 180000)
        self.assertEqual(self.status().level, 5)
        self.assertEqual(v.utc(a.cycle_ends_at), deadline)
        with self.assertRaises(ValueError):
            self.buy(180001)

    def test_non_purchase_source_is_rejected(self):
        for source in ["manual", "gift", "game", "cosmetic"]:
            with self.assertRaises(ValueError):
                v.record_purchase(self.db, "u", 5000, source, "x", self.at)

    def test_upgrade_resets_13_remaining_days_to_30(self):
        row = self.buy(180000)
        old_end = v.utc(row.cycle_ends_at)
        self.buy(170000, "b", 17)
        self.assertEqual(self.status().level, 6)
        self.assertEqual((old_end - (self.at + timedelta(days=17))).days, 13)
        self.assertEqual(v.utc(row.cycle_started_at), self.at + timedelta(days=17))
        self.assertEqual(v.utc(row.cycle_ends_at), self.at + timedelta(days=47))
        self.assertEqual(row.cycle_purchased, 170000)

    def test_same_level_topup_does_not_reset_deadline(self):
        row = self.buy(4000)
        deadline = v.utc(row.cycle_ends_at)
        self.buy(100, "b", 5)
        self.assertEqual(v.utc(row.cycle_ends_at), deadline)
        self.assertEqual(row.cycle_purchased, 4100)

    def test_exact_boundary_settles_old_period_before_credit(self):
        row = self.buy(180000)
        row.cycle_purchased = 0
        self.db.commit()
        self.buy(1, "b", 30)
        self.assertEqual(self.status().level, 4)
        self.assertEqual(row.cycle_purchased, 1)
        self.assertEqual(v.utc(row.cycle_ends_at), self.at + timedelta(days=60))

    def test_downgrade_one_tier_and_no_balance_fee(self):
        row = self.buy(180000)
        row.cycle_purchased = 0
        self.db.commit()
        v.sync(self.db, "u", self.at + timedelta(days=30))
        self.db.commit()
        self.assertEqual(self.status().level, 4)
        self.assertEqual(self.user.lidya, 50000)
        self.assertEqual(len(list(self.db.scalars(select(VipCycleAudit)))), 1)
        v.sync(self.db, "u", self.at + timedelta(days=30))
        self.db.commit()
        self.assertEqual(self.status().level, 4)

    def test_successful_period_rollover_does_not_add_early_days(self):
        row = self.buy(180000)
        v.sync(self.db, "u", self.at + timedelta(days=30))
        self.db.commit()
        self.assertEqual(self.status().level, 5)
        self.assertEqual(row.cycle_purchased, 0)
        self.assertEqual(v.utc(row.cycle_ends_at), self.at + timedelta(days=60))

    def test_offline_missed_periods_are_all_processed(self):
        row = self.buy(180000)
        v.sync(self.db, "u", self.at + timedelta(days=90))
        self.db.commit()
        self.assertEqual(self.status().level, 3)
        self.assertEqual(v.utc(row.cycle_ends_at), self.at + timedelta(days=120))

    def test_floor_is_zero_and_old_totals_do_not_auto_restore(self):
        row = self.buy(4000)
        row.cycle_purchased = 0
        self.db.commit()
        v.sync(self.db, "u", self.at + timedelta(days=30))
        self.db.commit()
        self.assertEqual(self.status().level, 0)
        self.assertIsNone(row.cycle_ends_at)
        v.sync(self.db, "u", self.at + timedelta(days=300))
        self.assertEqual(self.status().level, 0)
        self.buy(199, "b", 301)
        self.assertEqual(self.status().level, 0)
        self.buy(200, "c", 302)
        self.assertEqual(self.status().level, 1)

    def test_recovery_needs_new_topup_and_resets_timer(self):
        row = self.buy(180000)
        row.cycle_purchased = 0
        self.db.commit()
        v.sync(self.db, "u", self.at + timedelta(days=30))
        self.db.commit()
        self.buy(9000, "b", 31)
        self.assertEqual(self.status().level, 5)
        self.assertEqual(v.utc(row.cycle_ends_at), self.at + timedelta(days=61))

    def test_legacy_member_gets_grace_and_spending_is_not_imported_as_purchase(self):
        self.db.add(VipStatus(user_id="u", level=5, total_spent=99999999))
        self.db.commit()
        row = v.sync(self.db, "u", self.at)
        self.db.commit()
        self.assertEqual(self.status().level, 5)
        self.assertEqual(row.total_purchased, 0)
        self.assertEqual(v.utc(row.cycle_ends_at), self.at + timedelta(days=30))

    def test_historical_order_is_imported_once_and_current_order_not_twice(self):
        self.db.add(
            LidyaOrder(
                id="old",
                user_id="u",
                request_key="old",
                package_id=1,
                price_try=2,
                base=4000,
                bonus=0,
                total=4000,
                method="iban",
                reference="OLD",
                status="approved",
                transaction_reference="BANK-OLD",
                bank_json="{}",
                evidence="",
                decision_note="",
                created_at=self.at,
                decided_at=self.at,
            )
        )
        self.db.commit()
        row = v.sync(self.db, "u", self.at)
        self.db.commit()
        self.assertEqual(row.total_purchased, 4000)
        self.db.add(
            LidyaOrder(
                id="new",
                user_id="u",
                request_key="new",
                package_id=1,
                price_try=2,
                base=1000,
                bonus=0,
                total=1000,
                method="iban",
                reference="NEW",
                status="approved",
                transaction_reference="BANK-NEW",
                bank_json="{}",
                evidence="",
                decision_note="",
                created_at=self.at,
                decided_at=self.at,
            )
        )
        self.db.flush()
        v.record_purchase(self.db, "u", 1000, "order", "new", self.at)
        self.db.commit()
        self.assertEqual(row.total_purchased, 5000)

    def test_purchase_and_membership_roll_back_atomically(self):
        self.db.add(VipStatus(user_id="u", level=0, total_spent=0))
        self.db.commit()
        v.record_purchase(self.db, "u", 4000, "assisted", "rolled", self.at)
        self.db.rollback()
        self.assertIsNone(self.db.get(VipMembership, "u"))
        self.assertEqual(self.status().level, 0)
        self.assertIsNone(self.db.get(VipPurchaseReceipt, ("u", "assisted:rolled")))

    def test_downgrade_removes_high_vip_frame_but_preserves_shop_item(self):
        row = self.buy(180000)
        self.user.frame_asset = "vip-designs/avatar-frame-male-5.svg"
        row.cycle_purchased = 0
        self.db.commit()
        v.sync(self.db, "u", self.at + timedelta(days=30))
        self.db.commit()
        self.assertIsNone(self.user.frame_asset)

    def test_replay_of_credited_order_after_backfill_does_not_increment(self):
        self.db.add(
            LidyaOrder(
                id="old",
                user_id="u",
                request_key="old",
                package_id=1,
                price_try=2,
                base=4000,
                bonus=0,
                total=4000,
                method="iban",
                reference="OLD",
                status="approved",
                transaction_reference="BANK-OLD",
                bank_json="{}",
                evidence="",
                decision_note="",
                created_at=self.at,
                decided_at=self.at,
            )
        )
        self.db.commit()
        row = v.sync(self.db, "u", self.at)
        self.db.commit()
        v.record_purchase(
            self.db, "u", 4000, "order", "old", self.at + timedelta(days=1)
        )
        self.assertEqual(row.total_purchased, 4000)


if __name__ == "__main__":
    unittest.main()
