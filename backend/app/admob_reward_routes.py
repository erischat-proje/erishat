"""LidyaChat AdMob V2: verified, idempotent rewarded ads. Disabled by default.

Only an authenticated user can create an opaque single-use claim. Google then
sends that claim via signed SSV custom_data. Client events NEVER credit wallets.
"""
from __future__ import annotations

import base64
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from threading import Lock
from urllib.parse import parse_qsl

import requests
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column
from pydantic import BaseModel

from .db import Base, get_db
from .models import User

router = APIRouter(prefix="/v1/admob", tags=["admob"])
AD_UNIT = "ca-app-pub-9842221080536523/8782909853"
KEYS_URL = "https://gstatic.com/admob/reward/verifier-keys.json"
REWARD_AMOUNT = 5
DAILY_LIMIT = 5
CLAIM_TTL = timedelta(minutes=20)
KEY_CACHE_SECONDS = 3600
_cache_lock = Lock()
_cached_keys = ({}, 0.0)


def _utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def enabled():
    return os.getenv("LIDYACHAT_ADMOB_REWARDS_ENABLED", "false").lower() == "true"


def pilot_allowed(user_id):
    # Fail closed: enabling rewards without an allowlist pays nobody.
    permitted = {
        item.strip()
        for item in os.getenv(
            "LIDYACHAT_ADMOB_PILOT_USER_IDS", ""
        ).split(",")
        if item.strip()
    }
    return enabled() and str(user_id) in permitted


def preview_enabled():
    """Preview claims are disabled unless explicitly authorized."""
    return (
        not enabled()
        and os.getenv("LIDYACHAT_ADMOB_SSV_VERIFY_ONLY", "false").lower() == "true"
        and os.getenv("LIDYACHAT_ADMOB_PREVIEW_CLAIMS_ENABLED", "false").lower() == "true"
    )


def preview_allowed(user_id):
    if not preview_enabled():
        return False
    permitted = {
        item.strip()
        for item in os.getenv("LIDYACHAT_ADMOB_PREVIEW_USER_IDS", "").split(",")
        if item.strip()
    }
    return bool(permitted) and str(user_id) in permitted


class AdmobClaim(Base):
    __tablename__ = "admob_reward_claims_v2"
    nonce_digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transaction_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)


class AdmobReward(Base):
    __tablename__ = "admob_rewards_v2"
    transaction_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    rewarded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    __table_args__ = (UniqueConstraint("transaction_id", "user_id", name="uq_admob_tx_user_v2"),)


class ClaimOut(BaseModel):
    custom_data: str
    expires_at: datetime
    max_daily: int = DAILY_LIMIT
    reward: int = REWARD_AMOUNT


def _keyset():
    global _cached_keys
    with _cache_lock:
        if _cached_keys[0] and time.monotonic() < _cached_keys[1]:
            return _cached_keys[0]
        try:
            response = requests.get(KEYS_URL, timeout=5)
            response.raise_for_status()
            payload = response.json()
            keyset = {}
            for item in payload["keys"]:
                key = serialization.load_pem_public_key(item["pem"].encode("ascii"))
                if isinstance(key, ec.EllipticCurvePublicKey):
                    keyset[str(item["keyId"])] = key
            if not keyset:
                raise ValueError("No valid public keys")
            _cached_keys = (keyset, time.monotonic() + KEY_CACHE_SECONDS)
            return keyset
        except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
            raise HTTPException(503, "SSV anahtar servisi gecici olarak kullanilamiyor") from exc


def verified_fields(raw_query: bytes, keys=None):
    """Strictly preserve Google's signed parameter order and raw encoding."""
    if not raw_query or len(raw_query) > 4096:
        raise HTTPException(400, "Gecersiz SSV istegi")
    try:
        query = raw_query.decode("ascii")
        parts = query.split("&")
        if len(parts) < 7 or not parts[-2].startswith("signature=") or not parts[-1].startswith("key_id="):
            raise ValueError("invalid SSV signature location")
        signed = "&".join(parts[:-2])
        pairs = parse_qsl(query, keep_blank_values=True, strict_parsing=True)
        fields = dict(pairs)
        if len(fields) != len(pairs):
            raise ValueError("duplicate fields")
        signature = fields["signature"]
        key_id = fields["key_id"]
        if not key_id.isdecimal():
            raise ValueError("bad key id")
        sig_bytes = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        key = (keys if keys is not None else _keyset()).get(key_id)
        if key is None:
            raise ValueError("unknown key id")
        key.verify(sig_bytes, signed.encode("ascii"), ec.ECDSA(hashes.SHA256()))
        return fields
    except (InvalidSignature, ValueError, KeyError, UnicodeError, TypeError) as exc:
        raise HTTPException(403, "SSV imza dogrulamasi basarisiz") from exc


