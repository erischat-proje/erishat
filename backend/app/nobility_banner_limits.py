"""Atomic PostgreSQL banner cooldown reservations."""

from datetime import datetime, timezone, timedelta

from sqlalchemy.dialects.postgresql import insert

from .nobility_banner_models import NobilityBannerLimit
from .nobility_banner_policy import (
    daily_key,
    WELCOME_COOLDOWN_SECONDS,
)


def reserve_banner(db, user_id, kind, room_id=None, at=None):
    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("PostgreSQL required")

    if not isinstance(user_id, str) or not user_id:
        raise ValueError("Invalid user")

    now = at or datetime.now(timezone.utc)

    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("Timezone required")

    now = now.astimezone(timezone.utc)

    if kind == "daily_banner":
        scope = "daily"
        local_day = daily_key(now)

        from .nobility_banner_policy import LOCAL_TIMEZONE

        midnight = datetime.fromisoformat(
            local_day
        ).replace(
            tzinfo=LOCAL_TIMEZONE
        ).astimezone(timezone.utc)

        cutoff = midnight
        condition = NobilityBannerLimit.last_at < cutoff

    elif kind == "room_welcome":
        if (
            not isinstance(room_id, str)
            or not room_id
            or len(room_id) > 128
        ):
            raise ValueError("Invalid room")

        scope = room_id

        cutoff = now - timedelta(
            seconds=WELCOME_COOLDOWN_SECONDS
        )

        condition = NobilityBannerLimit.last_at <= cutoff

    else:
        raise ValueError("Invalid banner kind")

    stmt = insert(NobilityBannerLimit).values(
        user_id=user_id,
        kind=kind,
        scope_key=scope,
        last_at=now,
    )

    stmt = stmt.on_conflict_do_update(
        index_elements=[
            NobilityBannerLimit.user_id,
            NobilityBannerLimit.kind,
            NobilityBannerLimit.scope_key,
        ],
        set_={"last_at": now},
        where=condition,
    ).returning(NobilityBannerLimit.user_id)

    return db.execute(stmt).scalar_one_or_none() is not None


def reserve_gift_banner(db, user_id, event_id):
    from sqlalchemy.dialects.postgresql import insert
    from .nobility_banner_models import NobilityBannerEvent

    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("PostgreSQL required")

    if not isinstance(event_id, str):
        raise ValueError("Invalid event ID")

    if not event_id or len(event_id) > 160:
        raise ValueError("Invalid event ID")

    if not event_id.startswith(("gift:", "couple:")):
        raise ValueError("Invalid event source")

    statement = (
        insert(NobilityBannerEvent)
        .values(
            event_id=event_id,
            user_id=user_id,
        )
        .on_conflict_do_nothing(
            index_elements=["event_id"]
        )
        .returning(NobilityBannerEvent.event_id)
    )

    return db.execute(
        statement
    ).scalar_one_or_none() is not None
