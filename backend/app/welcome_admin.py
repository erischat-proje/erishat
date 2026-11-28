"""DA-only read-only welcome package financial oversight."""
from fastapi import (
    APIRouter, Depends, HTTPException,
    Query, Response,
)
from sqlalchemy import select, func, case

from .db import get_db
from .models import User
from .admin_models import AdminRole
from .welcome_purchase_models import (
    WelcomePurchase, WelcomePlayReceipt,
)
from .play_billing_models import PlayPurchaseRecord
from .play_refund_models import PlayRefundCase


def require_da(db, user):
    role = db.get(
        AdminRole, user.id,
        populate_existing=True,
    )

    if (
        not user.is_active
        or role is None
        or role.role != "DA"
    ):
        raise HTTPException(403, "Yalnızca DA için")


def payment_query():
    return (
        select(
            WelcomePurchase,
            WelcomePlayReceipt,
            PlayPurchaseRecord,
            PlayRefundCase,
            User.public_id,
        )
        .join(
            WelcomePlayReceipt,
            WelcomePlayReceipt.intent_id ==
            WelcomePurchase.id,
        )
        .join(
            PlayPurchaseRecord,
            PlayPurchaseRecord.id ==
            WelcomePlayReceipt.receipt_id,
        )
        .join(
            User, User.id == WelcomePurchase.user_id
        )
        .outerjoin(
            PlayRefundCase,
            PlayRefundCase.receipt_id ==
            PlayPurchaseRecord.id,
        )
        .where(
            PlayPurchaseRecord.user_id ==
            WelcomePurchase.user_id,
            PlayPurchaseRecord.product_id ==
            WelcomePurchase.product_id,
            PlayPurchaseRecord.google_order_id ==
            WelcomePlayReceipt.google_order_id,
            PlayPurchaseRecord.test_purchase.is_(False),
        )
    )


def payment_state():
    return case(
        (PlayRefundCase.id.is_not(None), "refunded"),
        (WelcomePlayReceipt.disposition == "review", "review"),
        (PlayPurchaseRecord.purchase_status == "credited", "delivered"),
        else_="pending",
    )


def list_payments(
    db, user, status="all",
    public_id=None, before=None, limit=50,
):
    require_da(db, user)

    if status not in (
        "all", "pending", "delivered",
        "review", "refunded",
    ):
        raise HTTPException(422, "Geçersiz ödeme durumu")

    limit = max(1, min(int(limit), 100))
    query = payment_query()

    if status != "all":
        query = query.where(
            payment_state() == status
        )

    if public_id:
        query = query.where(
            User.public_id == public_id
        )

    if before is not None:
        query = query.where(
            PlayPurchaseRecord.id < before
        )

    rows = db.execute(
        query.order_by(
            PlayPurchaseRecord.id.desc()
        ).limit(limit + 1)
    ).all()

    items = []

    for intent, link, receipt, refund, pid in rows[:limit]:
        state = (
            "refunded" if refund
            else "review" if link.disposition == "review"
            else "delivered"
            if receipt.purchase_status == "credited"
            else "pending"
        )

        items.append({
            "receipt_id": receipt.id,
            "public_id": pid,
            "tier": intent.tier,
            "collection": intent.gender,
            "product_id": receipt.product_id,
            "catalog_price_kurus": intent.price_kurus,
            "package_lidya": intent.lidya,
            "delivered_lidya": (
                intent.lidya
                if receipt.purchase_status == "credited"
                else 0
            ),
            "duration_days": intent.duration_days,
            "status": state,
            "review_reason": link.review_reason,
            "refund_case_id": refund.id if refund else None,
            "refund_case_status": (
                refund.status if refund else None
            ),
            "created_at": receipt.created_at.isoformat(),
        })

    return {
        "items": items,
        "has_more": len(rows) > limit,
        "next_before": (
            items[-1]["receipt_id"]
            if len(rows) > limit else None
        ),
        "read_only": True,
        "wallet_changed": False,
    }


def overview(db, user):
    require_da(db, user)

    base = payment_query().with_only_columns(
        payment_state().label("state"),
        WelcomePurchase.price_kurus.label("price"),
        WelcomePurchase.lidya.label("lidya"),
        PlayPurchaseRecord.purchase_status.label("receipt_status"),
    ).subquery()

    rows = db.execute(
        select(
            base.c.state,
            func.count(),
            func.coalesce(func.sum(base.c.price), 0),
            func.coalesce(
                func.sum(case(
                    (
                        base.c.receipt_status == "credited",
                        base.c.lidya,
                    ),
                    else_=0,
                )),
                0,
            ),
        ).group_by(base.c.state)
    ).all()

    states = {
        key: {
            "count": 0,
            "catalog_value_kurus": 0,
            "historically_delivered_lidya": 0,
        }
        for key in (
            "pending", "delivered",
            "review", "refunded",
        )
    }

    for state, count, value, lidya in rows:
        states[state] = {
            "count": int(count),
            "catalog_value_kurus": int(value),
            "historically_delivered_lidya": int(lidya),
        }

    prepared = db.scalar(
        select(func.count())
        .select_from(WelcomePurchase)
        .where(
            WelcomePurchase.status == "prepared"
        )
    )

    return {
        "states": states,
        "prepared_intents": int(prepared or 0),
        "currency": "TRY",
        "revenue_verified": False,
        "test_payments_excluded": True,
        "read_only": True,
        "wallet_changed": False,
    }



