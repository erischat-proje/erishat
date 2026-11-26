"""V6: guarded WooCommerce pending-order creation; NEVER captures payment or credits wallet.

A durable local reservation precedes the remote call. After a lost response,
the order is marked uncertain and never automatically re-posted. Reconciliation
with WooCommerce is required before any operator repeats the operation.
"""
import hmac
import re
from datetime import datetime, timezone
from typing import Callable
from uuid import uuid4
from urllib.parse import urlsplit

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column

from .config import settings
from .db import Base, get_db
from .models import User
from .purchase_routes import PACKAGES
from .woocommerce_coin_contract import catalog_from_packages, verify_order_snapshot, CatalogMismatch, _money_kurus

router = APIRouter(prefix='/v1/woocommerce/web-orders', tags=['woocommerce-web-orders'])

class WebOrderV6(Base):
    __tablename__ = 'woocommerce_web_orders_v6'
    __table_args__ = (UniqueConstraint('user_id', 'request_key', name='uq_wc_v6_user_request'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    request_key: Mapped[str] = mapped_column(String(64), nullable=False)
    package_id: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(24), nullable=False, default='reserved')
    wc_order_id: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class OrderRequest(BaseModel):
    package_id: int = Field(ge=1, le=16)
    request_key: str = Field(min_length=16, max_length=64, pattern=r'^[A-Za-z0-9_-]+$')


def configured() -> bool:
    base = settings.woocommerce_rest_base_url.strip().rstrip('/')
    parts = urlsplit(base)
    # Fixed first-party host: prevents turning REST credentials into an SSRF primitive.
    return (bool(settings.woocommerce_order_creation_enabled) and
            parts.scheme == 'https' and parts.hostname == 'magaza.lidyachat.com' and
            parts.port is None and not parts.username and not parts.password and
            parts.path in ('', '/') and not parts.query and not parts.fragment and
            settings.woocommerce_rest_consumer_key.startswith('ck_') and
            settings.woocommerce_rest_consumer_secret.startswith('cs_') and
            len(settings.woocommerce_rest_consumer_key) >= 20 and
            len(settings.woocommerce_rest_consumer_secret) >= 20)


def _endpoint(resource: str) -> str:
    return settings.woocommerce_rest_base_url.strip().rstrip('/') + '/wp-json/wc/v3/' + resource


def _auth():
    return (settings.woocommerce_rest_consumer_key, settings.woocommerce_rest_consumer_secret)


def _json_response(resp: requests.Response):
    if resp.status_code not in (200, 201):
        raise RuntimeError('WooCommerce API rejected the request')
    data = resp.json()
    if not isinstance(data, (dict, list)):
        raise RuntimeError('Invalid WooCommerce response')
    return data


def create_remote_pending_order(order: WebOrderV6, user: User) -> int:
    """At most one POST per committed local reservation. Never auto retry."""
    item = next(p for p in PACKAGES if p['id'] == order.package_id)
    sku = f"LIDYA-{item['total']}"
    catalog = catalog_from_packages(PACKAGES)
    if sku not in catalog:
        raise RuntimeError('Package missing from catalog')
    products_response = requests.get(_endpoint('products'), auth=_auth(),
        params={'sku': sku, 'per_page': 10}, timeout=(4, 12), allow_redirects=False)
    products = _json_response(products_response)
    if not isinstance(products, list) or len(products) != 1:
        raise RuntimeError('WooCommerce product SKU missing or ambiguous')
    product = products[0]
    product_id = product.get('id')
    if (type(product_id) is not int or product_id <= 0 or product.get('sku') != sku or
        product.get('status') != 'publish' or product.get('virtual') is not True or
        product.get('type') != 'simple' or
        _money_kurus(product.get('price')) != catalog[sku].price_kurus):
        raise RuntimeError('WooCommerce product catalog mismatch')

    # The user never submits arbitrary product ids, prices, payment status or coin amounts.
    payload = {
        'status': 'pending', 'set_paid': False, 'customer_id': 0,
        'currency': 'TRY', 'line_items': [{'product_id': product_id, 'quantity': 1}],
        'meta_data': [
            {'key': '_lidyachat_order_ref', 'value': order.id},
            {'key': '_lidyachat_user_id', 'value': user.id},
            {'key': '_lidyachat_package_id', 'value': order.package_id},
        ],
    }
    response = requests.post(_endpoint('orders'), auth=_auth(), json=payload,
                             timeout=(4, 15), allow_redirects=False)
    remote = _json_response(response)
    if not isinstance(remote, dict) or type(remote.get('id')) is not int or remote['id'] <= 0:
        raise RuntimeError('WooCommerce returned no order id')
    if remote.get('status') != 'pending' or remote.get('date_paid'):
        raise RuntimeError('WooCommerce order status unexpected')
    try:
        selected = verify_order_snapshot(remote, PACKAGES)
    except (CatalogMismatch, ValueError) as exc:
        raise RuntimeError('WooCommerce order price validation failed') from exc
    if selected.package_id != order.package_id:
        raise RuntimeError('WooCommerce package changed')
    return remote['id']


def view(record: WebOrderV6) -> dict:
    return {'id': record.id, 'package_id': record.package_id,
            'status': record.state, 'woocommerce_order_id': record.wc_order_id,
            'payment_verified': False, 'credited': False,
            'message': 'Siparis olusturulmasi odeme veya Coin teslimati anlamina gelmez.'}


def create(db: Session, user: User, payload: OrderRequest) -> dict:
    if not user.is_active:
        raise HTTPException(403, 'Aktif hesap gerekli')
    if not configured():
        raise HTTPException(503, 'WooCommerce siparis olusturma kapali')
    current = db.scalar(select(WebOrderV6).where(WebOrderV6.user_id == user.id,
                                                  WebOrderV6.request_key == payload.request_key))
    if current:
        if current.package_id != payload.package_id:
            raise HTTPException(409, 'Istek anahtari farkli pakette kullanildi')
        return view(current)
    # Serialize this user's order reservations; protects concurrent duplicate and active orders.
    locked_user = db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not locked_user or not locked_user.is_active:
        raise HTTPException(403, 'Aktif hesap gerekli')
    current = db.scalar(select(WebOrderV6).where(WebOrderV6.user_id == user.id,
                                                  WebOrderV6.request_key == payload.request_key))
    if current:
        if current.package_id != payload.package_id:
            raise HTTPException(409, 'Istek anahtari farkli pakette kullanildi')
        return view(current)
    active = db.scalar(select(WebOrderV6.id).where(WebOrderV6.user_id == user.id,
        WebOrderV6.state.in_(['reserved', 'created', 'uncertain'])).limit(1))
    if active:
        raise HTTPException(409, 'Onceki WooCommerce siparisiniz henuz acik')
    record = WebOrderV6(id=str(uuid4()), user_id=user.id,
                        request_key=payload.request_key, package_id=payload.package_id,
                        state='reserved')
    db.add(record)
    try:
        db.commit() # Durable before any external POST.
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Siparis rezervasyonu cakismasi')
    # Rechecking flag prevents accidentally posting after the feature is switched off.
    if not configured():
        record.state = 'disabled'
        db.commit()
        raise HTTPException(503, 'WooCommerce siparis olusturma kapali')
    try:
        remote_id = create_remote_pending_order(record, user)
    except Exception:
        # Includes network timeout AFTER remote may have created an order.
        # Never re-POST: human/operator reconciliation via _lidyachat_order_ref.
        record.state = 'uncertain'
        db.commit()
        raise HTTPException(502, 'WooCommerce siparisi dogrulanamadi; tekrar denemeyin, destekle gorusun')
    record.wc_order_id = remote_id
    record.state = 'created'
    db.commit()
    return view(record)


def register_auth(current_user: Callable):
    @router.get('/status')
    def status(user: User = Depends(current_user)):
        return {'available': configured() and bool(user.is_active),
                'payment_enabled': False, 'coin_fulfillment_enabled': False}

    @router.post('')
    def new_order(payload: OrderRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
        return create(db, user, payload)

    @router.get('/{order_id}')
    def order_status(order_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
        if not re.fullmatch(r'[0-9a-f-]{36}', order_id):
            raise HTTPException(404, 'Siparis bulunamadi')
        row = db.get(WebOrderV6, order_id)
        if not row or row.user_id != user.id:
            raise HTTPException(404, 'Siparis bulunamadi')
        return view(row)
    return router
