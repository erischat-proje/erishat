"""Internal welcome fulfillment. Never expose directly to clients."""
import os
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select

from .config import settings
from .models import User
from .purchase_routes import LIMIT
from .play_billing_models import PlayPurchaseRecord
from .play_refund_models import PlayRefundCase
from .play_billing import (
    _checkout_ready,
    _account_hash,
    fetch_from_google,
    verify_credited_payload,
)
from .welcome_purchase_models import (
    WelcomePurchase,
    WelcomePlayReceipt,
)
from .welcome_play_verifier import verify_welcome_receipt
from .welcome_cosmetics import rewards_for
from .cosmetic_leases import (
    CosmeticLease,
    get as get_lease,
    permanent,
)


def deliver(db, receipt_id, user_id, purchase_token, now=None):
    if (
        os.getenv(
            "LIDYACHAT_WELCOME_DELIVERY_ENABLED",
            "false",
        ).strip().lower() != "true"
        or not _checkout_ready()
        or settings.google_play_test_mode
    ):
        raise HTTPException(503, "Welcome delivery disabled")

    if (
        not isinstance(purchase_token, str)
        or not 8 <= len(purchase_token) <= 4096
    ):
        raise HTTPException(422, "Invalid token")

    fingerprint = hashlib.sha256(
        purchase_token.encode("utf-8")
    ).hexdigest()

    now = now or datetime.now(timezone.utc)

    keys = (
        "lidya_operation",
        "lidya_reference_id",
        "lidya_details",
        "lidya_actor_id",
    )

    saved = {k: db.info.get(k) for k in keys}

    try:
        try:
            data = fetch_from_google(purchase_token)
        except Exception:
            raise HTTPException(
                503, "Google verification unavailable"
            ) from None

        receipt = db.scalar(
            select(PlayPurchaseRecord)
            .where(PlayPurchaseRecord.id == receipt_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if receipt is None:
            raise HTTPException(404, "Receipt not found")

        if (
            receipt.user_id != user_id
            or receipt.token_sha256 != fingerprint
            or receipt.test_purchase
        ):
            raise HTTPException(409, "Receipt mismatch")

        user = db.scalar(
            select(User)
            .where(User.id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if user is None or not user.is_active:
            raise HTTPException(403, "Invalid account")

        refund = db.scalar(
            select(PlayRefundCase.id).where(
                PlayRefundCase.receipt_id == receipt.id
            )
        )

        if refund is not None:
            raise HTTPException(409, "Refund case exists")

        link = db.get(
            WelcomePlayReceipt, receipt.id
        )

        if not link or link.disposition != "verified":
            raise HTTPException(409, "Receipt requires review")

        intent = db.scalar(
            select(WelcomePurchase)
            .where(WelcomePurchase.id == link.intent_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if (
            intent is None
            or intent.user_id != user_id
            or intent.product_id != receipt.product_id
            or link.google_order_id != receipt.google_order_id
        ):
            raise HTTPException(409, "Intent mismatch")

        if receipt.purchase_status == "credited":
            if intent.status != "credited":
                raise HTTPException(409, "Invalid credited state")

            google_consumed = verify_credited_payload(
                data,
                receipt.product_id,
                _account_hash(user_id),
                receipt.google_order_id,
                False,
            )

            db.commit()

            return {
                "credited": False,
                "already_credited": True,
                "google_consumed": google_consumed,
            }

        if (
            receipt.purchase_status != "verified_no_credit"
            or intent.status != "verified"
            or intent.gender != user.gender
        ):
            raise HTTPException(409, "Delivery not allowed")

        verdict = verify_welcome_receipt(
            data, intent, user_id, test_mode=False
        )

        if (
            verdict["requires_review"]
            or verdict["order_id"] != receipt.google_order_id
            or datetime.fromisoformat(
                verdict["completion_time"]
            ) > now
        ):
            raise HTTPException(409, "Payment requires review")

        amount = intent.lidya

        if amount <= 0 or int(user.lidya) > LIMIT - amount:
            raise HTTPException(409, "Balance limit")

        rewards = rewards_for(
            intent.gender, intent.tier
        )

        if len(rewards) != {
            "bronze": 2,
            "silver": 4,
            "gold": 5,
        }[intent.tier]:
            raise HTTPException(409, "Invalid rewards")

        expires = now + timedelta(
            days=intent.duration_days
        )

        for item in rewards:
            kind = item["type"]
            key = item["asset_key"]

            if (
                get_lease(db, user.id, kind, key)
                or permanent(db, user.id, kind, key)
            ):
                raise HTTPException(
                    409, "Existing reward conflict"
                )

            db.add(CosmeticLease(
                user_id=user.id,
                cosmetic_type=kind,
                asset_key=key,
                expires_at=expires,
            ))

        db.info.update(
            lidya_operation="google_play_credit",
            lidya_reference_id=f"play:{receipt.id}",
            lidya_details=(
                f"welcome={intent.tier};"
                f"collection={intent.gender}"
            ),
            lidya_actor_id=None,
        )

        user.lidya += amount
        receipt.purchase_status = "credited"
        intent.status = "credited"

        db.commit()

        return {
            "credited": True,
            "already_credited": False,
            "google_consumed": False,
            "amount": amount,
            "cosmetics": len(rewards),
            "expires_at": expires.isoformat(),
        }

    except ValueError:
        db.rollback()
        raise HTTPException(
            422, "Invalid Google receipt"
        ) from None

    except Exception:
        db.rollback()
        raise

    finally:
        for key, value in saved.items():
            if value is None:
                db.info.pop(key, None)
            else:
                db.info[key] = value
