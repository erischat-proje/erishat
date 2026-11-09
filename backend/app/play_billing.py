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
from .play_refund_models import PlayRefundCase
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
            'test_purchase': isinstance(data.get('testPurchaseContext'), dict),
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
        if not _checkout_authorized(user):
            raise HTTPException(403, 'Bu hesap Google Play testine yetkili değil')
        if payload.product_id not in PRODUCTS:
            raise HTTPException(422, 'Bilinmeyen Lidya paketi')
        # Same SHA-256 identifier must be set on native BillingFlowParams before purchase.
        account_id = hashlib.sha256(('lidyachat:' + str(user.id)).encode()).hexdigest()
        try:
            data = fetch_from_google(payload.purchase_token)
            verdict = verify_payload(data, payload.product_id, account_id)
            _require_test_receipt(verdict)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        except HTTPException:
            raise
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
def _play_allowlist(value):
    # Comma-separated allowlist; entries cannot be wildcards or empty.
    return {item.strip().casefold() for item in str(value or '').split(',') if item.strip()}


def _test_user_allowed(user):
    if not getattr(user, 'is_active', False):
        return False
    email = (getattr(user, 'google_email', '') or '').strip().casefold()
    public_id = (getattr(user, 'public_id', '') or '').strip().casefold()
    # The email must come from an authenticated Google identity; otherwise
    # authorize by the stable LidyaChat public ID explicitly configured by DA.
    email_ok = bool(getattr(user, 'google_sub', None) and email and
                    email in _play_allowlist(settings.google_play_test_user_emails))
    id_ok = bool(public_id and public_id in _play_allowlist(settings.google_play_test_user_public_ids))
    return email_ok or id_ok


def _checkout_authorized(user):
    return not settings.google_play_test_mode or _test_user_allowed(user)


def _checkout_ready():
    # Commercial mode still requires policy approval. Test mode requires an
    # explicit allowlist and independently validated Google test receipts.
    credentials_ready = bool(settings.google_play_billing_enabled and
                             settings.google_play_fulfillment_enabled and
                             settings.google_play_service_account_json)
    if not credentials_ready:
        return False
    if settings.google_play_test_mode:
        return bool(_play_allowlist(settings.google_play_test_user_emails) or
                    _play_allowlist(settings.google_play_test_user_public_ids))
    return bool(settings.google_play_policy_approved)


def _require_test_receipt(verdict):
    # A commercial checkout must not grant paid currency for a license-test receipt.
    # In test mode, real-money receipts are rejected to prevent accidental charges.
    is_test_receipt = verdict.get('test_purchase') is True
    if settings.google_play_test_mode and not is_test_receipt:
        raise HTTPException(422, 'Yalnızca Google Play lisans test satın alımları kabul edilir')
    if not settings.google_play_test_mode and is_test_receipt:
        raise HTTPException(422, 'Test satın alımı canlı Lidya yüklemesinde kullanılamaz')


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
    @router.get('/v1/google-play/connection-check')
    def play_connection_check(user=Depends(current_user), db=Depends(get_db)):
        from .admin_models import AdminRole
        admin=db.get(AdminRole,user.id)
        if admin is None or admin.role != 'DA':
            raise HTTPException(403,'Yalnızca DA için')
        return check_google_play_connection()


    @router.get('/v1/google-play/my-purchases')
    def my_purchases(user=Depends(current_user), db=Depends(get_db)):
        """Authenticated user's own last 40 purchases. Never expose purchase tokens."""
        from fastapi import Response
        records = db.scalars(select(PlayPurchaseRecord).where(
            PlayPurchaseRecord.user_id == user.id
        ).order_by(PlayPurchaseRecord.id.desc()).limit(40)).all()
        return {'items': [
            {'receipt_id':r.id, 'product_id':r.product_id,
             'lidya':int(PRODUCTS[r.product_id]['total']) if r.product_id in PRODUCTS else None,
             'status':r.purchase_status, 'test_purchase':bool(r.test_purchase),
             'created_at':r.created_at.isoformat() if r.created_at else None}
            for r in records], 'limit':40}

    @router.get('/v1/google-play/checkout-status')
    def checkout_status(user=Depends(current_user)):
        enabled = _checkout_ready() and _checkout_authorized(user)
        return {'enabled': enabled, 'mode': 'test' if enabled and settings.google_play_test_mode else 'commercial' if enabled else 'disabled',
                'account_hash': _account_hash(user.id) if enabled else None}

    @router.post('/v1/google-play/checkout-complete')
    def checkout_complete(payload: VerifyPurchase, user=Depends(current_user), db=Depends(get_db)):
        from .play_fulfillment import credit_verified_purchase
        if not _checkout_ready():
            raise HTTPException(503, 'Google Play satın alma işlemi kapalı')
        if not _checkout_authorized(user):
            raise HTTPException(403, 'Bu hesap Google Play testine yetkili değil')
        if payload.product_id not in PRODUCTS:
            raise HTTPException(422, 'Bilinmeyen ürün')
        expected = _account_hash(user.id)
        token_hash = hashlib.sha256(payload.purchase_token.encode('utf-8')).hexdigest()
        previous = db.scalar(select(PlayPurchaseRecord).where(PlayPurchaseRecord.token_sha256 == token_hash))
        if previous is not None:
            if previous.user_id != user.id or previous.product_id != payload.product_id:
                raise HTTPException(409, 'Ödeme başka hesap veya ürüne ait')
            if previous.purchase_status == 'credited':
                if bool(previous.test_purchase) != bool(settings.google_play_test_mode):
                    raise HTTPException(422, 'Satın alma kaydı mevcut ödeme moduyla eşleşmiyor')
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
            _require_test_receipt(verdict)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        except HTTPException:
            raise
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



