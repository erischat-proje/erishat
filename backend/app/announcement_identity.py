"""Bounded publisher identity lookup for public and management announcement views."""
from sqlalchemy import select
from .models import User


def announcement_payloads(db, rows):
    rows = list(rows)
    if not rows:
        return []
    publishers = dict(db.execute(select(User.id, User.public_id).where(
        User.id.in_({row.admin_id for row in rows}))).all())
    return [{"id": row.id, "title": "LidyaChat Yönetim", "message": row.message,
             "admin_public_id": publishers.get(row.admin_id) or row.admin_id,
             "active": row.active, "created_at": row.created_at} for row in rows]
