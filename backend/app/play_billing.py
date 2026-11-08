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
    def verify_preview(payload: VerifyPurchase, user=Depends(current_user)):
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
        # NEVER imply delivery; this endpoint does not grant funds.
        return {'verified': True, 'credited': False, 'delivery_status': 'disabled', **verdict}
