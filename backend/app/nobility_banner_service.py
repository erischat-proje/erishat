"""Server-authorized nobility announcements."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from .models import User
from .nobility_banner_policy import authorized_banner
from .nobility_banner_limits import reserve_banner

logger = logging.getLogger(__name__)


def prepare_banner(
    db, user_id, kind, *,
    room_id=None,
    action=None,
    event_id=None,
):
    from .room_routes import ghost_active

    user = db.get(
        User, user_id,
        populate_existing=True,
    )

    if not user or not user.is_active:
        return None

    now = datetime.now(timezone.utc)

    payload = authorized_banner(
        db,
        user_id,
        kind,
        ghost=ghost_active(db, user_id),
        at=now,
    )

    if payload is None:
        return None

    if payload["scope"] == "room" and not room_id:
        return None

    if kind == "activation_banner":
        if action not in ("activate", "upgrade", "renew"):
            return None

    if kind in ("daily_banner", "room_welcome"):
        if not room_id:
            return None

        if not reserve_banner(
            db, user_id, kind, room_id, now
        ):
            return None

    payload.update({
        "id": str(event_id or uuid4().hex),
        "user_id": str(user.id),
        "nickname": str(user.nickname or "Kullanıcı"),
        "room_id": str(room_id) if room_id else None,
        "created_at": now.isoformat(),
    })

    if action:
        payload["action"] = action

    return payload


async def publish_banner(payload):
    if not payload:
        return False

    try:
        from .main import (
            _broadcast_filtered_nobility_banner,
        )

        if payload["scope"] not in ("global", "room"):
            return False

        await _broadcast_filtered_nobility_banner(payload)

        return True

    except Exception:
        logger.exception("Nobility banner publication failed")
        return False


async def announce_gift(
    db, user_id, room_id, event_id,
    *, gift_details=None,
):
    from sqlalchemy.orm import Session
    from .nobility_banner_limits import reserve_gift_banner

    try:
        with Session(db.get_bind()) as banner_db:
            payload = prepare_banner(
                banner_db, user_id, "gift_banner",
                room_id=room_id,
                event_id=event_id,
            )

            if not payload:
                return False

            if payload["rank"] in (1, 2, 3) and gift_details:
                payload["gift"] = dict(gift_details)

            if not reserve_gift_banner(
                banner_db, user_id, event_id
            ):
                return False

            banner_db.commit()

        return await publish_banner(payload)

    except Exception:
        logger.exception("Nobility gift banner failed")
        return False


def prepare_entry_banners(db, user_id, room_id):
    try:
        payloads = []

        for kind in ("daily_banner", "room_welcome"):
            payload = prepare_banner(
                db, user_id, kind,
                room_id=room_id,
            )

            if payload:
                payloads.append(payload)

        db.commit()
        return payloads

    except Exception:
        db.rollback()
        logger.exception("Nobility entry banners failed")
        return []


def prepare_action_banner(db, user_id, action, request_id):
    from .room_models import RoomMember
    from sqlalchemy import select

    try:
        room_id = db.scalar(
            select(RoomMember.room_id)
            .where(
                RoomMember.user_id == user_id,
                RoomMember.ghost.is_(False),
            )
            .order_by(RoomMember.joined_at.desc())
            .limit(1)
        )

        return prepare_banner(
            db,
            user_id,
            "activation_banner",
            room_id=room_id,
            action=action,
            event_id=f"action:{user_id}:{request_id}",
        )

    except Exception:
        logger.exception("Nobility action banner preparation failed")
        return None
