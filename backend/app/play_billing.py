"""Google Play one-time purchase verifier. No wallet mutation or charge capture.

Requires service credentials and explicit enablement; defaults fail closed.
"""
import hashlib
import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

from .config import settings
from .purchase_routes import PACKAGES
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .play_billing_models import PlayPurchaseRecord
from .db import get_db

router = APIRouter(tags=['google-play-billing'])
SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
PRODUCTS = {f"lidya_{p['id']:03d}": p for p in PACKAGES}

class VerifyPurchase(BaseModel):
    product_id: str = Field(pattern=r'^lidya_0(?:0[1-9]|1[0-6])$')
    purchase_token: str = Field(min_length=8, max_length=4096)


def verify_payload(data, product_id, expected_account_id):
    """Pure fail-closed validation; does not create an entitlement."""
    if not isinstance(data, dict):
        raise ValueError('Geçersiz Google Play yanıtı')
    state = (data.get('purchaseStateContext') or {}).get('purchaseState')
    if state != 'PURCHASED' or not data.get('purchaseCompletionTime'):
        raise ValueError('Ödeme tamamlanmamış')
    items = data.get('productLineItem')
    if not isinstance(items, list) or len(items) != 1 or items[0].get('productId') != product_id:
        raise ValueError('Google Play ürün kimliği eşleşmiyor')
    offer = items[0].get('productOfferDetails') or {}
    if offer.get('purchaseOptionId') != 'standart':
        raise ValueError('Satın alma seçeneği eşleşmiyor')
    if offer.get('quantity', 1) != 1:
        raise ValueError('Çoklu miktar henüz desteklenmiyor')
    if offer.get('consumptionState') == 'CONSUMPTION_STATE_CONSUMED':
        raise ValueError('Bu ödeme önceden tüketilmiş')
    bound = data.get('obfuscatedExternalAccountId')
    if not bound or bound != expected_account_id:
        raise ValueError('Satın alma hesabı doğrulanamadı')
    return {'product_id': product_id, 'order_id': data.get('orderId'),
            'test_purchase': bool(data.get('testPurchaseContext')),
            'acknowledged': data.get('acknowledgementState') == 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'}


def fetch_from_google(token):
    raw = settings.google_play_service_account_json
    if not raw:
        raise RuntimeError('Google Play hizmet hesabı yapılandırılmamış')
    info = json.loads(raw)
    if info.get('type') != 'service_account':
        raise RuntimeError('Geçersiz hizmet hesabı yapılandırması')
    credentials = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
    session = AuthorizedSession(credentials)
    # Token is opaque and must never be placed in logs.
    from urllib.parse import quote
    url = ('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
           + settings.google_play_package_name + '/purchases/productsv2/tokens/' + quote(token, safe=''))
    response = session.get(url, timeout=12)
    if response.status_code != 200:
        raise RuntimeError('Google Play satın alma bilgisi doğrulanamadı')
    return response.json()


def register_auth(current_user):
    @router.post('/v1/google-play/verify-preview')
    def verify_preview(payload: VerifyPurchase, user=Depends(current_user), db=Depends(get_db)):
        """Verification-only; no wallet credit, consumption, acknowledgement, or order insert."""
        if not settings.google_play_billing_enabled:
            raise HTTPException(503, 'Google Play ödeme doğrulaması henüz etkin değil')
        if payload.product_id not in PRODUCTS:
            raise HTTPException(422, 'Bilinmeyen Lidya paketi')
        # Same SHA-256 identifier must be set on native BillingFlowParams before purchase.
        account_id = hashlib.sha256(('lidyachat:' + str(user.id)).encode()).hexdigest()
        try:
            data = fetch_from_google(payload.purchase_token)
            verdict = verify_payload(data, payload.product_id, account_id)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        except Exception:
            # Do not expose tokens, OAuth details, or upstream diagnostics.
            raise HTTPException(503, 'Google Play doğrulaması geçici olarak kullanılamıyor') from None
        # Record the verified transaction without granting virtual currency.
        # Fingerprint is unique across all users; no raw purchase token is persisted.
        # db is injected via the endpoint's dependency, never created ad hoc.
        receipt = record_verified_receipt(db, user.id, payload.product_id, payload.purchase_token, verdict)
        return {'verified': True, 'credited': False, 'delivery_status': 'disabled',
                'receipt_id': receipt.id, **verdict}


def record_verified_receipt(db, user_id, product_id, purchase_token, verdict):
    """Immutable verified purchase identity; repeated same-account requests are idempotent.

    This function has NO balance effects and must never be used as fulfillment.
    """
    token_hash = hashlib.sha256(purchase_token.encode('utf-8')).hexdigest()
    def same_owner(row):
        if row.user_id != user_id or row.product_id != product_id:
            raise HTTPException(409, 'Satın alma belirteci başka bir hesap veya ürünle eşleşiyor')
        return row
    existing = db.scalar(select(PlayPurchaseRecord).where(PlayPurchaseRecord.token_sha256 == token_hash))
    if existing:
        return same_owner(existing)
    row = PlayPurchaseRecord(token_sha256=token_hash, user_id=user_id, product_id=product_id,
                             google_order_id=verdict.get('order_id'),
                             test_purchase=bool(verdict.get('test_purchase')),
                             purchase_status='verified_no_credit')
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
        return row
    except IntegrityError:
        db.rollback()
        concurrent = db.scalar(select(PlayPurchaseRecord).where(PlayPurchaseRecord.token_sha256 == token_hash))
        if concurrent:
            return same_owner(concurrent)
        raise HTTPException(409, 'Satın alma kaydı çakışması') from None
