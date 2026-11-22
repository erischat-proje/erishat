import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .push_device_models import PushDevice


router = APIRouter(prefix="/v1/push", tags=["push"])


class DevicePayload(BaseModel):
    token: str = Field(min_length=20, max_length=4096)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def register_auth(current_user):
    @router.post("/device")
    def register_device(
        payload: DevicePayload,
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
    ):
        hashed = token_hash(payload.token)

        device = db.get(PushDevice, hashed)

        if device is None:
            device = PushDevice(
                token_hash=hashed,
                user_id=user.id,
                token=payload.token,
            )
            db.add(device)
        else:
            # Same physical token must never belong
            # to two accounts simultaneously.
            device.user_id = user.id
            device.token = payload.token
            device.updated_at = datetime.now(timezone.utc)

        db.commit()

        return {"registered": True}

    @router.delete("/device")
    def unregister_device(
        payload: DevicePayload,
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
    ):
        device = db.get(PushDevice, token_hash(payload.token))

        if device is not None and device.user_id == user.id:
            db.delete(device)
            db.commit()

        return {"removed": True}

    return router
