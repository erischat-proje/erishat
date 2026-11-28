"""Internal purchase preparation only; no payment or credit."""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from .models import User
from .welcome_packages import offer_status
from .welcome_purchase_models import WelcomePurchase


def prepare_intent(db, user_id, tier, now=None):
    """Caller owns transaction. Not exposed as an HTTP route."""
    if tier not in ("bronze", "silver", "gold"):
        raise HTTPException(422, "Gecersiz paket.")

    now = now or datetime.now(timezone.utc)

    user = db.scalar(
        select(User)
        .where(User.id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if user is None or not user.is_active:
        raise HTTPException(403, "Hesap uygun degil.")

    offer = offer_status(user, now)

    if not offer["eligible_for_offer"]:
        raise HTTPException(403, "Kampanya hakki bulunmuyor.")

    previous = db.scalar(
        select(WelcomePurchase).where(
            WelcomePurchase.user_id == user.id,
            WelcomePurchase.tier == tier,
        )
    )

    if previous is not None:
        if previous.gender != user.gender:
            raise HTTPException(409, "Koleksiyon eslesmiyor.")

        if previous.status != "prepared":
            raise HTTPException(409, "Paket daha once isleme alindi.")

        return previous

    package = next(
        p for p in offer["packages"] if p["id"] == tier
    )

    row = WelcomePurchase(
        id=str(uuid4()),
        user_id=user.id,
        tier=tier,
        gender=user.gender,
        product_id=package["product_id"],
        price_kurus=package["price_kurus"],
        lidya=package["lidya"],
        duration_days=package["duration_days"],
        status="prepared",
        offer_expires_at=datetime.fromisoformat(
            offer["expires_at"]
        ),
    )

    db.add(row)
    db.flush()

    return row
