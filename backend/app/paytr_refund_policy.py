"""Refund request preparation only; never automatically trigger real provider refunds.

PayTR API: https://dev.paytr.com/iade-api . A finance operator must reconcile
provider status, user wallet and dispute decision before any external refund.
"""
from .paytr_routes import refund_hash, refund_quote

REFUND_ENDPOINT = "https://www.paytr.com/odeme/iade"
REFUNDS_AUTOMATICALLY_ENABLED = False


def prepare_refund_request(merchant_id, merchant_key, merchant_salt, merchant_oid, amount_kurus):
    amount = refund_quote(amount_kurus)
    return {"merchant_id": merchant_id, "merchant_oid": merchant_oid,
            "return_amount": amount,
            "paytr_token": refund_hash(merchant_id, merchant_oid, amount, merchant_key, merchant_salt)}