def register_auth(current_user):
    @router.get("/status")
    def reward_status(
        user: User = Depends(current_user),
        db: Session = Depends(get_db),
    ):
        live = pilot_allowed(user.id)
        preview = preview_allowed(user.id)

        now = datetime.now(timezone.utc)
        day_start = now.replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        daily_count = db.execute(
            select(func.count()).select_from(AdmobReward).where(
                AdmobReward.user_id == user.id,
                AdmobReward.rewarded_at >= day_start,
                AdmobReward.rewarded_at < day_start + timedelta(days=1),
            )
        ).scalar_one()

        daily_count = min(int(daily_count), DAILY_LIMIT)
        daily_remaining = max(0, DAILY_LIMIT - daily_count)

        return {
            "mode": (
                "live" if live else
                "preview" if preview else
                "disabled"
            ),
            "preview_allowed": preview,
            "rewards_enabled": live,
            "reward_amount": REWARD_AMOUNT,
            "daily_limit": DAILY_LIMIT,
            "daily_used": daily_count,
            "daily_remaining": daily_remaining,
            "daily_reward_remaining": daily_remaining * REWARD_AMOUNT,
            "message": (
                "Reklam odulleri aktif" if live else
                "Test onizlemesi kullanilabilir" if preview else
                "Reklam odulleri henuz aktif degil"
            )
        }

    @router.post("/claim", response_model=ClaimOut)
    def create_claim(db: Session = Depends(get_db), user: User = Depends(current_user)):
        if not pilot_allowed(user.id) and not preview_allowed(user.id):
            raise HTTPException(503, "Reklam odulleri henuz acilmadi")
        now = datetime.now(timezone.utc)

        if enabled():
            day_start = now.replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            daily_count = db.execute(
                select(func.count()).select_from(AdmobReward).where(
                    AdmobReward.user_id == user.id,
                    AdmobReward.rewarded_at >= day_start,
                    AdmobReward.rewarded_at < day_start + timedelta(days=1),
                )
            ).scalar_one()

            if daily_count >= DAILY_LIMIT:
                raise HTTPException(
                    409, "Gunluk 5 reklam odulu siniri doldu"
                )

        nonce = secrets.token_urlsafe(32)
        db.add(AdmobClaim(nonce_digest=sha256(nonce.encode()).hexdigest(), user_id=user.id,
                           created_at=now, expires_at=now + CLAIM_TTL))
        db.commit()
        return ClaimOut(custom_data=nonce, expires_at=now + CLAIM_TTL)

    return router


