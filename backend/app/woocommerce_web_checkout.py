"""V5: authenticated, strictly read-only web checkout preflight.

The WooCommerce API and wallet are intentionally untouched. A future QNBpay
verified-payment adapter must be reviewed before enabling transaction creation.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Callable
from .db import get_db
from .models import User
from .purchase_routes import PACKAGES
from .woocommerce_coin_contract import catalog_from_packages

router = APIRouter(prefix="/v1/woocommerce/web-checkout", tags=["woocommerce-web-checkout"])

class CheckoutSelection(BaseModel):
    package_id: int = Field(ge=1, le=16)

def package_snapshot(package_id: int) -> dict:
    # Only authoritative server-side packages, never client-supplied money or balance.
    package = next((p for p in PACKAGES if p["id"] == package_id), None)
    if package is None:
        raise HTTPException(422, "Gecersiz paket")
    mapped = catalog_from_packages(PACKAGES)[f'LIDYA-{package["total"]}']
    return {"package_id": package_id, "sku": mapped.sku, "amount": mapped.amount,
            "base": package["base"], "bonus": package["bonus"],
            "price_try": package["price_try"], "currency": "TRY"}

def register_auth(current_user: Callable):
    @router.get("/status")
    def status(user: User = Depends(current_user)):
        if not user.is_active:
            raise HTTPException(403, "Aktif hesap gerekli")
        return {"available": False, "reason": "QNBpay dogrulanmis odeme entegrasyonu henuz acilmadi",
                "payment_enabled": False, "coin_fulfillment_enabled": False}

    @router.post("/prepare")
    def prepare(selection: CheckoutSelection, user: User = Depends(current_user)):
        if not user.is_active:
            raise HTTPException(403, "Aktif hesap gerekli")
        package = package_snapshot(selection.package_id)
        # Prepare a server-authoritative selection, not an actual order or payment.
        return {"selection": package, "order_created": False, "payment_available": False,
                "credited": False, "message": "Guvenli web odemesi henuz aktif degil."}

    return router