# Read-only DA reconciliation. No balance changes, payment token disclosure, or refunds.
def _voided_audit_rows(items, receipts_by_hash):
    """Match Google voided purchases to our already recorded receipts.

    A mismatched Google order is not attributed to a user. Never return tokens.
    """
    from .purchase_routes import PACKAGES
    amounts = {f"lidya_{p['id']:03d}": int(p['total']) for p in PACKAGES}
    rows, seen = [], set()
    for item in items:
        if not isinstance(item, dict):
            continue
        token = item.get('purchaseToken')
        if not isinstance(token, str) or not token:
            continue
        fingerprint = hashlib.sha256(token.encode('utf-8')).hexdigest()
        receipt = receipts_by_hash.get(fingerprint)
        if receipt is None or receipt.google_order_id != item.get('orderId'):
            continue
        if receipt.id in seen:
            continue
        seen.add(receipt.id)
        rows.append({'receipt_id': receipt.id, 'user_id': receipt.user_id,
                     'product_id': receipt.product_id,
                     'lidya': amounts.get(receipt.product_id, 0),
                     'purchase_status': receipt.purchase_status,
                     'test_purchase': bool(receipt.test_purchase),
                     'voided_reason': item.get('voidedReason'),
                     'voided_source': item.get('voidedSource'),
                     'voided_at_ms': item.get('voidedTimeMillis'),
                     'action': 'manual_review_required'})
    return rows


def _fetch_voided_purchases():
    """Google Play API, last 30 days; bounded pagination, fail closed on errors."""
    from urllib.parse import quote
    raw = settings.google_play_service_account_json
    if not raw:
        raise RuntimeError('Google Play hizmet hesabı eksik')
    info = json.loads(raw)
    if info.get('type') != 'service_account':
        raise RuntimeError('Google Play hizmet hesabı geçersiz')
    creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
    session = AuthorizedSession(creds)
    url = ('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
           + quote(settings.google_play_package_name, safe='') + '/purchases/voidedpurchases')
    items, token, seen_tokens = [], None, set()
    for _ in range(10):
        params = {'type': 0, 'pageSelection.maxResults': 1000}
        if token:
            params['pageSelection.token'] = token
        resp = session.get(url, params=params, timeout=15)
        if resp.status_code != 200:
            raise RuntimeError('Google Play iade kayıtları sorgulanamadı')
        data = resp.json()
        if not isinstance(data, dict) or not isinstance(data.get('voidedPurchases', []), list):
            raise RuntimeError('Google Play iade yanıtı geçersiz')
        items.extend(data.get('voidedPurchases', []))
        next_token = (data.get('tokenPagination') or {}).get('nextPageToken')
        if not next_token:
            return items, False
        if not isinstance(next_token, str) or next_token in seen_tokens:
            raise RuntimeError('Google Play iade sayfalaması geçersiz')
        seen_tokens.add(next_token)
        token = next_token
    return items, True


