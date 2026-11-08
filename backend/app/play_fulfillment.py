"""Prepared Google Play fulfillment core; intentionally NOT wired to an HTTP route.

A separate default-off fulfillment switch is mandatory. External Google receipt
verification and Google acknowledgement/consumption are separate prerequisites.
Only call following a freshly checked Google Play receipt; never from user input.
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import User
from .play_billing_models import PlayPurchaseRecord
from .purchase_routes import PACKAGES, LIMIT

PACKAGES_BY_PRODUCT = {f"lidya_{p['id']:03d}": p for p in PACKAGES}


def credit_verified_purchase(db: Session, *, receipt_id: int, user_id: str, product_id: str) -> dict:
    """Idempotent PostgreSQL row-locked credit, with a single atomic commit.

    No payment collection, verification, acknowledgement or consumption happens here.
    A caller must freshly validate with Google BEFORE invoking this function.
    Never expose this function directly as a client-controlled API endpoint.
    """
    if not settings.google_play_billing_enabled or not settings.google_play_fulfillment_enabled:
        raise HTTPException(503, "Google Play teslimatı kapalı")
    package = PACKAGES_BY_PRODUCT.get(product_id)
    if package is None:
        raise HTTPException(422, "Bilinmeyen ürün")
    try:
        receipt = db.scalar(select(PlayPurchaseRecord)
                            .where(PlayPurchaseRecord.id == receipt_id).with_for_update())
        if receipt is None:
            raise HTTPException(404, "Satın alma kaydı bulunamadı")
        if receipt.user_id != user_id or receipt.product_id != product_id:
            raise HTTPException(409, "Hesap veya paket eşleşmiyor")
        if receipt.purchase_status == "credited":
            return {"credited": False, "already_credited": True, "receipt_id": receipt.id}
        if receipt.purchase_status != "verified_no_credit" or not receipt.google_order_id:
            raise HTTPException(409, "Bu satın alma teslimata uygun değil")
        user = db.scalar(select(User).where(User.id == user_id).with_for_update())
        if user is None or not user.is_active:
            raise HTTPException(404, "Aktif kullanıcı bulunamadı")
        amount = int(package["total"])
        if amount <= 0 or int(user.lidya) > LIMIT - amount:
            raise HTTPException(409, "Bakiye sınırı aşılıyor")
        # The receipt state and balance write are in the same database transaction.
        # The existing system_data.after_flush listener records the ledger delta.
        user.lidya = int(user.lidya) + amount
        receipt.purchase_status = "credited"
        keys = ("lidya_operation", "lidya_reference_id", "lidya_details")
        saved = {k: db.info.get(k) for k in keys}
        db.info.update(lidya_operation="google_play_credit",
                       lidya_reference_id=f"play:{receipt.id}",
                       lidya_details=f"product={product_id}")
        try:
            db.commit()
        finally:
            for k in keys:
                if saved[k] is None:
                    db.info.pop(k, None)
                else:
                    db.info[k] = saved[k]
        return {"credited": True, "already_credited": False, "receipt_id": receipt.id,
                "amount": amount, "balance": int(user.lidya)}
    except Exception:
        db.rollback()
        raise
