"""Exclusive welcome inventory. Read-only projection."""
from datetime import datetime, timezone
from sqlalchemy import select

from .cosmetic_leases import CosmeticLease
from .welcome_cosmetics import (
    entitlement_valid, find_reward,
)
from .welcome_purchase_models import (
    WelcomePurchase, WelcomePlayReceipt,
)
from .play_billing_models import PlayPurchaseRecord
from .play_refund_models import PlayRefundCase


def is_welcome_key(key):
    return isinstance(key, str) and key.startswith("welcome_")


def inventory(db, user, now=None):
    now = now or datetime.now(timezone.utc)

    if not user.is_active:
        return []

    leases = db.scalars(
        select(CosmeticLease).where(
            CosmeticLease.user_id == user.id
        )
    ).all()

    leases = [
        lease for lease in leases
        if is_welcome_key(lease.asset_key)
        and entitlement_valid(user, lease, now)
    ]

    if not leases:
        return []

    purchases = db.execute(
        select(WelcomePurchase, PlayPurchaseRecord)
        .join(
            WelcomePlayReceipt,
            WelcomePlayReceipt.intent_id == WelcomePurchase.id,
        )
        .join(
            PlayPurchaseRecord,
            PlayPurchaseRecord.id == WelcomePlayReceipt.receipt_id,
        )
        .where(
            WelcomePurchase.user_id == user.id,
            WelcomePurchase.gender == user.gender,
            WelcomePurchase.status == "credited",
            WelcomePlayReceipt.disposition == "verified",
            PlayPurchaseRecord.user_id == user.id,
            PlayPurchaseRecord.product_id == WelcomePurchase.product_id,
            PlayPurchaseRecord.purchase_status == "credited",
            PlayPurchaseRecord.test_purchase.is_(False),
            PlayPurchaseRecord.google_order_id == WelcomePlayReceipt.google_order_id,
            ~select(PlayRefundCase.id).where(
                PlayRefundCase.receipt_id == PlayPurchaseRecord.id
            ).exists(),
        )
    ).all()

    paid_tiers = {purchase.tier for purchase, _ in purchases}

    result = []

    for lease in leases:
        item = find_reward(
            lease.asset_key, lease.cosmetic_type
        )

        if not item or item["tier"] not in paid_tiers:
            continue

        if not entitlement_valid(user, lease, now):
            continue

        expires = lease.expires_at

        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)

        result.append({
            "type": item["type"],
            "asset_key": item["asset_key"],
            "asset": item["preview_asset"],
            "equip_key": item["asset_key"],
            "name": item["name"],
            "source": "welcome_package",
            "tier": item["tier"],
            "level": 0,
            "expires_at": expires.isoformat(),
            "expired": False,
            "equipped": False,
            "locked": True,
            "compatible": True,
            "activation_enabled": False,
        })

    return result
