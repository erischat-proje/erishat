"""LidyaChat PayTR iFrame adapter. Fail closed; never trust a browser success URL.

The only balance grant path is the verified server-to-server POST callback.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from ipaddress import ip_address
from urllib.parse import parse_qs

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .paytr_models import PayTROrder, PayTRDispute, PayTRAudit
from .purchase_routes import PACKAGES
from .admin_models import AdminRole

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/paytr", tags=["paytr"])
TOKEN_URL = "https://www.paytr.com/odeme/api/get-token"
FRAME_BASE = "https://www.paytr.com/odeme/guvenli/"
MAX_BALANCE = 9_000_000_000_000_000_000

class Checkout(BaseModel):
    package_id: int = Field(ge=1, le=len(PACKAGES))
    phone: str = Field(min_length=10, max_length=20)
    billing_name: str = Field(min_length=2, max_length=60)
    billing_address: str = Field(min_length=5, max_length=400)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        v = v.strip()
        if not re.fullmatch(r"\+?[0-9]{10,15}", v):
            raise ValueError("Telefon numarası 10–15 rakam olmalıdır")
        return v

    @field_validator("billing_name", "billing_address")
    @classmethod
    def validate_text(cls, v):
        v = v.strip()
        if not v or any(ord(c) < 32 for c in v):
            raise ValueError("Geçersiz alan")
        return v


def merchant_config():
    mid = os.getenv("PAYTR_MERCHANT_ID", "").strip()
    key = os.getenv("PAYTR_MERCHANT_KEY", "").strip()
    salt = os.getenv("PAYTR_MERCHANT_SALT", "").strip()
    if os.getenv("PAYTR_ENABLED", "0") != "1":
        raise HTTPException(503, "PayTR etkin değil")
    if not mid or not key or not salt:
        raise HTTPException(503, "PayTR kimlik bilgileri eksik")
    return mid, key.encode("utf-8"), salt


def token_hash(mid, ip, oid, email, amount, basket, no_installment, max_installment, currency, test_mode, key, salt):
    raw = f"{mid}{ip}{oid}{email}{amount}{basket}{no_installment}{max_installment}{currency}{test_mode}{salt}"
    return base64.b64encode(hmac.new(key, raw.encode("utf-8"), hashlib.sha256).digest()).decode("ascii")


def refund_hash(mid, oid, refund_tl, key, salt):
    """PayTR Refund API HMAC. Does not initiate a transfer."""
    raw = f"{mid}{oid}{refund_tl}{salt}"
    return base64.b64encode(hmac.new(key, raw.encode("utf-8"), hashlib.sha256).digest()).decode("ascii")


def refund_quote(amount_kurus):
    """Exact TL decimal string for the provider; never use floats."""
    if type(amount_kurus) is not int or amount_kurus <= 0:
        raise ValueError("İade tutarı pozitif kuruş olmalı")
    return f"{amount_kurus // 100}.{amount_kurus % 100:02d}"


def callback_hash(oid, salt, status, total_amount, key):
    raw = f"{oid}{salt}{status}{total_amount}"
    return base64.b64encode(hmac.new(key, raw.encode("utf-8"), hashlib.sha256).digest()).decode("ascii")


def client_ip(request):
    # Only explicitly trust proxy-supplied IP headers if the deployment proxy is trusted.
    remote = request.client.host if request.client else ""
    try:
        ip_address(remote)
    except ValueError:
        raise HTTPException(422, "Geçerli müşteri IP adresi bulunamadı")
    return remote


def callback_form(raw: bytes):
    if not raw or len(raw) > 8192:
        raise HTTPException(400, "Geçersiz callback boyutu")
    try:
        fields = parse_qs(raw.decode("utf-8"), strict_parsing=True, keep_blank_values=True)
        if any(len(values) != 1 for values in fields.values()):
            raise ValueError("Tekrarlanan alan")
        data = {k: values[0] for k, values in fields.items()}
        oid, state, amount, signature = (data[k] for k in ("merchant_oid", "status", "total_amount", "hash"))
    except (UnicodeDecodeError, ValueError, KeyError):
        raise HTTPException(400, "Geçersiz callback")
    if not re.fullmatch(r"LC[A-F0-9]{32}", oid):
        raise HTTPException(400, "Geçersiz sipariş")
    if state not in ("success", "failed") or not re.fullmatch(r"[0-9]{1,13}", amount):
        raise HTTPException(400, "Geçersiz sonuç")
    if not re.fullmatch(r"[A-Za-z0-9+/]{43}=", signature):
        raise HTTPException(400, "Geçersiz imza biçimi")
    return data


@router.get("/status")
def integration_status():
    # No merchant secrets or credentials are ever returned.
    return {"enabled": os.getenv("PAYTR_ENABLED", "0") == "1" and all(os.getenv(x) for x in ("PAYTR_MERCHANT_ID","PAYTR_MERCHANT_KEY","PAYTR_MERCHANT_SALT")), "provider": "PayTR", "mode": "iframe", "refunds_mode": "case_tracking_only"}


@router.post("/callback", include_in_schema=False)
async def callback_endpoint(request: Request, db: Session = Depends(get_db)):
    _, key, salt = merchant_config()
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/x-www-form-urlencoded":
        raise HTTPException(415, "Beklenmeyen bildirim biçimi")
    data = callback_form(await request.body())
    oid, status, amount = data["merchant_oid"], data["status"], data["total_amount"]
    verified = callback_hash(oid, salt, status, amount, key)
    if not hmac.compare_digest(verified, data["hash"]):
        logger.warning("PayTR imza doğrulaması başarısız")
        raise HTTPException(403, "Geçersiz imza")
    # Unsigned supplemental fields are checked against order but never replace HMAC verification.
    if data.get("payment_type") not in ("card", "eft"):
        raise HTTPException(409, "Ödeme yöntemi eksik veya geçersiz")
    # Required success fields protect against a response from another currency/order.
    if status == "success":
        if data.get("currency") != "TL" or data.get("payment_amount") is None:
            raise HTTPException(409, "Ödeme para birimi veya sipariş bedeli eksik")
        if not re.fullmatch(r"[0-9]{1,13}", data["payment_amount"]):
            raise HTTPException(409, "Geçersiz sipariş tutarı")
    order = db.scalar(select(PayTROrder).where(PayTROrder.oid == oid).with_for_update())
    if order is None:
        raise HTTPException(404, "Sipariş yok")
    # State is persisted at checkout. Never let callback's unsigned test_mode demote a live payment.
    test_flag = data.get("test_mode", "0")
    if test_flag not in ("0", "1", ""):
        raise HTTPException(409, "Geçersiz test durumu")
    if test_flag in ("0", "1") and (test_flag == "1") != bool(order.test_mode):
        # Investigate rather than silently marking a live order as paid or test.
        logger.warning("Beklenmeyen test bildirimi; oid=%s", oid)
        raise HTTPException(409, "Test/gerçek sipariş uyuşmazlığı")
    if order.status in ("paid", "failed", "test"):
        return Response("OK", media_type="text/plain")
    if order.status != "pending":
        raise HTTPException(409, "Beklenmeyen sipariş durumu")
    if status == "success":
        # Installments can make collected total > original order amount.
        if int(data["payment_amount"]) != order.amount_kurus or int(amount) < order.amount_kurus:
            raise HTTPException(409, "Tutar uyuşmazlığı")
        if order.test_mode:
            order.status = "test"
        else:
            owner = db.scalar(select(User).where(User.id == order.user_id).with_for_update())
            if owner is None or not owner.is_active:
                raise HTTPException(409, "Hesap kullanılamıyor; manuel inceleme gerekli")
            current = int(owner.lidya or 0)
            if current + order.lidya_total > MAX_BALANCE:
                raise HTTPException(409, "Bakiye limiti; manuel inceleme gerekli")
            owner.lidya = current + order.lidya_total
            db.info["lidya_operation"] = "paytr_payment"
            db.info["lidya_reference_id"] = order.oid
            db.info["lidya_details"] = json.dumps({"provider":"paytr", "package_id":order.package_id}, ensure_ascii=False)
            order.status = "paid"
    else:
        order.status = "failed"
        order.failure_code = (data.get("failed_reason_code") or "")[:60] or None
    order.finalized_at = datetime.now(timezone.utc)
    db.add(PayTRAudit(id=str(uuid4()),oid=oid,event="callback_"+order.status, note="Callback doğrulandı"))
    db.commit()
    return Response("OK", media_type="text/plain")


def register_auth(current_user):
    @router.post("/checkout")
    def start_checkout(data: Checkout, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
        mid, key, salt = merchant_config()
        email = (user.google_email or "").strip()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise HTTPException(422, "Doğrulanmış e-posta gerekli")
        pack = PACKAGES[data.package_id - 1]
        if int(pack["price_try"]) <= 0 or int(pack["total"]) <= 0:
            raise HTTPException(503, "Paket satışa uygun değil")
        recent = db.scalar(select(func.count()).select_from(PayTROrder).where(
            PayTROrder.user_id==user.id, PayTROrder.created_at >= datetime.now(timezone.utc)-timedelta(minutes=10)))
        if int(recent or 0) >= 8:
            raise HTTPException(429, "Çok fazla ödeme denemesi. Bir süre sonra tekrar deneyin")
        oid = "LC" + secrets.token_hex(16).upper()
        amount = str(int(pack["price_try"]) * 100)
        test_mode = 1 if os.getenv("PAYTR_TEST_MODE", "0") == "1" else 0
        basket = base64.b64encode(json.dumps([[f"{pack['total']} Lidya Paketi", f"{int(pack['price_try']):.2f}", 1]], ensure_ascii=False).encode()).decode()
        ip = client_ip(request)
        params = {
            "merchant_id": mid, "user_ip": ip, "merchant_oid": oid, "email": email,
            "payment_amount": amount, "user_basket": basket, "no_installment": "1",
            "max_installment": "0", "currency": "TL", "test_mode": str(test_mode),
            "debug_on": "1" if test_mode else "0", "timeout_limit": "30", "lang": "tr",
            "user_name": data.billing_name, "user_address": data.billing_address,
            "user_phone": data.phone, "merchant_ok_url": "https://www.lidyachat.com/",
            "merchant_fail_url": "https://www.lidyachat.com/",
        }
        params["paytr_token"] = token_hash(mid,ip,oid,email,amount,basket,"1","0","TL",str(test_mode),key,salt)
        db.add(PayTROrder(oid=oid,user_id=user.id,package_id=data.package_id,
                          amount_kurus=int(amount),lidya_total=int(pack["total"]),status="pending",test_mode=test_mode))
        db.commit()
        try:
            r = requests.post(TOKEN_URL, data=params, timeout=(5, 15))
            r.raise_for_status()
            result = r.json()
        except (requests.RequestException, ValueError):
            logger.exception("PayTR token hizmeti erişim hatası")
            raise HTTPException(502, "Ödeme ekranı şu anda oluşturulamıyor")
        if result.get("status") != "success" or not isinstance(result.get("token"), str):
            logger.warning("PayTR token isteği başarısız; oid=%s", oid)
            # Explicit rejection is only a checkout error, not a payment callback.
            # Keep the order pending until reconciliation, avoiding unsafe assumptions.
            raise HTTPException(502, "Ödeme ekranı oluşturulamadı")
        token = result["token"]
        if not re.fullmatch(r"[A-Za-z0-9_-]{10,512}", token):
            raise HTTPException(502, "Geçersiz ödeme tokeni")
        return {"oid": oid, "iframe_url": FRAME_BASE + token, "status": "pending"}

    @router.get("/orders/{oid}")
    def my_order(oid: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
        order = db.get(PayTROrder, oid)
        if order is None or order.user_id != user.id:
            raise HTTPException(404, "Sipariş bulunamadı")
        return {"oid":order.oid,"status":order.status,"package_id":order.package_id,
                "amount_kurus":order.amount_kurus,"lidya_total":order.lidya_total,
                "test_mode":bool(order.test_mode)}

    @router.get("/orders")
    def my_orders(db: Session=Depends(get_db), user: User=Depends(current_user)):
        rows = db.scalars(select(PayTROrder).where(PayTROrder.user_id==user.id)
                          .order_by(PayTROrder.created_at.desc()).limit(30)).all()
        return [{"oid":r.oid,"status":r.status,"package_id":r.package_id,
                 "amount_kurus":r.amount_kurus,"lidya_total":r.lidya_total,
                 "test_mode":bool(r.test_mode)} for r in rows]

    @router.get("/admin/orders")
    def admin_orders(status: str = "pending", limit: int = 50,
                     db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        if status not in {"pending", "paid", "failed", "test", "all"}:
            raise HTTPException(422, "Geçersiz sipariş filtresi")
        if not 1 <= limit <= 100:
            raise HTTPException(422, "Limit 1–100 olmalı")
        q = select(PayTROrder).order_by(PayTROrder.created_at.desc()).limit(limit)
        if status != "all":
            q = q.where(PayTROrder.status == status)
        rows = db.scalars(q).all()
        return [{"oid":row.oid,"status":row.status,"user_id":row.user_id,
                 "amount_kurus":row.amount_kurus,"lidya_total":row.lidya_total,
                 "test_mode":bool(row.test_mode),"created_at":row.created_at} for row in rows]

    @router.get("/admin/orders/{oid}/audit")
    def admin_order_audit(oid: str, db: Session = Depends(get_db),
                          user: User = Depends(current_user)):
        require_da(db, user)
        if not db.get(PayTROrder, oid):
            raise HTTPException(404, "Sipariş yok")
        rows = db.scalars(select(PayTRAudit).where(PayTRAudit.oid == oid)
                          .order_by(PayTRAudit.created_at.asc()).limit(200)).all()
        return [{"event":r.event,"note":r.note,"created_at":r.created_at} for r in rows]

    class CasePayload(BaseModel):
        kind: str = Field(pattern="^(refund|chargeback)$")
        amount_kurus: int = Field(gt=0)
        note: str = Field(min_length=8,max_length=500)

    class CaseResolution(BaseModel):
        state: str = Field(pattern="^(review|confirmed|rejected)$")
        provider_reference: str = Field(default="",max_length=100)
        note: str = Field(min_length=8,max_length=500)

    def require_da(db, user):
        role = db.get(AdminRole, user.id)
        if not role or role.role != "DA":
            raise HTTPException(403, "Yalnızca DA mali inceleme yetkisi")

    @router.post("/admin/disputes/{oid}")
    def create_case(oid: str, data: CasePayload, db: Session=Depends(get_db),user: User=Depends(current_user)):
        require_da(db,user)
        order=db.scalar(select(PayTROrder).where(PayTROrder.oid==oid).with_for_update())
        if not order or order.status not in ("paid", "refunded", "chargeback") or order.test_mode:
            raise HTTPException(409, "Yalnızca doğrulanmış gerçek ödeme incelenebilir")
        if data.amount_kurus > order.amount_kurus:
            raise HTTPException(422, "İnceleme tutarı siparişi aşamaz")
        case=PayTRDispute(id=str(uuid4()),oid=oid,kind=data.kind,amount_kurus=data.amount_kurus,
                          note=data.note,operator_id=user.id,state="review")
        db.add(case);db.add(PayTRAudit(id=str(uuid4()),oid=oid,event="case_created",note=data.kind))
        db.commit()
        return {"id":case.id,"state":case.state,"note":"Kayıt açıldı; PayTR üzerinden para iadesi yapılmadı"}

    @router.get("/admin/disputes/{oid}")
    def list_cases(oid: str,db: Session=Depends(get_db),user: User=Depends(current_user)):
        require_da(db,user)
        rows=db.scalars(select(PayTRDispute).where(PayTRDispute.oid==oid).order_by(PayTRDispute.created_at.desc())).all()
        return [{"id":r.id,"kind":r.kind,"state":r.state,"amount_kurus":r.amount_kurus,
                 "provider_reference":r.provider_reference,"note":r.note} for r in rows]

    @router.post("/admin/disputes/{case_id}/resolve")
    def resolve_case(case_id:str,data:CaseResolution,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user)
        row=db.scalar(select(PayTRDispute).where(PayTRDispute.id==case_id).with_for_update())
        if not row or row.state != "review":
            raise HTTPException(409,"İnceleme bulunamadı veya sonuçlandırıldı")
        if data.state == "confirmed" and not re.fullmatch(r"[A-Za-z0-9._:/-]{6,100}", data.provider_reference):
            raise HTTPException(422, "PayTR/banka işlem referansı gerekli")
        row.state=data.state;row.note=data.note;row.provider_reference=data.provider_reference or None
        row.updated_at=datetime.now(timezone.utc)
        db.add(PayTRAudit(id=str(uuid4()),oid=row.oid,event="case_"+data.state,note=row.kind))
        # A refund/chargeback may involve spent currency: do NOT silently subtract or go negative.
        # Operator must reconcile the provider transaction and currency separately.
        db.commit()
        return {"id":row.id,"state":row.state,"warning":"Gerçek iade ve bakiye mahsuplaşması ayrıca doğrulanmalıdır"}
    return router
