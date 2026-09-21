from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import uuid

from sqlalchemy.orm import Session

from .config import settings
from .models import AuthOTP


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def create_otp(
    db: Session,
    provider: str,
    identifier: str,
    purpose: str,
) -> tuple[AuthOTP, str]:
    code = "".join(
        str(secrets.randbelow(10))
        for _ in range(settings.otp_length)
    )

    now = datetime.now(timezone.utc)

    latest = (
        db.query(AuthOTP)
        .filter(
            AuthOTP.provider == provider,
            AuthOTP.identifier == identifier,
            AuthOTP.purpose == purpose,
        )
        .order_by(AuthOTP.created_at.desc())
        .first()
    )

    if latest is not None:
        cooldown_until = latest.created_at + timedelta(
            seconds=settings.otp_resend_cooldown_seconds
        )
        if now < cooldown_until:
            raise ValueError("OTP resend cooldown active")

        if latest.consumed_at is None:
            latest.consumed_at = now

    otp = AuthOTP(
        id=uuid.uuid4().hex,
        provider=provider,
        identifier=identifier,
        purpose=purpose,
        code_hash=_hash_code(code),
        expires_at=now + timedelta(seconds=settings.otp_expiry_seconds),
    )

    db.add(otp)
    db.commit()
    db.refresh(otp)

    return otp, code


def verify_otp(
    db: Session,
    otp: AuthOTP,
    code: str,
) -> bool:
    now = datetime.now(timezone.utc)

    if otp.consumed_at is not None:
        return False

    if now >= otp.expires_at:
        return False

    if otp.attempts >= settings.otp_max_attempts:
        return False

    otp.attempts += 1

    valid = hmac.compare_digest(
        otp.code_hash,
        _hash_code(code),
    )

    if valid:
        otp.consumed_at = now

    db.commit()
    return valid

# Railway deployment trigger
