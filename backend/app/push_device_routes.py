import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .push_device_models import PushDevice
from .session import UserSession, hash_token


router = APIRouter(prefix="/v1/push", tags=["push"])


class DevicePayload(BaseModel):
    token: str = Field(min_length=20, max_length=4096)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()



def active_session(db, authorization, user_id):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Oturum gerekli")

    raw = authorization.split(" ", 1)[1].strip()
    if not raw or len(raw) > 512:
        raise HTTPException(401, "Oturum gecersiz")

    hashed = hash_token(raw)
    session = db.get(UserSession, hashed)

    if session is None or session.user_id != user_id:
        raise HTTPException(401, "Oturum bulunamadi")

    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if expires <= datetime.now(timezone.utc):
        raise HTTPException(401, "Oturum suresi dolmus")

    return hashed


def register_auth(current_user):
    @router.post("/device")
    def register_device(
        payload: DevicePayload,
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
        authorization: str | None = Header(default=None),
    ):
        session_hash = active_session(db, authorization, user.id)
        hashed = token_hash(payload.token)

        device = db.get(PushDevice, hashed)

        if device is None:
            device = PushDevice(
                token_hash=hashed,
                user_id=user.id,
                token=payload.token,
                session_hash=session_hash,
            )
            db.add(device)
        else:
            # Same physical token must never belong
            # to two accounts simultaneously.
            device.user_id = user.id
            device.token = payload.token
            device.session_hash = session_hash
            device.updated_at = datetime.now(timezone.utc)

        db.commit()

        return {"registered": True}

    @router.delete("/device")
    def unregister_device(
        payload: DevicePayload,
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
        authorization: str | None = Header(default=None),
    ):
        device = db.get(PushDevice, token_hash(payload.token))
        session_hash = active_session(db, authorization, user.id)

        if (
            device is not None
            and device.user_id == user.id
            and device.session_hash == session_hash
        ):
            db.delete(device)
            db.commit()

        return {"removed": True}

    return router
