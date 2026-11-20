"""V15 authenticated read-only payment matching plan endpoint.

No untrusted payment token, callback, or transaction id is accepted. Only the
already-authenticated account's local order can be inspected.
"""
from typing import Callable
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .woocommerce_order_v6 import WebOrderV6
from .woocommerce_order_reconcile_v8 import REF_RE
from .woocommerce_qnbpay_reconciliation_v15 import payment_plan

router = APIRouter(prefix='/v1/woocommerce/qnbpay', tags=['woocommerce-qnbpay-payment-plan'])


def register_auth(current_user: Callable):
    @router.get('/orders/{order_ref}/payment-plan')
    def get_payment_plan(order_ref: str, db: Session = Depends(get_db),
                         user: User = Depends(current_user)):
        if not user.is_active:
            raise HTTPException(403, 'Aktif hesap gerekli')
        if not REF_RE.fullmatch(order_ref):
            raise HTTPException(404, 'Siparis bulunamadi')
        order = db.get(WebOrderV6, order_ref)
        if order is None or order.user_id != user.id:
            raise HTTPException(404, 'Siparis bulunamadi')
        return payment_plan(order_ref=order.id, package_id=order.package_id,
                            local_state=order.state, woocommerce_order_id=order.wc_order_id)

    return router
