"""PayTR iFrame integration, disabled until merchant credentials are configured."""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timezone
from ipaddress import ip_address

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .paytr_models import PayTROrder
from .purchase_routes import PACKAGES

router = APIRouter(prefix='/v1/paytr', tags=['paytr'])
_auth = None

class Checkout(BaseModel):
    package_id: int = Field(ge=1, le=len(PACKAGES))


def register_auth(dependency):
    return install_checkout_auth(dependency)


def merchant_config():
    mid = os.getenv('PAYTR_MERCHANT_ID', '').strip()
    key = os.getenv('PAYTR_MERCHANT_KEY', '').strip()
    salt = os.getenv('PAYTR_MERCHANT_SALT', '').strip()
    enabled = os.getenv('PAYTR_ENABLED', '0') == '1'
    if not (enabled and mid and key and salt):
        raise HTTPException(503, 'PayTR henüz etkin değil; üye işyeri bilgileri bekleniyor.')
    return mid, key.encode(), salt


def token_hash(mid, ip, oid, email, amount, basket, no_installment, max_installment, currency, test_mode, key, salt):
    source = f'{mid}{ip}{oid}{email}{amount}{basket}{no_installment}{max_installment}{currency}{test_mode}{salt}'
    return base64.b64encode(hmac.new(key, source.encode(), hashlib.sha256).digest()).decode()


def callback_hash(oid, salt, status, total_amount, key):
    source = f'{oid}{salt}{status}{total_amount}'
    return base64.b64encode(hmac.new(key, source.encode(), hashlib.sha256).digest()).decode()


def client_ip(request):
    # Do not trust X-Forwarded-For directly: configure ASGI proxy trust upstream.
    remote = request.client.host if request.client else ''
    try:
        ip_address(remote)
    except ValueError:
        raise HTTPException(422, 'Müşteri IP adresi doğrulanamadı.')
    return remote

@router.get('/status')
def status():
    return {'configured': all(os.getenv(v) for v in ('PAYTR_MERCHANT_ID','PAYTR_MERCHANT_KEY','PAYTR_MERCHANT_SALT')),
            'enabled': os.getenv('PAYTR_ENABLED', '0') == '1'}

async def callback(request: Request, db: Session):
    _, key, salt = merchant_config()
    raw = await request.body()
    if len(raw) > 8192:
        raise HTTPException(413, 'Bildirim çok büyük')
    from urllib.parse import parse_qs
    try:
        fields = parse_qs(raw.decode('utf-8'), strict_parsing=True)
        if any(len(v) != 1 for v in fields.values()):
            raise ValueError('duplicate fields')
        data = {k: v[0] for k,v in fields.items()}
        oid, status, amount, provided = [data[k] for k in ('merchant_oid','status','total_amount','hash')]
    except (ValueError, UnicodeDecodeError, KeyError):
        raise HTTPException(400, 'Geçersiz bildirim')
    if not re.fullmatch(r'[A-Za-z0-9]{1,64}',oid) or status not in ('success','failed') or not re.fullmatch(r'\d{1,12}',amount):
        raise HTTPException(400, 'Geçersiz bildirim alanları')
    expected = callback_hash(oid, salt, status, amount, key)
    if not hmac.compare_digest(expected, provided):
        raise HTTPException(403, 'Bildirim imzası geçersiz')
    order = db.scalar(select(PayTROrder).where(PayTROrder.oid == oid).with_for_update())
    if order is None:
        raise HTTPException(404, 'Sipariş bulunamadı')
    if order.status in ('paid', 'failed', 'test'):
        return Response('OK', media_type='text/plain')
    if os.getenv('PAYTR_TEST_MODE', '0') == '1' or data.get('test_mode') == '1':
        # Never grant production balances for test transactions.
        order.status = 'test'
    elif status == 'success':
        # PayTR collected total can be larger due to installment. Never accept smaller.
        if int(amount) < order.amount_kurus:
            raise HTTPException(409, 'Tahsil edilen tutar siparişten düşük')
        locked_user = db.scalar(select(User).where(User.id == order.user_id).with_for_update())
        if locked_user is None:
            raise HTTPException(409, 'Hesap bulunamadı')
        locked_user.lidya = int(locked_user.lidya or 0) + order.lidya_total
        db.info['lidya_operation'] = 'paytr_payment'
        db.info['lidya_reference_id'] = order.oid
        order.status = 'paid'
    else:
        order.status = 'failed'
    order.finalized_at = datetime.now(timezone.utc)
    db.commit()
    return Response('OK', media_type='text/plain')

@router.post('/callback', include_in_schema=False)
async def callback_endpoint(request: Request, db: Session = Depends(get_db)):
    return await callback(request, db)

# Inject the app's actual user dependency at router registration time.
def install_checkout_auth(current_user):
    @router.post('/checkout')
    def start(data: Checkout, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
        mid, key, salt = merchant_config()
        if not (user.google_email and '@' in user.google_email):
            raise HTTPException(422, 'Ödeme için hesapta doğrulanmış e-posta gerekli')
        pack = PACKAGES[data.package_id-1]
        oid = 'LC' + secrets.token_hex(16).upper()
        amount = str(pack['price_try'] * 100)
        basket = base64.b64encode(json.dumps([[f"{pack['total']} Lidya Paketi", f"{pack['price_try']:.2f}", 1]],ensure_ascii=False).encode()).decode()
        ip = client_ip(request)
        test_mode = '1' if os.getenv('PAYTR_TEST_MODE', '0') == '1' else '0'
        params = {'merchant_id':mid,'user_ip':ip,'merchant_oid':oid,'email':user.google_email,
                  'payment_amount':amount,'user_basket':basket,'no_installment':'1',
                  'max_installment':'0','currency':'TL','test_mode':test_mode,
                  'debug_on':'0','timeout_limit':'30','lang':'tr',
                  'user_name':(f'{user.first_name or ""} {user.last_name or ""}').strip() or user.nickname,
                  'user_address':'Dijital teslimat','user_phone':'',
                  'merchant_ok_url':'https://www.lidyachat.com/','merchant_fail_url':'https://www.lidyachat.com/'}
        params['paytr_token'] = token_hash(mid,ip,oid,user.google_email,amount,basket,'1','0','TL',test_mode,key,salt)
        db.add(PayTROrder(oid=oid, user_id=user.id, package_id=data.package_id,
                          amount_kurus=int(amount), lidya_total=pack['total'], status='pending'))
        db.commit()
        try:
            res=requests.post('https://www.paytr.com/odeme/api/get-token', data=params, timeout=15)
            res.raise_for_status()
            result=res.json()
        except (requests.RequestException, ValueError):
            raise HTTPException(502,'PayTR bağlantısı başarısız')
        if result.get('status') != 'success' or not result.get('token'):
            raise HTTPException(502, 'PayTR ödeme ekranı oluşturulamadı')
        token=result['token']
        if not isinstance(token,str) or not re.fullmatch('[A-Za-z0-9]+',token):
            raise HTTPException(502,'Geçersiz PayTR token')
        return {'oid':oid,'iframe_url':'https://www.paytr.com/odeme/guvenli/'+token, 'status':'pending'}
    return router
