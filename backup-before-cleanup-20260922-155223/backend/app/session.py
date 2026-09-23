from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from sqlalchemy import DateTime, ForeignKey, String, delete, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .db import Base
from .models import User


class UserSession(Base):
    __tablename__ = "user_sessions"

    token_hash: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(db: Session, user: User, days: int = 30) -> str:
    if days < 1 or days > 365:
        raise ValueError("Session süresi 1-365 gün arasında olmalı")
    raw_token = secrets.token_urlsafe(48)
    db.add(
        UserSession(
            token_hash=hash_token(raw_token),
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=days),
        )
    )
    db.commit()
    return raw_token


def get_user_from_token(db: Session, token: str | None) -> User | None:
    if not token or len(token) > 512:
        return None
    row = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if not row:
        return None
    now = datetime.now(timezone.utc)
    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        db.delete(row)
        db.commit()
        return None
    return db.get(User, row.user_id)


def revoke_session(db: Session, token: str | None) -> bool:
    if not token:
        return False
    result = db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(token)))
    db.commit()
    return bool(result.rowcount)


def cleanup_expired_sessions(db: Session) -> int:
    result = db.execute(
        delete(UserSession).where(UserSession.expires_at <= datetime.now(timezone.utc))
    )
    db.commit()
    return int(result.rowcount or 0)
