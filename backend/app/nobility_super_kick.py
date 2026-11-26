"""Atomic daily super-kick quota reservation."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import insert

from .nobility_policy import has_privilege
from .nobility_super_kick_models import NobilitySuperKickQuota

DAILY_LIMIT = 5
LOCAL_TIMEZONE = ZoneInfo("Europe/Istanbul")


def reserve_super_kick(db, user_id, at=None):
    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("PostgreSQL required")

    at = at or datetime.now(timezone.utc)

    if at.tzinfo is None:
        raise ValueError("Timezone required")

    if not has_privilege(db, user_id, "super_kick", at):
        return None

    day = at.astimezone(LOCAL_TIMEZONE).date()
    model = NobilitySuperKickQuota

    statement = (
        insert(model)
        .values(
            user_id=user_id,
            day=day,
            used=1,
            updated_at=at,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "day"],
            set_={
                "used": model.used + 1,
                "updated_at": at,
            },
            where=model.used < DAILY_LIMIT,
        )
        .returning(model.used)
    )

    used = db.execute(statement).scalar_one_or_none()

    if used is None:
        return None

    return DAILY_LIMIT - used