def register_refund_audit_auth(current_user):
    @router.get('/v1/google-play/refund-audit')
    def refund_audit(user=Depends(current_user), db=Depends(get_db)):
        from .admin_models import AdminRole
        admin = db.get(AdminRole, user.id)
        if admin is None or admin.role != 'DA' or not getattr(user, 'is_active', False):
            raise HTTPException(403, 'Yalnızca DA için')
        try:
            voided, truncated = _fetch_voided_purchases()
            fingerprints = list({hashlib.sha256(x['purchaseToken'].encode('utf-8')).hexdigest()
                                 for x in voided if isinstance(x, dict) and
                                 isinstance(x.get('purchaseToken'), str) and x['purchaseToken']})
            receipts = {}
            for i in range(0, len(fingerprints), 500):
                batch = db.scalars(select(PlayPurchaseRecord).where(
                    PlayPurchaseRecord.token_sha256.in_(fingerprints[i:i+500]))).all()
                receipts.update({row.token_sha256: row for row in batch})
            rows = _voided_audit_rows(voided, receipts)
        except Exception:
            # Deliberately suppress upstream credentials, tokens and Google error bodies.
            raise HTTPException(503, 'Google Play iade denetimi kullanılamıyor; API mali izinlerini kontrol edin') from None
        return {'mode': 'read_only', 'window_days': 30,
                'google_voided_count': len(voided), 'matched_count': len(rows),
                'unmatched_count': len(voided) - len(rows),
                'truncated': truncated, 'items': rows,
                'message': 'Otomatik bakiye düşümü yapılmaz; her iade DA tarafından incelenir.'}



# V2: an explicit DA action saves matches as cases. No automatic wallet mutations.
def _refund_cases_sync(db, rows):
    """Exactly one case per purchase receipt; repeat scans preserve DA decisions."""
    from .play_refund_models import PlayRefundCase
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError
    created = 0
    for row in rows:
        existing = db.scalar(select(PlayRefundCase).where(PlayRefundCase.receipt_id == row['receipt_id']))
        if existing:
            # Preserve immutable identifiers and review state; never reopen a reviewed case.
            continue
        case = PlayRefundCase(receipt_id=row['receipt_id'],user_id=row['user_id'],
                              product_id=row['product_id'],voided_at_ms=str(row.get('voided_at_ms') or '')[:32],
                              voided_reason=str(row.get('voided_reason') if row.get('voided_reason') is not None else '')[:24],
                              voided_source=str(row.get('voided_source') if row.get('voided_source') is not None else '')[:24],
                              status='pending')
        try:
            with db.begin_nested():
                db.add(case)
                db.flush()
            created += 1
        except IntegrityError:
            # Another DA may have synchronized concurrently; unique receipt constraint wins.
            continue
    db.commit()
    return created


def _refund_case_view(case):
    return {'case_id':case.id,'receipt_id':case.receipt_id,'user_id':case.user_id,
            'product_id':case.product_id,'voided_at_ms':case.voided_at_ms,
            'voided_reason':case.voided_reason,'voided_source':case.voided_source,
            'status':case.status,'review_note':case.review_note,
            'reviewed_by':case.reviewed_by,
            'created_at':case.created_at.isoformat() if case.created_at else None}


class RefundCaseDecision(BaseModel):
    status: str = Field(pattern=r'^(reviewed|closed_no_action)$')
    note: str = Field(min_length=8,max_length=1000)




def _refund_financial_review(db, case):
    """DA-only caller, read-only account context; never infer which Lidya was spent."""
    from .models import User
    from .system_data import LidyaLedger
    customer=db.get(User,case.user_id)
    receipt=db.get(PlayPurchaseRecord,case.receipt_id)
    if customer is None or receipt is None or receipt.user_id!=case.user_id or receipt.product_id!=case.product_id:
        raise HTTPException(409,'İade dosyası satın alma ile eşleşmiyor')
    lines=db.scalars(select(LidyaLedger).where(LidyaLedger.user_id==case.user_id)
       .order_by(LidyaLedger.created_at.desc(),LidyaLedger.id.desc()).limit(30)).all()
    ref='play:'+str(receipt.id)
    return {'case_id':case.id,'receipt_id':receipt.id,'public_id':customer.public_id,
            'product_id':case.product_id,
            'package_lidya':int(PRODUCTS[case.product_id]['total']) if case.product_id in PRODUCTS else None,
            'current_balance':int(customer.lidya),'purchase_status':receipt.purchase_status,
            'test_purchase':bool(receipt.test_purchase), 'case_status':case.status,
            'purchase_credit_visible_in_recent_ledger':any(x.operation=='google_play_credit' and x.reference_id==ref for x in lines),
            'ledger':[{'operation':x.operation,'delta':int(x.delta),'balance_after':int(x.balance_after),
                       'created_at':x.created_at.isoformat() if x.created_at else None} for x in lines],
            'history_limited':len(lines)==30,'wallet_changed':False,
            'notice':'Mevcut bakiye, iade edilen paketten kalan Lidya tutarı değildir. Otomatik kesinti yapılmaz.'}

