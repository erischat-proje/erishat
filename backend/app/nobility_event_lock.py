"""Shared transaction lock for nobility event keys."""

from hashlib import sha256
from sqlalchemy import text


def lock_event_key(db, event_key):
    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("PostgreSQL required")

    if (
        not isinstance(event_key, str)
        or not event_key.strip()
        or len(event_key) > 160
    ):
        raise ValueError("Invalid event key")

    digest = sha256(
        ("lidyachat:nobility:" + event_key).encode("utf-8")
    ).digest()

    lock_id = int.from_bytes(
        digest[:8],
        byteorder="big",
        signed=True,
    )

    db.execute(
        text("SELECT pg_advisory_xact_lock(:lock_id)"),
        {"lock_id": lock_id},
    )
