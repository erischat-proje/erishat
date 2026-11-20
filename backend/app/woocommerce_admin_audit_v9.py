"""V9 DA-only read-only oversight. Never create orders, collect payments or credit coins."""
from __future__ import annotations

from typing import Callable
import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .admin_models import AdminRole
from .db import get_db
from .models import User
from .purchase_routes import PACKAGES
from .woocommerce_order_v6 import WebOrderV6
from .woocommerce_order_reconcile_v8 import REF_RE, reconcile_pages
from .woocommerce_catalog_audit_v7 import valid_url
from .config import settings

router = APIRouter(prefix='/v1/admin/woocommerce', tags=['woocommerce-admin-audit'])


def require_da(db: Session, user: User) -> None:
    """Check authoritative database role, not user-input or client flags."""
    if not user.is_active:
        raise HTTPException(403, 'Yetki yok')
    role = db.get(AdminRole, user.id)
    if role is None or role.role != 'DA':
        raise HTTPException(403, 'Yetki yok')


def safe_row(row: WebOrderV6) -> dict:
    return {'order_ref': row.id, 'user_id': row.user_id,
            'package_id': row.package_id, 'local_state': row.state,
            'woocommerce_order_id': row.wc_order_id,
            'created_at': row.created_at.isoformat() if row.created_at else None,
            'payment_verified': False, 'coin_delivery_verified': False}


def fetch_remote_page(page: int, per_page: int) -> list[dict]:
    """One bounded WooCommerce GET; no redirects or credentials in URLs."""
    if not valid_url(settings.woocommerce_rest_base_url):
        raise ValueError('Invalid WooCommerce URL')
    key, secret = settings.woocommerce_rest_consumer_key, settings.woocommerce_rest_consumer_secret
    if not (key.startswith('ck_') and secret.startswith('cs_') and len(key) >= 20 and len(secret) >= 20):
        raise ValueError('WooCommerce credentials unavailable')
    url = settings.woocommerce_rest_base_url.rstrip('/') + '/wp-json/wc/v3/orders'
    response = requests.get(url, auth=(key, secret),
                            params={'page': page, 'per_page': per_page,
                                    'orderby': 'date', 'order': 'desc'},
                            timeout=(4, 12), allow_redirects=False)
    if response.status_code != 200:
        raise ValueError('WooCommerce read failed')
    result = response.json()
    if not isinstance(result, list):
        raise ValueError('Invalid WooCommerce response')
    return result


def audit_order(db: Session, ref: str, fetcher: Callable[[int, int], list[dict]] = fetch_remote_page) -> dict:
    if not REF_RE.fullmatch(ref):
        raise HTTPException(404, 'Siparis bulunamadi')
    row = db.get(WebOrderV6, ref)
    if row is None:
        raise HTTPException(404, 'Siparis bulunamadi')
    try:
        result = reconcile_pages(fetcher, order_ref=row.id, user_id=row.user_id,
                                 package_id=row.package_id, packages=PACKAGES,
                                 per_page=100, max_pages=10)
        verdict = result.verdict
        remote_id = result.wc_order_id
        scanned = result.pages_scanned
        if verdict == 'MATCHED' and row.wc_order_id is not None and remote_id != row.wc_order_id:
            verdict, remote_id = 'CONFLICT', None
    except (requests.RequestException, ValueError, TypeError):
        verdict, remote_id, scanned = 'INCONCLUSIVE', None, 0
    return {'order_ref': row.id, 'user_id': row.user_id,
            'package_id': row.package_id, 'local_state': row.state,
            'local_woocommerce_order_id': row.wc_order_id,
            'verdict': verdict, 'matching_woocommerce_order_id': remote_id,
            'pages_scanned': scanned, 'safe_to_retry_order_post': False,
            'payment_verified': False, 'coin_delivery_verified': False,
            'note': 'WooCommerce durumu odeme kaniti degildir; otomatik tekrar veya bakiye isleme yok.'}


def register_auth(current_user: Callable):
    @router.get('/orders')
    def list_orders(limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0, le=10000),
                    state: str | None = Query(None, max_length=24),
                    db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        q = select(WebOrderV6)
        if state:
            if state not in ('reserved', 'uncertain', 'created', 'disabled'):
                raise HTTPException(422, 'Gecersiz durum')
            q = q.where(WebOrderV6.state == state)
        records = db.scalars(q.order_by(WebOrderV6.created_at.desc(), WebOrderV6.id.desc())
                             .offset(offset).limit(limit)).all()
        return {'items': [safe_row(x) for x in records], 'limit': limit, 'offset': offset,
                'read_only': True}

    @router.get('/orders/{order_ref}/audit')
    def audit(order_ref: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        return audit_order(db, order_ref)

    return router
