"""Opt-in, isolated Google Play review credentials; no fake Google OAuth identities."""
import hmac
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .auth import create_or_login_verified_identity
from .config import settings
from .db import get_db
from .schemas import SessionOut
from .security_limits import enforce_limit
from .session import create_session

router = APIRouter(prefix='/v1/auth/reviewer', tags=['reviewer-access'])
log = logging.getLogger('lidyachat.reviewer')

class ReviewerCredentials(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=20, max_length=256)


def enabled() -> bool:
    return bool(settings.play_reviewer_enabled and
                settings.play_reviewer_username.strip() and
                len(settings.play_reviewer_password) >= 24)


@router.get('/config')
def reviewer_config():
    return {'enabled': enabled()}


@router.post('/login', response_model=SessionOut)
def reviewer_login(payload: ReviewerCredentials, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else 'unknown'
    # Shared DB counters: applies across workers; never reveal which credential failed.
    enforce_limit('ip:' + ip, 'play_reviewer_login', 10, 600)
    enforce_limit('review_account', 'play_reviewer_global', 120, 600)
    if not enabled():
        raise HTTPException(status_code=404, detail='İnceleme girişi kullanılamıyor.')
    expected_username = settings.play_reviewer_username.strip()
    if not (hmac.compare_digest(payload.username.encode(), expected_username.encode()) and
            hmac.compare_digest(payload.password.encode(), settings.play_reviewer_password.encode())):
        log.warning('reviewer_login_rejected')
        raise HTTPException(status_code=401, detail='Giriş bilgileri hatalı.')

    user = create_or_login_verified_identity(
        db, 'reviewer', expected_username, ip=ip,
        device_info=request.headers.get('user-agent', '')[:512],
    )
    if not user.is_active:
        raise HTTPException(status_code=403, detail='İnceleme hesabı devre dışı.')
    log.info('reviewer_login_accepted user_id=%s', user.id)
    return SessionOut(access_token=create_session(db, user), user=user)
