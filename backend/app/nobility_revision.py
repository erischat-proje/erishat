"""Server-side nobility confirmation revision."""

import hashlib
import json

from datetime import datetime, timezone

from .nobility_policy import effective_rank, utc


def date_value(value):
    if value is None:
        return None

    return utc(value).isoformat()


def membership_revision(
    user_id,
    member,
    *,
    authorized_rank,
    system_enabled,
    at=None,
):
    now = at or datetime.now(timezone.utc)

    state = {
        "version": 1,
        "user_id": str(user_id),
        "enabled": bool(system_enabled),
        "authorized_rank": authorized_rank,
        "effective_rank": effective_rank(member, now),
        "membership_exists": member is not None,
        "stored_rank": member.rank if member else 0,
        "points": str(member.points if member else 0),
        "started_at": date_value(
            member.started_at if member else None
        ),
        "expires_at": date_value(
            member.expires_at if member else None
        ),
        "updated_at": date_value(
            member.updated_at if member else None
        ),
    }

    encoded = json.dumps(
        state,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")

    return hashlib.sha256(encoded).hexdigest()
