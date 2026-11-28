"""Welcome Premium V10.5 - gated purchase preparation."""

import os
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from .db import get_db
from .models import User
from .admin_models import AdminRole
from .dealer_routes import DealerInventory
from .welcome_purchase_service import prepare_intent
from .welcome_cosmetics import utc
from .play_billing import _account_hash
from .play_billing import _checkout_ready, settings


def flag(name):
    return os.getenv(name, "false").strip().lower() == "true"


def preparation_enabled():
    return (
        flag("LIDYACHAT_WELCOME_PREPARE_ENABLED")
        and flag("LIDYACHAT_WELCOME_DELIVERY_ENABLED")
        and flag("LIDYACHAT_WELCOME_RECOVERY_ENABLED")
        and _checkout_ready()
        and not settings.google_play_test_mode
    )


def require_customer(db, user_id):
    user = db.scalar(
        select(User)
        .where(User.id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if user is None or not user.is_active:
        raise HTTPException(403, "Hesap uygun degil")

    role = db.get(
        AdminRole, user_id,
        populate_existing=True,
    )

    if role is not None:
        raise HTTPException(403, "Yetkili hesap uygun degil")

    dealer = db.get(
        DealerInventory, user_id,
        populate_existing=True,
    )

    if dealer is not None and dealer.active:
        raise HTTPException(403, "Bayi hesabi uygun degil")

    return user


def prepare_checkout(db, user_id, tier, now=None):
    if not preparation_enabled():
        raise HTTPException(503, "Paket satisi kapali")

    now = utc(now or datetime.now(timezone.utc))

    try:
        user = require_customer(db, user_id)

        intent = prepare_intent(
            db, user.id, tier, now
        )

        result = {
            "intent_id": intent.id,
            "product_id": intent.product_id,
            "tier": intent.tier,
            "collection": intent.gender,
            "account_hash": _account_hash(user.id),
            "catalog_price_kurus": intent.price_kurus,
            "lidya": intent.lidya,
            "duration_days": intent.duration_days,
            "offer_expires_at": utc(
                intent.offer_expires_at
            ).isoformat(),
            "status": "prepared",
            "launch_allowed": False,
            "credited": False,
        }

        db.commit()
        return result

    except Exception:
        db.rollback()
        raise



def checkout_status(db, user, now=None):
    from .welcome_packages import offer_status
    from .welcome_purchase_models import WelcomePurchase

    now = utc(now or datetime.now(timezone.utc))

    result = {
        "preparation_enabled": False,
        "launch_allowed": False,
        "available_tiers": [],
        "read_only": True,
    }

    if not preparation_enabled():
        return result

    if not offer_status(user, now)["eligible_for_offer"]:
        return result

    if db.get(AdminRole, user.id, populate_existing=True):
        return result

    dealer = db.get(
        DealerInventory, user.id,
        populate_existing=True,
    )

    if dealer and dealer.active:
        return result

    rows = db.scalars(
        select(WelcomePurchase).where(
            WelcomePurchase.user_id == user.id
        )
    ).all()

    previous = {row.tier: row for row in rows}

    for tier in ("bronze", "silver", "gold"):
        row = previous.get(tier)

        if row is None or (
            row.status == "prepared"
            and row.gender == user.gender
        ):
            result["available_tiers"].append(tier)

    result["preparation_enabled"] = bool(
        result["available_tiers"]
    )

    return result


class PreparePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tier: Literal["bronze", "silver", "gold"]


def register_auth(current_user):
    router = APIRouter(
        prefix="/v1/welcome-packages",
        tags=["welcome-checkout"],
    )


    @router.get("/checkout-status")
    def status(
        response: Response,
        user=Depends(current_user),
        db=Depends(get_db),
    ):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Vary"] = "Authorization"

        return checkout_status(db, user)

    @router.post("/prepare")
    def prepare(
        payload: PreparePayload,
        response: Response,
        user=Depends(current_user),
        db=Depends(get_db),
    ):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Vary"] = "Authorization"

        return prepare_checkout(
            db, user.id, payload.tier
        )

    return router
