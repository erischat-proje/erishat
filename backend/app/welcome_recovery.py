"""Recover verified welcome purchases without duplicate delivery."""
import hashlib
import os

from fastapi import HTTPException
from sqlalchemy import select

from . import welcome_fulfillment as fulfillment
from .play_billing import _consume_google
from .play_billing_models import PlayPurchaseRecord
from .play_refund_models import PlayRefundCase
from .welcome_purchase_models import (
    WelcomePurchase, WelcomePlayReceipt,
)
from .welcome_play_verifier import PRODUCTS
from .welcome_receipt_service import capture_verified_receipt


def recover(db, user_id, product_id, purchase_token, now=None):
    """Internal service; never accept Google response from a client."""

    if (
        os.getenv(
            "LIDYACHAT_WELCOME_RECOVERY_ENABLED",
            "false",
        ).strip().lower() != "true"
        or os.getenv(
            "LIDYACHAT_WELCOME_DELIVERY_ENABLED",
            "false",
        ).strip().lower() != "true"
        or not fulfillment._checkout_ready()
        or fulfillment.settings.google_play_test_mode
    ):
        raise HTTPException(503, "Welcome recovery disabled")

    if product_id not in PRODUCTS:
        raise HTTPException(422, "Invalid welcome product")

    if (
        not isinstance(purchase_token, str)
        or not 8 <= len(purchase_token) <= 4096
    ):
        raise HTTPException(422, "Invalid purchase token")

    fingerprint = hashlib.sha256(
        purchase_token.encode("utf-8")
    ).hexdigest()

    try:
        record = db.scalar(
            select(PlayPurchaseRecord).where(
                PlayPurchaseRecord.token_sha256 == fingerprint
            )
        )

        if record is not None:
            if (
                record.user_id != user_id
                or record.product_id != product_id
                or record.test_purchase
            ):
                raise HTTPException(409, "Receipt conflict")

            link = db.get(
                WelcomePlayReceipt, record.id
            )

            if link is None:
                raise HTTPException(409, "Missing receipt linkage")

            intent = db.get(
                WelcomePurchase, link.intent_id
            )

            if (
                intent is None
                or intent.user_id != user_id
                or intent.product_id != product_id
            ):
                raise HTTPException(409, "Intent conflict")

            refund = db.scalar(
                select(PlayRefundCase.id).where(
                    PlayRefundCase.receipt_id == record.id
                )
            )

            if refund is not None:
                raise HTTPException(409, "Refund recorded")

            if record.purchase_status == "credited":
                rid = record.id
                db.rollback()

            else:
                rid = None
                intent_id = intent.id

        else:
            rid = None

            intent = db.scalar(
                select(WelcomePurchase).where(
                    WelcomePurchase.user_id == user_id,
                    WelcomePurchase.product_id == product_id,
                )
            )

            if intent is None:
                raise HTTPException(404, "Purchase intent missing")

            intent_id = intent.id

        if rid is None:
            # Do not keep an open database transaction during
            # the external Google request.
            db.rollback()

            try:
                data = fulfillment.fetch_from_google(
                    purchase_token
                )
            except Exception:
                raise HTTPException(
                    503, "Google verification unavailable"
                ) from None

            link = capture_verified_receipt(
                db, user_id, intent_id,
                purchase_token, data,
                test_mode=False,
            )

            rid = link.receipt_id
            disposition = link.disposition

            # Receipt must survive an interrupted delivery.
            db.commit()

            if disposition == "review":
                return {
                    "status": "review_required",
                    "receipt_id": rid,
                    "credited": False,
                    "consumption": "not_attempted",
                }

        result = fulfillment.deliver(
            db, rid, user_id, purchase_token, now
        )

        if not (
            result["credited"]
            or result["already_credited"]
        ):
            raise RuntimeError("Delivery not confirmed")

        consumption = "completed"

        if not result.get("google_consumed"):
            try:
                _consume_google(
                    product_id, purchase_token
                )
            except Exception:
                consumption = "retry_required"

        return {
            "status": "delivered",
            "receipt_id": rid,
            "credited": result["credited"],
            "already_credited": result["already_credited"],
            "consumption": consumption,
        }

    except (ValueError, TypeError, AttributeError):
        db.rollback()
        raise HTTPException(
            422, "Invalid Google receipt"
        ) from None

    except Exception:
        db.rollback()
        raise
