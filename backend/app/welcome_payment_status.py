"""Read-only welcome payment reconciliation status."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select

from .welcome_cosmetics import utc
from .welcome_purchase_models import (
    WelcomePurchase,
    WelcomeLaunchPermit,
    WelcomePlayReceipt,
)
from .play_billing_models import PlayPurchaseRecord
from .play_refund_models import PlayRefundCase


TIERS = ("bronze", "silver", "gold")


def payment_status(db, user, now=None):

    if not user.is_active:
        raise HTTPException(403, "Hesap uygun degil")

    now = utc(now or datetime.now(timezone.utc))

    rows = db.execute(
        select(
            WelcomePurchase,
            WelcomeLaunchPermit,
            WelcomePlayReceipt,
            PlayPurchaseRecord,
            PlayRefundCase,
        )
        .outerjoin(
            WelcomeLaunchPermit,
            WelcomeLaunchPermit.intent_id ==
            WelcomePurchase.id,
        )
        .outerjoin(
            WelcomePlayReceipt,
            WelcomePlayReceipt.intent_id ==
            WelcomePurchase.id,
        )
        .outerjoin(
            PlayPurchaseRecord,
            PlayPurchaseRecord.id ==
            WelcomePlayReceipt.receipt_id,
        )
        .outerjoin(
            PlayRefundCase,
            PlayRefundCase.receipt_id ==
            PlayPurchaseRecord.id,
        )
        .where(
            WelcomePurchase.user_id == user.id
        )
    ).all()

    grouped = {tier: [] for tier in TIERS}

    for row in rows:
        grouped[row[0].tier].append(row)

    items = []

    for tier in TIERS:

        entries = grouped[tier]

        state = "not_started"
        expires = None
        blocked = False

        if entries:

            intent, permit, _, _, _ = entries[0]

            blocked = True

            if permit is not None:
                expires = utc(permit.expires_at)

            states = set()

            for _, _, link, receipt, refund in entries:

                if link is None:
                    continue

                if (
                    receipt is None
                    or receipt.test_purchase
                    or receipt.user_id != user.id
                    or receipt.product_id != intent.product_id
                    or receipt.google_order_id != link.google_order_id
                ):
                    states.add("review_required")
                    continue

                if refund is not None:

                    if (
                        refund.user_id != user.id
                        or refund.product_id != intent.product_id
                    ):
                        states.add("review_required")
                    else:
                        states.add("refund_recorded")

                elif link.disposition == "review":
                    states.add("review_required")

                elif (
                    receipt.purchase_status == "credited"
                    and intent.status == "credited"
                    and link.disposition == "verified"
                ):
                    states.add("delivered")

                elif (
                    receipt.purchase_status == "verified_no_credit"
                    and link.disposition == "verified"
                ):
                    states.add("delivery_pending")

                else:
                    states.add("review_required")

            if states:

                for candidate in (
                    "review_required",
                    "delivery_pending",
                    "delivered",
                    "refund_recorded",
                ):
                    if candidate in states:
                        state = candidate
                        break

            elif intent.status != "prepared":
                state = "review_required"

            elif permit is None:
                state = "prepared"
                blocked = False

            elif expires > now:
                state = "authorization_reserved"

            else:
                state = "payment_unknown"

        items.append({
            "tier": tier,
            "product_id": f"welcome_{tier}_v1",
            "status": state,
            "repurchase_blocked": blocked,
            "authorization_expires_at": (
                expires.isoformat()
                if expires else None
            ),
        })

    return {
        "items": items,
        "read_only": True,
        "google_live_verified": False,
        "wallet_changed": False,
        "automatic_reissue": False,
    }