def register_refund_case_auth(current_user):
    from .admin_models import AdminRole, AdminAuditLog
    from .play_refund_models import PlayRefundCase
    from .models import User
    from fastapi import Response

    def require_da(db,user):
        admin=db.get(AdminRole,user.id)
        if not getattr(user,'is_active',False) or admin is None or admin.role != 'DA':
            raise HTTPException(403,'Yalnızca DA için')

    @router.post('/v1/google-play/refund-cases/sync')
    def sync_cases(response: Response,user=Depends(current_user),db=Depends(get_db)):
        require_da(db,user)
        response.headers['Cache-Control']='no-store'
        try:
            voided,truncated=_fetch_voided_purchases()
            hashes={hashlib.sha256(x['purchaseToken'].encode()).hexdigest() for x in voided
                    if isinstance(x,dict) and isinstance(x.get('purchaseToken'),str) and x['purchaseToken']}
            receipts={}
            hashes=list(hashes)
            for i in range(0,len(hashes),500):
                for record in db.scalars(select(PlayPurchaseRecord).where(PlayPurchaseRecord.token_sha256.in_(hashes[i:i+500]))):
                    receipts[record.token_sha256]=record
            rows=_voided_audit_rows(voided,receipts)
            added=_refund_cases_sync(db,rows)
        except Exception:
            db.rollback()
            raise HTTPException(503,'İade kayıtları güvenli biçimde eşitlenemedi') from None
        return {'created':added,'matched':len(rows),'unmatched':len(voided)-len(rows),
                'truncated':truncated,'mode':'review_only','wallet_changed':False}

    @router.get('/v1/google-play/refund-cases')
    def list_cases(response:Response,user=Depends(current_user),db=Depends(get_db)):
        require_da(db,user)
        response.headers['Cache-Control']='no-store'
        cases=db.scalars(select(PlayRefundCase).order_by(PlayRefundCase.id.desc()).limit(100)).all()
        return {'items':[_refund_case_view(x) for x in cases], 'limit':100,
                'wallet_changed':False}

    @router.get('/v1/google-play/refund-cases/{case_id}/financial-review')
    def financial_review(case_id:int,response:Response,user=Depends(current_user),db=Depends(get_db)):
        require_da(db,user)
        response.headers['Cache-Control']='private, no-store'
        response.headers['Vary']='Authorization'
        case=db.get(PlayRefundCase,case_id)
        if case is None:raise HTTPException(404,'İade dosyası bulunamadı')
        return _refund_financial_review(db,case)

    @router.post('/v1/google-play/refund-cases/{case_id}/review')
    def review_case(case_id:int,payload:RefundCaseDecision,response:Response,user=Depends(current_user),db=Depends(get_db)):
        require_da(db,user)
        response.headers['Cache-Control']='no-store'
        case=db.scalar(select(PlayRefundCase).where(PlayRefundCase.id==case_id).with_for_update())
        if not case: raise HTTPException(404,'İade dosyası bulunamadı')
        if case.status!='pending': raise HTTPException(409,'Bu dosya daha önce karara bağlandı')
        case.status=payload.status
        case.review_note=payload.note.strip()
        case.reviewed_by=user.id
        db.add(AdminAuditLog(admin_id=user.id,action='google_play_refund_case_review',
                             target_user_id=case.user_id,target_id=str(case.id),
                             details=json.dumps({'receipt_id':case.receipt_id,'status':payload.status},ensure_ascii=False)))
        db.commit()
        return {'case':_refund_case_view(case),'wallet_changed':False}

def check_google_play_connection():
    """DA-only read-only connectivity check. Never expose OAuth or API error bodies."""
    raw = settings.google_play_service_account_json
    if not raw:
        return {'ok': False, 'code': 'credentials_missing'}
    try:
        info = json.loads(raw)
        if info.get('type') != 'service_account':
            return {'ok': False, 'code': 'credentials_invalid'}
        creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
    except Exception:
        return {'ok': False, 'code': 'credentials_invalid'}
    from urllib.parse import quote
    url = ('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
           + quote(settings.google_play_package_name, safe='') + '/oneTimeProducts')
    try:
        res = AuthorizedSession(creds).get(url, params={'pageSize':1}, timeout=12)
    except Exception:
        return {'ok':False, 'code':'connection_failed'}
    if res.status_code in (401,403):return {'ok':False,'code':'permission_denied'}
    if res.status_code == 404:return {'ok':False,'code':'app_not_found'}
    if res.status_code != 200:return {'ok':False,'code':'upstream_failure'}
    try:
        data=res.json()
        if not isinstance(data,dict) or not isinstance(data.get('oneTimeProducts',[]),list):
            return {'ok':False,'code':'bad_response'}
        return {'ok':True,'code':'connected','products_visible':bool(data.get('oneTimeProducts',[]))}
    except Exception:return {'ok':False,'code':'bad_response'}
