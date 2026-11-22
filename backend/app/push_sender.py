"""LidyaChat Firebase push sender.

Fails closed: no credentials, no active session or disabled
notifications means no push. Never logs device tokens or secrets.
"""
import json
import logging
import os
from datetime import datetime, timezone

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from sqlalchemy import select

from .models import User
from .notification_policy import allowed
from .push_device_models import PushDevice
from .session import UserSession

logger = logging.getLogger("lidyachat.push")

FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"


def eligible_devices(db, user_id, conversation_id):
    if not allowed(db, user_id, conversation_id):
        return []

    now = datetime.now(timezone.utc)

    rows = db.execute(
        select(PushDevice, UserSession)
        .join(
            UserSession,
            UserSession.token_hash == PushDevice.session_hash,
        )
        .where(
            PushDevice.user_id == user_id,
            UserSession.user_id == user_id,
        )
        .limit(20)
    ).all()

    tokens = []
    for device, session in rows:
        expiry = session.expires_at
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry > now:
            tokens.append(device.token)

    return tokens


def send_dm_push(db, user_id, conversation_id):
    """Return successful sends. Never expose message contents."""
    if os.environ.get("LIDYA_PUSH_ENABLED") != "1":
        return 0

    devices = eligible_devices(db, user_id, conversation_id)
    if not devices:
        return 0

    raw = os.environ.get("LIDYA_FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        logger.warning("FCM credentials not configured")
        return 0

    try:
        config = json.loads(raw)
        project_id = config["project_id"]

        credentials = (
            service_account.Credentials.from_service_account_info(
                config, scopes=[FCM_SCOPE]
            )
        )
        credentials.refresh(Request())

        url = (
            f"https://fcm.googleapis.com/v1/projects/"
            f"{project_id}/messages:send"
        )

        success = 0

        for token in devices:
            payload = {
                "message": {
                    "token": token,
                    "data": {
                        "kind": "dm_message",
                        "conversation_id": str(conversation_id),
                    },
                    "android": {"priority": "high"},
                }
            }

            try:
                response = requests.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {credentials.token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=5,
                )

                if response.ok:
                    success += 1
                else:
                    logger.warning(
                        "FCM delivery rejected: HTTP %s",
                        response.status_code,
                    )
            except requests.RequestException:
                logger.exception("FCM delivery connection failed")

        return success

    except (ValueError, KeyError, TypeError):
        logger.exception("FCM configuration invalid")
        return 0
    except Exception:
        logger.exception("FCM authorization or delivery failed")
        return 0


def send_dm_push_background(user_id, conversation_id):
    """Send after message commit, using an independent DB session."""
    from .db import SessionLocal

    try:
        with SessionLocal() as db:
            return send_dm_push(db, user_id, conversation_id)
    except Exception:
        logger.exception("Background FCM send failed")
        return 0
