"""Internal receipt recording. Caller must fetch fresh data from Google."""
import hashlib

from fastapi import HTTPException
from sqlalchemy import select

from .models import User
from .play_billing_models import PlayPurchaseRecord
from .welcome_purchase_models import (
    WelcomePurchase, WelcomePlayReceipt,
)
from .welcome_play_verifier import verify_welcome_receipt


def capture_verified_receipt(
    db, user_id, intent_id, purchase_token,
    google_data, *, test_mode=False,
):
    # Caller owns the transaction and must roll back on failure.
    # Never expose google_data as an HTTP request parameter.

    if not isinstance(purchase_token, str):
        raise HTTPException(422, "Invalid purchase token")

    if not 8 <= len(purchase_token) <= 4096:
        raise HTTPException(422, "Invalid purchase token")

    user = db.scalar(
        select(User)
        .where(User.id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if user is None or not user.is_active:
        raise HTTPException(403, "Invalid account")

    intent = db.scalar(
        select(WelcomePurchase)
        .where(
            WelcomePurchase.id == intent_id,
            WelcomePurchase.user_id == user_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if intent is None:
        raise HTTPException(404, "Intent not found")

    verdict = verify_welcome_receipt(
        google_data, intent, user_id,
        test_mode=test_mode,
    )

    fingerprint = hashlib.sha256(
        purchase_token.encode("utf-8")
    ).hexdigest()

    existing = db.scalar(
        select(PlayPurchaseRecord).where(
            PlayPurchaseRecord.token_sha256 == fingerprint
        )
    )

    if existing is not None:
        if (
            existing.user_id != user_id
            or existing.product_id != intent.product_id
            or existing.google_order_id != verdict["order_id"]
            or existing.test_purchase != verdict["test_purchase"]
        ):
            raise HTTPException(409, "Receipt conflict")

        link = db.get(
            WelcomePlayReceipt, existing.id
        )

        if link is None or link.intent_id != intent.id:
            raise HTTPException(409, "Receipt linkage conflict")

        return link

    same_order = db.scalar(
        select(PlayPurchaseRecord.id).where(
            PlayPurchaseRecord.google_order_id
            == verdict["order_id"]
        )
    )

    if same_order is not None:
        raise HTTPException(409, "Duplicate Google order")

    previous = db.scalar(
        select(WelcomePlayReceipt.receipt_id)
        .where(WelcomePlayReceipt.intent_id == intent.id)
        .limit(1)
    )

    if previous is None and intent.status != "prepared":
        raise HTTPException(409, "Invalid intent state")

    reason = ""

    if previous is not None:
        reason = "duplicate_paid_package"
    elif intent.gender != user.gender:
        reason = "collection_changed"
    elif verdict["requires_review"]:
        reason = "payment_requires_review"

    disposition = "review" if reason else "verified"

    receipt = PlayPurchaseRecord(
        token_sha256=fingerprint,
        user_id=user_id,
        product_id=intent.product_id,
        google_order_id=verdict["order_id"],
        test_purchase=verdict["test_purchase"],
        purchase_status="verified_no_credit",
    )

    db.add(receipt)
    db.flush()

    link = WelcomePlayReceipt(
        receipt_id=receipt.id,
        intent_id=intent.id,
        google_order_id=verdict["order_id"],
        disposition=disposition,
        review_reason=reason,
    )

    db.add(link)

    if previous is None:
        intent.status = disposition

    db.flush()

    return link