@router.get("/ssv", include_in_schema=False)
def ssv_callback(request: Request, db: Session = Depends(get_db)):
    rewards_active = enabled()
    verify_only = os.getenv(
        "LIDYACHAT_ADMOB_SSV_VERIFY_ONLY", "false"
    ).lower() == "true"

    if not rewards_active and not verify_only:
        raise HTTPException(503, "AdMob SSV pasif")

    fields = verified_fields(request.scope.get("query_string", b""))

    try:
        tx = fields["transaction_id"]
        nonce = fields.get("custom_data", "")
        stamp = int(fields["timestamp"])
        if not (8 <= len(tx) <= 128 and all(ch in "0123456789abcdefABCDEF" for ch in tx)):
            raise ValueError("transaction")
        # Google URL test uses a signed sample ad unit and transaction ID.
        # Accept it only in verification-only mode; never award Lidya.
        google_url_test = (
            verify_only and not rewards_active
            and fields["ad_unit"] == "1234567890"
            and tx == "123456789"
        )
        if not google_url_test and fields["ad_unit"] not in (AD_UNIT.split("/")[-1], AD_UNIT):
            raise ValueError("ad unit")
        if fields["reward_item"] != "Lidya" or int(fields["reward_amount"]) != REWARD_AMOUNT:
            raise ValueError("reward")
        event_at = datetime.fromtimestamp(stamp / 1000, tz=timezone.utc)
        now = datetime.now(timezone.utc)
        if abs((now - event_at).total_seconds()) > 1200:
            raise ValueError("timestamp")
        if rewards_active and not (24 <= len(nonce) <= 128):
            raise ValueError("nonce")
        if not rewards_active and nonce and len(nonce) > 128:
            raise ValueError("nonce")
    except (KeyError, ValueError, OverflowError, OSError) as exc:
        raise HTTPException(400, "SSV alanlari gecersiz") from exc

    # Google dashboard URL test has no user claim.
    # Keep its signed verification compatible with preview mode.
    if not rewards_active:
        if not preview_enabled() or google_url_test:
            return {"ok": True, "verification_only": True}

        if not nonce or not (24 <= len(nonce) <= 128):
            raise HTTPException(400, "Preview odul kodu gerekli")

        claim = db.get(
            AdmobClaim, sha256(nonce.encode()).hexdigest()
        )
        if claim is None:
            raise HTTPException(404, "Preview odul kodu bulunamadi")

        if not preview_allowed(claim.user_id):
            raise HTTPException(403, "Preview kullanicisi yetkisiz")

        user = db.execute(
            select(User).where(User.id == claim.user_id).with_for_update()
        ).scalar_one_or_none()

        if user is None or not user.is_active:
            raise HTTPException(403, "Kullanici uygun degil")

        db.refresh(claim)

        # Prevent a Google transaction from being assigned to a second claim.
        existing = db.execute(
            select(AdmobClaim).where(AdmobClaim.transaction_id == tx)
        ).scalar_one_or_none()
        if existing is not None and existing.nonce_digest != claim.nonce_digest:
            raise HTTPException(409, "Google islemi zaten kullanilmis")

        if claim.consumed_at is not None:
            if claim.transaction_id == tx:
                return {
                    "ok": True,
                    "verification_only": True,
                    "duplicate": True
                }
            raise HTTPException(409, "Preview kodu kullanilmis")

        if (_utc(claim.expires_at) < now
                or event_at < _utc(claim.created_at) - timedelta(seconds=30)):
            raise HTTPException(409, "Preview kodunun suresi dolmus")

        if "user_id" in fields and fields["user_id"] != user.id:
            raise HTTPException(403, "Kullanici uyusmuyor")

        claim.consumed_at = now
        claim.transaction_id = tx
        db.commit()

        # CRITICAL: No AdmobReward entry and no Lidya balance change.
        return {
            "ok": True,
            "verification_only": True,
            "preview_claim_consumed": True
        }

    # Database transaction and row lock serialize claims of the same user.
    claim = db.get(AdmobClaim, sha256(nonce.encode()).hexdigest())
    if claim is None:
        raise HTTPException(404, "Gecerli odul istegi bulunamadi")
    user = db.execute(select(User).where(User.id == claim.user_id).with_for_update()).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(403, "Kullanici uygun degil")
    if not pilot_allowed(user.id):
        raise HTTPException(403, "Gercek reklam odulu icin yetki yok")
    # Re-read claim once user lock has been obtained to observe concurrent claims.
    db.refresh(claim)
    previous = db.get(AdmobReward, tx)
    if previous is not None:
        if claim.transaction_id == tx and previous.user_id == user.id:
            return {"ok": True, "duplicate": True}
        raise HTTPException(409, "Islem daha once kullanilmis")
    if claim.consumed_at is not None or _utc(claim.expires_at) < now or event_at < _utc(claim.created_at) - timedelta(seconds=30):
        raise HTTPException(409, "Odul istegi kullanilmis veya suresi dolmus")
    if "user_id" in fields and fields["user_id"] != user.id:
        raise HTTPException(403, "Kullanici uyusmuyor")
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    count = db.execute(select(func.count()).select_from(AdmobReward).where(
        AdmobReward.user_id == user.id, AdmobReward.rewarded_at >= day_start,
        AdmobReward.rewarded_at < day_start + timedelta(days=1))).scalar_one()
    if count >= DAILY_LIMIT:
        raise HTTPException(409, "Gunluk odul siniri doldu")
    claim.consumed_at = now
    claim.transaction_id = tx
    db.add(AdmobReward(transaction_id=tx, user_id=user.id, amount=REWARD_AMOUNT, rewarded_at=now))
    db.info["lidya_operation"] = "admob_verified_reward"
    db.info["lidya_reference_id"] = tx
    db.info["lidya_details"] = "AdMob SSV verified +5 Lidya"
    user.lidya = int(user.lidya) + REWARD_AMOUNT
    db.commit()
    return {"ok": True, "reward": REWARD_AMOUNT}
