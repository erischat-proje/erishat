"""V19 authenticated, account-scoped, read-only Coin delivery readiness plan."""
from typing import Callable
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .woocommerce_order_v6 import WebOrderV6
from .woocommerce_order_reconcile_v8 import REF_RE
from .woocommerce_qnbpay_delivery_v19 import delivery_plan

router = APIRouter(prefix='/v1/woocommerce/qnbpay', tags=['woocommerce-qnbpay-delivery-plan'])


def register_auth(current_user: Callable):
    @router.get('/orders/{order_ref}/coin-delivery-plan')
    def get_coin_delivery_plan(order_ref: str, db: Session = Depends(get_db),
                               user: User = Depends(current_user)):
        if not user.is_active:
            raise HTTPException(403, 'Aktif hesap gerekli')
        if not REF_RE.fullmatch(order_ref):
            raise HTTPException(404, 'Siparis bulunamadi')
        row = db.get(WebOrderV6, order_ref)
        if row is None or row.user_id != user.id:
            raise HTTPException(404, 'Siparis bulunamadi')
        return delivery_plan(order_ref=row.id, package_id=row.package_id,
                             local_state=row.state, woocommerce_order_id=row.wc_order_id)

    return router
