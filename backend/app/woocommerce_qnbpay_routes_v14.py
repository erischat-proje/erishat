"""V14: account-scoped order audit. Never queries PSP or performs a write."""
from typing import Callable
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .woocommerce_order_v6 import WebOrderV6
from .woocommerce_qnbpay_audit_v14 import audit_plan
from .woocommerce_order_reconcile_v8 import REF_RE

router = APIRouter(prefix='/v1/woocommerce/qnbpay', tags=['woocommerce-qnbpay-audit'])


def register_auth(current_user: Callable):
    @router.get('/orders/{order_ref}/audit-plan')
    def get_audit_plan(order_ref: str, db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
        if not user.is_active:
            raise HTTPException(403, 'Aktif hesap gerekli')
        if not REF_RE.fullmatch(order_ref):
            raise HTTPException(404, 'Siparis bulunamadi')
        row = db.get(WebOrderV6, order_ref)
        # Don't leak the existence of another user's local orders.
        if row is None or row.user_id != user.id:
            raise HTTPException(404, 'Siparis bulunamadi')
        return audit_plan(order_ref=row.id, package_id=row.package_id,
                          local_state=row.state,
                          woocommerce_order_id=row.wc_order_id)

    return router
