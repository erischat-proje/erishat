"""V18 authenticated, account-scoped, read-only risk planning endpoint."""
from typing import Callable
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .woocommerce_order_v6 import WebOrderV6
from .woocommerce_order_reconcile_v8 import REF_RE
from .woocommerce_qnbpay_risk_v18 import review_plan

router = APIRouter(prefix='/v1/woocommerce/qnbpay', tags=['woocommerce-qnbpay-risk-plan'])


def register_auth(current_user: Callable):
    @router.get('/orders/{order_ref}/refund-risk-plan')
    def get_refund_risk_plan(order_ref: str, db: Session = Depends(get_db),
                             user: User = Depends(current_user)):
        if not user.is_active:
            raise HTTPException(403, 'Aktif hesap gerekli')
        if not REF_RE.fullmatch(order_ref):
            raise HTTPException(404, 'Siparis bulunamadi')
        row = db.get(WebOrderV6, order_ref)
        if row is None or row.user_id != user.id:
            raise HTTPException(404, 'Siparis bulunamadi')
        return review_plan(order_ref=row.id, package_id=row.package_id,
                           local_state=row.state, woocommerce_order_id=row.wc_order_id)

    return router
