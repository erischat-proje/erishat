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
    # Require explicit server-authoritative quantities; missing values fail closed.
    if type(offer.get('quantity')) is not int or offer['quantity'] != 1:
        raise ValueError('Geçersiz satın alma miktarı')
    if type(offer.get('refundableQuantity')) is not int or offer['refundableQuantity'] != 1:
        raise ValueError('İade edilmiş veya belirsiz satın alma')
    if offer.get('consumptionState') != 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED':
        raise ValueError('Ödeme tüketilmiş veya tüketim durumu belirsiz')
    order_id = data.get('orderId')
    if not isinstance(order_id, str) or not (1 <= len(order_id) <= 128):
        raise ValueError('Google Play sipariş kimliği eksik')
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



# Final integration: gated until commercial/policy approval and service-account readiness.
def _checkout_ready():
    return bool(settings.google_play_billing_enabled and settings.google_play_fulfillment_enabled
                and settings.google_play_policy_approved and settings.google_play_service_account_json)


def _account_hash(user_id):
    return hashlib.sha256(('lidyachat:' + str(user_id)).encode('utf-8')).hexdigest()


def _consume_google(product_id, token):
    """Only after durable entitlement commit; retry is safe on a credited receipt."""
    from urllib.parse import quote
    raw = json.loads(settings.google_play_service_account_json)
    credentials = service_account.Credentials.from_service_account_info(raw, scopes=[SCOPE])
    session = AuthorizedSession(credentials)
    url = ('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
           + quote(settings.google_play_package_name, safe='') + '/purchases/products/'
           + quote(product_id, safe='') + '/tokens/' + quote(token, safe='') + ':consume')
    response = session.post(url, timeout=12)
    if response.status_code not in (200, 204):
        raise RuntimeError('Google Play consumption failed')


def verify_credited_payload(data, product_id, account_id, recorded_order_id, recorded_test_purchase):
    """Recheck an already-credited Play token without crediting again.

    Consumed purchases remain valid for repeat requests, but a refund,
    mismatched owner, order or product must fail closed.
    """
    from copy import deepcopy
    items = data.get('productLineItem') if isinstance(data, dict) else None
    if not isinstance(items, list) or len(items) != 1 or not isinstance(items[0], dict):
        raise ValueError('Geçersiz ürün kaydı')
    details = items[0].get('productOfferDetails')
    if not isinstance(details, dict):
        raise ValueError('Satın alma seçeneği eksik')
    state = details.get('consumptionState')
    if state not in ('CONSUMPTION_STATE_CONSUMED', 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'):
        raise ValueError('Geçersiz tüketim durumu')
    checked = deepcopy(data)
    checked['productLineItem'][0]['productOfferDetails']['consumptionState'] = 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'
    verdict = verify_payload(checked, product_id, account_id)
    if verdict['order_id'] != recorded_order_id or verdict['test_purchase'] != recorded_test_purchase:
        raise ValueError('Satın alma geçmişi eşleşmiyor')
    return state == 'CONSUMPTION_STATE_CONSUMED'


def register_checkout_auth(current_user):
    @router.get('/v1/google-play/checkout-status')
    def checkout_status(user=Depends(current_user)):
        enabled = _checkout_ready()
        return {'enabled': enabled, 'account_hash': _account_hash(user.id) if enabled else None}

    @router.post('/v1/google-play/checkout-complete')
    def checkout_complete(payload: VerifyPurchase, user=Depends(current_user), db=Depends(get_db)):
        from .play_fulfillment import credit_verified_purchase
        if not _checkout_ready():
            raise HTTPException(503, 'Google Play satın alma işlemi kapalı')
        if payload.product_id not in PRODUCTS:
            raise HTTPException(422, 'Bilinmeyen ürün')
        expected = _account_hash(user.id)
        token_hash = hashlib.sha256(payload.purchase_token.encode('utf-8')).hexdigest()
        previous = db.scalar(select(PlayPurchaseRecord).where(PlayPurchaseRecord.token_sha256 == token_hash))
        if previous is not None:
            if previous.user_id != user.id or previous.product_id != payload.product_id:
                raise HTTPException(409, 'Ödeme başka hesap veya ürüne ait')
            if previous.purchase_status == 'credited':
                # Never trust a repeated token from the client without a fresh Google check.
                try:
                    fresh = fetch_from_google(payload.purchase_token)
                    was_consumed = verify_credited_payload(
                        fresh, payload.product_id, expected, previous.google_order_id,
                        bool(previous.test_purchase))
                except ValueError as exc:
                    raise HTTPException(422, str(exc)) from None
                except Exception:
                    raise HTTPException(503, 'Google Play tekrar doğrulaması kullanılamıyor') from None
                # If consumed, do not call consume again. Otherwise retry idempotently.
                consumption = 'completed' if was_consumed else 'retry_required'
                if not was_consumed:
                    try:
                        _consume_google(payload.product_id, payload.purchase_token)
                        consumption = 'completed'
                    except Exception:
                        pass
                return {'credited': True, 'already_credited': True, 'receipt_id': previous.id,
                        'consumption': consumption}
        try:
            google_data = fetch_from_google(payload.purchase_token)
            verdict = verify_payload(google_data, payload.product_id, expected)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        except Exception:
            raise HTTPException(503, 'Google Play doğrulaması yapılamadı; tekrar deneyin') from None
        receipt = record_verified_receipt(db, user.id, payload.product_id, payload.purchase_token, verdict)
        result = credit_verified_purchase(db, receipt_id=receipt.id,
                                          user_id=user.id, product_id=payload.product_id)
        try:
            _consume_google(payload.product_id, payload.purchase_token)
            consumption = 'completed'
        except Exception:
            consumption = 'retry_required'
        return {'credited': True, 'already_credited': result.get('already_credited', False),
                'receipt_id': receipt.id, 'amount': result.get('amount'),
                'consumption': consumption}