def payment_cosmetics(db, user, receipt_id, now=None):
    from datetime import datetime, timezone
    from .cosmetic_leases import CosmeticLease
    from .welcome_cosmetics import rewards_for, utc

    require_da(db, user)

    row = db.execute(
        payment_query().where(
            PlayPurchaseRecord.id == receipt_id
        )
    ).one_or_none()

    if row is None:
        raise HTTPException(404, "Ödeme bulunamadı")

    intent, link, receipt, refund, pid = row

    if refund and (
        refund.user_id != receipt.user_id
        or refund.product_id != receipt.product_id
    ):
        raise HTTPException(409, "İade kaydı eşleşmiyor")

    customer = db.get(
        User, intent.user_id,
        populate_existing=True,
    )

    now = utc(now or datetime.now(timezone.utc))

    delivered = (
        link.disposition == "verified"
        and receipt.purchase_status == "credited"
        and intent.status == "credited"
    )

    rewards = rewards_for(
        intent.gender, intent.tier
    )

    leases = {}

    if delivered:
        rows = db.scalars(
            select(CosmeticLease).where(
                CosmeticLease.user_id == intent.user_id,
                CosmeticLease.asset_key.in_([
                    item["asset_key"]
                    for item in rewards
                ]),
            )
        ).all()

        leases = {
            (x.cosmetic_type, x.asset_key): x
            for x in rows
        }

    items = []

    for reward in rewards:
        lease = leases.get((
            reward["type"],
            reward["asset_key"],
        ))

        expires = (
            utc(lease.expires_at)
            if lease else None
        )

        if refund:
            status = "refunded"
        elif link.disposition == "review":
            status = "review"
        elif not delivered:
            status = "pending"
        elif not lease:
            status = "missing"
        elif expires <= now:
            status = "expired"
        elif not customer or not customer.is_active:
            status = "account_inactive"
        elif customer.gender != intent.gender:
            status = "collection_changed"
        else:
            status = "valid"

        items.append({
            "type": reward["type"],
            "name": reward["name"],
            "asset_key": reward["asset_key"],
            "duration_days": reward["duration_days"],
            "expires_at": (
                expires.isoformat()
                if expires else None
            ),
            "status": status,
            "lease_recorded": lease is not None,
        })

    return {
        "receipt_id": receipt.id,
        "public_id": pid,
        "tier": intent.tier,
        "collection": intent.gender,
        "delivered": delivered,
        "items": items,
        "read_only": True,
        "wallet_changed": False,
    }



def unresolved_authorizations(
    db, user, public_id=None, before=None,
    limit=50, now=None,
):
    from datetime import datetime, timezone
    from .welcome_cosmetics import utc
    from .welcome_purchase_models import WelcomeLaunchPermit

    require_da(db, user)

    now = utc(now or datetime.now(timezone.utc))
    limit = max(1, min(int(limit), 100))

    query = (
        select(
            WelcomePurchase,
            WelcomeLaunchPermit,
            User.public_id,
        )
        .join(
            WelcomeLaunchPermit,
            WelcomeLaunchPermit.intent_id ==
            WelcomePurchase.id,
        )
        .join(
            User,
            User.id == WelcomePurchase.user_id,
        )
        .where(
            WelcomePurchase.status == "prepared",
            ~select(WelcomePlayReceipt.receipt_id)
            .where(
                WelcomePlayReceipt.intent_id ==
                WelcomePurchase.id
            ).exists(),
        )
    )

    if public_id:
        query = query.where(
            User.public_id == public_id
        )

    if before:
        query = query.where(
            WelcomePurchase.id < before
        )

    rows = db.execute(
        query.order_by(
            WelcomePurchase.id.desc()
        ).limit(limit + 1)
    ).all()

    items = []

    for intent, permit, pid in rows[:limit]:

        expires = utc(permit.expires_at)

        items.append({
            "public_id": pid,
            "tier": intent.tier,
            "product_id": intent.product_id,
            "catalog_price_kurus": intent.price_kurus,
            "status": (
                "authorization_reserved"
                if expires > now
                else "payment_unknown"
            ),
            "created_at": utc(permit.created_at).isoformat(),
            "expires_at": expires.isoformat(),
            "receipt_recorded": False,
            "repurchase_blocked": True,
        })

    return {
        "items": items,
        "has_more": len(rows) > limit,
        "next_before": (
            rows[limit - 1][0].id
            if len(rows) > limit else None
        ),
        "read_only": True,
        "wallet_changed": False,
        "automatic_reissue": False,
    }


def register_auth(current_user):
    router = APIRouter(
        prefix="/v1/admin/welcome-packages",
        tags=["DA Welcome Packages"],
    )


    @router.get("/unresolved-authorizations")
    def admin_unresolved_authorizations(
        response: Response,
        public_id: str | None = Query(None, max_length=32),
        before: str | None = Query(None, max_length=36),
        limit: int = Query(50, ge=1, le=100),
        user=Depends(current_user),
        db=Depends(get_db),
    ):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Vary"] = "Authorization"

        return unresolved_authorizations(
            db, user, public_id, before, limit
        )

    @router.get("/overview")
    def admin_overview(
        response: Response,
        user=Depends(current_user),
        db=Depends(get_db),
    ):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Vary"] = "Authorization"

        return overview(db, user)

    @router.get("/payments")
    def admin_payments(
        response: Response,
        status: str = "all",
        public_id: str | None = Query(None, max_length=32),
        before: int | None = Query(None, ge=1),
        limit: int = Query(50, ge=1, le=100),
        user=Depends(current_user),
        db=Depends(get_db),
    ):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Vary"] = "Authorization"

        return list_payments(
            db, user, status,
            public_id, before, limit,
        )


    @router.get("/payments/{receipt_id}/cosmetics")
    def admin_payment_cosmetics(
        receipt_id: int,
        response: Response,
        user=Depends(current_user),
        db=Depends(get_db),
    ):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Vary"] = "Authorization"

        return payment_cosmetics(
            db, user, receipt_id
        )

    return router
