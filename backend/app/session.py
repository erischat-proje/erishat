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
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(db: Session, user: User, days: int = 30) -> str:
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


def get_user_from_token(db: Session, token: str) -> User | None:
    row = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if not row or row.expires_at <= datetime.now(timezone.utc):
        return None
    return db.get(User, row.user_id)


def revoke_session(db: Session, token: str) -> bool:
    result = db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(token)))
    db.commit()
    return bool(result.rowcount)


def cleanup_expired_sessions(db: Session) -> int:
    result = db.execute(
        delete(UserSession).where(UserSession.expires_at <= datetime.now(timezone.utc))
    )
    db.commit()
    return int(result.rowcount or 0)
