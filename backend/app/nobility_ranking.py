"""Add authorized Knight visuals without altering rankings."""

from datetime import datetime, timezone

from .nobility_policy import enabled
from .nobility_follow_appearance import knight_follow_appearances


def knight_ranking(db, viewer_id, payload):
    if not enabled():
        return payload

    at = datetime.now(timezone.utc)
    rows = payload["items"]

    appearances = knight_follow_appearances(
        db,
        viewer_id,
        [row.get("user_id") for row in rows],
        at,
    )

    items = [
        {
            **row,
            "nobility": appearances.get(
                row.get("user_id"),
                {"rank": 0, "privileges": []},
            ),
        }
        for row in rows
    ]

    return {
        **payload,
        "items": items,
    }
