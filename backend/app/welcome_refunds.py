"""Revoke welcome cosmetics after a verified Google Play refund."""
from sqlalchemy import select

from .models import User
from .platform_models import VipStatus
from .play_refund_models import PlayRefundCase
from .welcome_purchase_models import (
    WelcomePurchase, WelcomePlayReceipt,
)
from .welcome_cosmetics import rewards_for
from .welcome_play_verifier import PRODUCTS


def revoke_refunded_appearance(db, receipt):
    """Caller holds receipt/user locks and owns transaction."""

    if receipt.product_id not in PRODUCTS:
        return 0

    case = db.scalar(
        select(PlayRefundCase).where(
            PlayRefundCase.receipt_id == receipt.id
        )
    )

    if (
        case is None
        or case.user_id != receipt.user_id
        or case.product_id != receipt.product_id
    ):
        raise RuntimeError("Invalid refund identity")

    link = db.get(
        WelcomePlayReceipt, receipt.id
    )

    if link is None:
        raise RuntimeError("Missing welcome receipt linkage")

    intent = db.get(
        WelcomePurchase, link.intent_id
    )

    if (
        intent is None
        or intent.user_id != receipt.user_id
        or intent.product_id != receipt.product_id
        or link.google_order_id != receipt.google_order_id
    ):
        raise RuntimeError("Refund package mismatch")

    # Refunding a duplicate payment must not remove
    # the original successfully purchased package.
    if (
        link.disposition != "verified"
        or receipt.purchase_status != "credited"
        or receipt.test_purchase
    ):
        return 0

    if intent.status != "credited":
        raise RuntimeError("Invalid credited intent")

    user = db.scalar(
        select(User)
        .where(User.id == receipt.user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if user is None:
        raise RuntimeError("Refund account missing")

    removed = 0

    for item in rewards_for(intent.gender, intent.tier):
        kind = item["type"]
        key = item["asset_key"]

        if kind == "entrance":
            status = db.get(VipStatus, user.id)

            if status and status.entry_effect == key:
                status.entry_effect = None
                removed += 1

            continue

        # Clear only the refunded underlying frame.
        # The effective management frame stays unchanged.
        column = (
            "_frame_asset"
            if kind == "frame"
            else kind + "_asset"
        )

        if getattr(user, column, None) == key:
            setattr(user, column, None)
            removed += 1

    # Keep original receipt and lease rows for audit.
    # The refund case invalidates ownership immediately.
    db.flush()

    return removed
