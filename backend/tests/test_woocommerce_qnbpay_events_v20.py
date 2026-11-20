import pathlib
import unittest
from uuid import uuid4

from app.woocommerce_qnbpay_events_v20 import (
    EventClaim, compare_trusted_event_claim, event_safety_plan,
)

ORDER_A = "dd0959e6-b0fc-4c03-b03f-15e0b7c44c01"
ORDER_B = "dd0959e6-b0fc-4c03-b03f-15e0b7c44c02"
EXISTING = (EventClaim("EVENT0001", "TRANSACTION0001", ORDER_A, 12),)

class V20EventSafety(unittest.TestCase):
    def plan(self, **kw):
        opts = dict(order_ref=ORDER_A,package_id=1,local_state="created",woocommerce_order_id=12)
        opts.update(kw)
        return event_safety_plan(**opts)

    def compare(self, **kw):
        opts = dict(event_id="EVENT0002", transaction_id="TRANSACTION0002",
                    order_ref=ORDER_B, wc_order_id=13, existing=EXISTING)
        opts.update(kw)
        return compare_trusted_event_claim(**opts)

    def test_created(self):
        self.assertEqual(self.plan()["review_state"], "AWAITING_AUTHENTICATED_PROVIDER_EVENT")
    def test_disabled(self):
        self.assertEqual(self.plan(local_state="disabled")["review_state"], "ORDER_DISABLED_NO_EVENTS")
    def test_uncertain(self):
        self.assertEqual(self.plan(local_state="uncertain")["review_state"], "ORDER_UNCERTAIN_MANUAL_REVIEW")
    def test_reserved(self):
        self.assertEqual(self.plan(local_state="reserved")["review_state"], "RESERVATION_NOT_PROVIDER_EVIDENCE")
    def test_unlinked(self):
        self.assertEqual(self.plan(woocommerce_order_id=None)["review_state"], "REMOTE_ORDER_LINK_MISSING")
    def test_all_money_flags_off(self):
        p=self.plan()
        for key in ("provider_event_authenticated", "provider_capture_verified", "payment_enabled",
                    "event_ingestion_enabled", "coin_delivery_authorized", "coin_delivered",
                    "wallet_debit_authorized"):
            self.assertIs(p[key],False)
    def test_invalid_package(self):
        for i in (0,17,True,"1",None):
            with self.subTest(i=i),self.assertRaises(ValueError):
                self.plan(package_id=i)
    def test_invalid_order_ref(self):
        for value in ("x", ORDER_A.upper(),None, str(uuid4()).replace("-",""), 1):
            with self.subTest(value=value),self.assertRaises(ValueError):
                self.plan(order_ref=value)
    def test_invalid_state(self):
        for v in ("paid", "refunded", None, True):
            with self.subTest(v=v),self.assertRaises(ValueError):
                self.plan(local_state=v)
    def test_invalid_wc_id(self):
        for v in (0,-1,False,"1"):
            with self.subTest(v=v),self.assertRaises(ValueError):
                self.plan(woocommerce_order_id=v)
    def test_event_replay(self):
        self.assertEqual(self.compare(event_id="EVENT0001",transaction_id="TRANSACTION0001",
                    order_ref=ORDER_A,wc_order_id=12),"REPLAY_SAME_EVENT_NO_DELIVERY")
    def test_event_id_reused(self):
        self.assertEqual(self.compare(event_id="EVENT0001"),"CONFLICT_EVENT_ID_REUSED")
    def test_duplicate_persisted_event(self):
        self.assertEqual(self.compare(existing=EXISTING+EXISTING,event_id="EVENT0001"),
            "CONFLICT_DUPLICATE_PERSISTED_EVENT")
    def test_transaction_reused_other_order(self):
        self.assertEqual(self.compare(transaction_id="TRANSACTION0001"),
            "CONFLICT_TRANSACTION_LINKED_TO_OTHER_ORDER")
    def test_order_reused_other_transaction(self):
        self.assertEqual(self.compare(order_ref=ORDER_A,wc_order_id=12),
            "CONFLICT_ORDER_LINKED_TO_OTHER_TRANSACTION")
    def test_wc_order_reused(self):
        self.assertEqual(self.compare(wc_order_id=12),
            "CONFLICT_ORDER_LINKED_TO_OTHER_TRANSACTION")
    def test_same_transaction_new_event(self):
        self.assertEqual(self.compare(transaction_id="TRANSACTION0001",
            order_ref=ORDER_A,wc_order_id=12),
            "DISTINCT_EVENT_SAME_TRANSACTION_REQUIRES_PROVIDER_VERIFICATION")
    def test_unseen(self):
        self.assertEqual(self.compare(),"UNSEEN_EVENT_REQUIRES_PROVIDER_VERIFICATION")
    def test_bad_event_ids(self):
        for v in ("", "a", "😆", True, None, "a"*129):
            with self.subTest(v=v), self.assertRaises(ValueError):
                self.compare(event_id=v)
    def test_invalid_inventory(self):
        for v in ([], "hello", (object(),)):
            with self.subTest(v=v), self.assertRaises(ValueError):
                self.compare(existing=v)
    def test_route_account_scope(self):
        p = pathlib.Path(__file__).resolve().parents[1]/"app"/"woocommerce_qnbpay_routes_v20.py"
        src=p.read_text()
        self.assertIn("row.user_id != user.id",src)
        self.assertIn("@router.get",src)
        self.assertNotIn("@router.post",src)
    def test_main_registered(self):
        p=pathlib.Path(__file__).resolve().parents[1]/"app"/"main.py"
        src=p.read_text()
        self.assertIn("woocommerce_qnbpay_routes_v20.register_auth(current_user)",src)
    def test_no_money_writes(self):
        p=pathlib.Path(__file__).resolve().parents[1]/"app"/"woocommerce_qnbpay_routes_v20.py"
        src=p.read_text()
        for s in ("db.commit(", "requests.post(", "wallet.balance", "credit_coins(", "refund("):
            self.assertNotIn(s,src)
    def test_v16_unverified_only(self):
        src=(pathlib.Path(__file__).resolve().parents[1]/"app"/"woocommerce_qnbpay_ledger_v16.py").read_text()
        self.assertIn("state = 'unverified'",src)
