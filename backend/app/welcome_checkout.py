"""Welcome Premium V10.5 - gated purchase preparation."""

import os
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, SecretStr, Field
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
    from .welcome_purchase_models import (
        WelcomePurchase, WelcomeLaunchPermit,
    )

    now = utc(now or datetime.now(timezone.utc))

    result = {
        "preparation_enabled": False,
        "launch_allowed": False,
        "available_tiers": [],
        "launch_tiers": [],
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

    reserved = set()

    if rows:
        reserved = set(db.scalars(
            select(WelcomeLaunchPermit.intent_id).where(
                WelcomeLaunchPermit.intent_id.in_(
                    [row.id for row in rows]
                )
            )
        ).all())

    for tier in ("bronze", "silver", "gold"):
        row = previous.get(tier)

        if row is None or (
            row.status == "prepared"
            and row.id not in reserved
            and row.gender == user.gender
        ):
            result["available_tiers"].append(tier)

    result["preparation_enabled"] = bool(
        result["available_tiers"]
    )


    if launch_enabled(user):
        result["launch_tiers"] = list(
            result["available_tiers"]
        )

    result["launch_allowed"] = bool(
        result["launch_tiers"]
    )

    return result



def launch_enabled(user):
    pilots = {
        value.strip()
        for value in os.getenv(
            "LIDYACHAT_WELCOME_LAUNCH_PILOT_IDS", ""
        ).split(",")
        if value.strip()
    }

    return (
        preparation_enabled()
        and flag("LIDYACHAT_WELCOME_LAUNCH_ENABLED")
        and str(user.public_id) in pilots
    )


def reserve_launch(
    db, user_id, tier, request_id, now=None
):
    import re
    from .welcome_purchase_models import WelcomeLaunchPermit

    if not isinstance(request_id, str) or not re.fullmatch(
        r"[a-f0-9]{32}", request_id
    ):
        raise HTTPException(422, "Gecersiz istek")

    if not preparation_enabled() or not flag(
        "LIDYACHAT_WELCOME_LAUNCH_ENABLED"
    ):
        raise HTTPException(503, "Odeme baslatma kapali")

    now = utc(now or datetime.now(timezone.utc))

    try:
        user = require_customer(db, user_id)

        if not launch_enabled(user):
            raise HTTPException(403, "Odeme izni bulunmuyor")

        intent = prepare_intent(
            db, user.id, tier, now
        )

        previous = db.get(
            WelcomeLaunchPermit,
            intent.id,
            populate_existing=True,
        )

        if previous is not None:
            raise HTTPException(
                409,
                "Onceki odeme oturumu kontrol edilmeli",
            )

        expiry = min(
            now + timedelta(seconds=90),
            utc(intent.offer_expires_at),
        )

        if expiry <= now:
            raise HTTPException(403, "Kampanya sona erdi")

        permit = WelcomeLaunchPermit(
            intent_id=intent.id,
            permit_id=str(uuid4()),
            request_id=request_id,
            created_at=now,
            expires_at=expiry,
        )

        db.add(permit)
        db.flush()

        result = {
            "permit_id": permit.permit_id,
            "intent_id": intent.id,
            "request_id": request_id,
            "product_id": intent.product_id,
            "account_hash": _account_hash(user.id),
            "tier": intent.tier,
            "currency": "TRY",
            "catalog_price_kurus": intent.price_kurus,
            "price_micros": intent.price_kurus * 10000,
            "expires_at": expiry.isoformat(),
            "launch_allowed": True,
            "credited": False,
        }

        db.commit()

        return result

    except Exception:
        db.rollback()
        raise


class LaunchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tier: Literal["bronze", "silver", "gold"]

    request_id: str = Field(
        pattern=r"^[a-f0-9]{32}$",
        min_length=32,
        max_length=32,
    )


class PreparePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tier: Literal["bronze", "silver", "gold"]



class CompletePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: Literal[
        "welcome_bronze_v1",
        "welcome_silver_v1",
        "welcome_gold_v1",
    ]

    purchase_token: SecretStr


def recover_purchase(db, user_id, product_id, token):
    from .welcome_recovery import recover

    return recover(
        db, user_id, product_id, token
    )


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



    @router.post("/launch-authorize")
    def authorize_launch(
        payload: LaunchPayload,
        response: Response,
        user=Depends(current_user),
        db=Depends(get_db),
    ):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Vary"] = "Authorization"

        return reserve_launch(
            db,
            user.id,
            payload.tier,
            payload.request_id,
        )


    @router.post("/checkout-complete")
    def complete(
        payload: CompletePayload,
        response: Response,
        user=Depends(current_user),
        db=Depends(get_db),
    ):
        headers = {
            "Cache-Control": "private, no-store",
            "Vary": "Authorization",
        }

        response.headers.update(headers)

        token = payload.purchase_token.get_secret_value()

        if not 8 <= len(token) <= 4096:
            raise HTTPException(
                422,
                "Gecersiz odeme makbuzu",
                headers=headers,
            )

        try:
            return recover_purchase(
                db,
                user.id,
                payload.product_id,
                token,
            )

        except HTTPException as error:
            db.rollback()

            raise HTTPException(
                error.status_code,
                "Odeme dogrulamasi tamamlanamadi",
                headers=headers,
            ) from None

        except Exception:
            db.rollback()

            raise HTTPException(
                503,
                "Odeme teslimati gecici olarak bekliyor",
                headers=headers,
            ) from None

    return router
