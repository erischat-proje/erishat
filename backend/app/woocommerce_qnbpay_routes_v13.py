"""V13 web-only, authenticated, read-only QNBpay readiness endpoints."""
from typing import Callable
from fastapi import APIRouter, Depends, HTTPException
from .models import User
from .woocommerce_web_checkout import CheckoutSelection, package_snapshot
from .woocommerce_qnbpay_gate_v13 import readiness

router = APIRouter(prefix="/v1/woocommerce/qnbpay", tags=["woocommerce-qnbpay-readiness"])


def register_auth(current_user: Callable):
    @router.get("/readiness")
    def get_readiness(user: User = Depends(current_user)):
        if not user.is_active:
            raise HTTPException(403, "Aktif hesap gerekli")
        return readiness()

    @router.post("/preview")
    def preview(selection: CheckoutSelection, user: User = Depends(current_user)):
        if not user.is_active:
            raise HTTPException(403, "Aktif hesap gerekli")
        return {
            "selection": package_snapshot(selection.package_id),
            "readiness": readiness(),
            "order_created": False,
            "payment_initiated": False,
            "coin_credited": False,
        }

    return router
