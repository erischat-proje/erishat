"""Default-off, one-use WooCommerce order/account binding. Never credits a wallet.

Customer initiates a short-lived pairing ticket while authenticated to LidyaChat.
The WooCommerce SERVER (not the browser) redeems it with a private API secret.
No payment status is inferred from a pairing and no customer-supplied username
is accepted as an account identifier.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Callable

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column

from .config import settings
from .db import Base, get_db
from .models import User

router = APIRouter(prefix='/v1/woocommerce', tags=['woocommerce-account-pairing'])


class WooCommerceAccountLink(Base):
    __tablename__ = 'woocommerce_account_links'
    token_sha256: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    order_id: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PairingRedeem(BaseModel):
    ticket: str = Field(min_length=32, max_length=256)
    order_id: int = Field(gt=0, le=2147483647)


def enabled() -> bool:
    return bool(settings.woocommerce_linking_enabled and len(settings.woocommerce_service_secret) >= 32)


def _require_enabled() -> None:
    if not enabled():
        raise HTTPException(503, 'WooCommerce hesap baglantisi kapali')


def _now() -> datetime:
    return datetime.now(timezone.utc)


def issue(db: Session, user: User) -> dict:
    _require_enabled()
    if not user.is_active:
        raise HTTPException(403, 'Aktif hesap gerekli')
    now = _now()
    token = secrets.token_urlsafe(32)
    db.add(WooCommerceAccountLink(
        token_sha256=hashlib.sha256(token.encode()).hexdigest(),
        user_id=user.id,
        expires_at=now + timedelta(minutes=5),
    ))
    db.commit()
    return {'ticket': token, 'expires_in_seconds': 300, 'note': 'Bu kod odeme onayi degildir.'}


def redeem(db: Session, payload: PairingRedeem, service_secret: str | None) -> dict:
    _require_enabled()
    if not service_secret or not hmac.compare_digest(service_secret, settings.woocommerce_service_secret):
        raise HTTPException(401, 'Yetkisiz servis')
    digest = hashlib.sha256(payload.ticket.encode()).hexdigest()
    now = _now()
    try:
        link = db.scalar(select(WooCommerceAccountLink)
            .where(WooCommerceAccountLink.token_sha256 == digest).with_for_update())
        if not link or link.used_at is not None or link.order_id is not None:
            raise HTTPException(409, 'Kod gecersiz veya kullanilmis')
        exp = link.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= now:
            raise HTTPException(409, 'Kodun suresi dolmus')
        user = db.scalar(select(User).where(User.id == link.user_id).with_for_update())
        if not user or not user.is_active:
            raise HTTPException(409, 'Kullanici aktif degil')
        already = db.scalar(select(WooCommerceAccountLink.token_sha256)
            .where(WooCommerceAccountLink.order_id == payload.order_id))
        if already:
            raise HTTPException(409, 'Siparis daha once eslestirilmis')
        link.used_at = now
        link.order_id = payload.order_id
        db.commit()
        return {'linked': True, 'order_id': link.order_id, 'user_id': user.id, 'credited': False}
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Siparis eslestirme cakismasi')
    except Exception:
        db.rollback()
        raise


def register_auth(current_user: Callable):
    @router.post('/pairing-ticket')
    def pairing_ticket(db: Session = Depends(get_db), user: User = Depends(current_user)):
        return issue(db, user)

    @router.post('/pairing-redeem')
    def pairing_redeem(payload: PairingRedeem,
                       x_lidyachat_woocommerce_secret: str | None = Header(default=None),
                       db: Session = Depends(get_db)):
        return redeem(db, payload, x_lidyachat_woocommerce_secret)

    return router
