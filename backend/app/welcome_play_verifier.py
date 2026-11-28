"""Welcome Play receipt verification. No money or balance writes."""
from datetime import datetime

from .play_billing import verify_payload, _account_hash
from .welcome_packages import PACKAGES, utc

PRODUCTS = {
    p["product_id"]: p for p in PACKAGES
}


def verify_welcome_receipt(
    data, intent, user_id, *, test_mode=False
):
    if intent.user_id != user_id:
        raise ValueError("Account mismatch")

    if intent.status not in ("prepared", "verified", "review", "credited"):
        raise ValueError("Invalid intent status")

    package = PRODUCTS.get(intent.product_id)

    if not package:
        raise ValueError("Unknown welcome product")

    if (
        intent.tier != package["id"]
        or intent.lidya != package["lidya"]
        or intent.price_kurus != package["price_kurus"]
        or intent.duration_days != package["duration_days"]
        or intent.gender not in ("male", "female")
    ):
        raise ValueError("Invalid package snapshot")

    verdict = verify_payload(
        data,
        intent.product_id,
        _account_hash(user_id),
    )

    if verdict["test_purchase"] != test_mode:
        raise ValueError("Payment mode mismatch")

    details = data["productLineItem"][0]["productOfferDetails"]

    if details.get("offerId") not in (None, ""):
        raise ValueError("Unexpected promotional offer")

    try:
        completed = datetime.fromisoformat(
            data["purchaseCompletionTime"].replace("Z", "+00:00")
        )

        if completed.tzinfo is None:
            raise ValueError("Missing timezone")

        completed = utc(completed)

    except (ValueError, TypeError, AttributeError):
        raise ValueError("Invalid completion time") from None

    created = utc(intent.created_at)
    expires = utc(intent.offer_expires_at)

    if created >= expires:
        raise ValueError("Invalid intent window")

    if completed < created:
        raise ValueError("Payment predates purchase intent")

    return {
        **verdict,
        "intent_id": intent.id,
        "user_id": user_id,
        "tier": intent.tier,
        "gender": intent.gender,
        "lidya": intent.lidya,
        "duration_days": intent.duration_days,
        "completion_time": completed.isoformat(),
        "requires_review": (
            completed >= expires
            or verdict["acknowledged"]
        ),
        "credited": False,
        "delivery_enabled": False,
    }
