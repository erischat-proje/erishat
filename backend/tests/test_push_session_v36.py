from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.push_device_routes import active_session
from app.session import UserSession, hash_token


def make_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    UserSession.__table__.create(engine)
    return Session(engine)


def add_session(db, token, user_id, expires):
    db.add(UserSession(
        token_hash=hash_token(token),
        user_id=user_id,
        expires_at=expires,
    ))
    db.commit()


def test_valid_session():
    with make_db() as db:
        add_session(
            db, "valid-token", "user-a",
            datetime.now(timezone.utc) + timedelta(days=1),
        )
        assert active_session(
            db, "Bearer valid-token", "user-a"
        ) == hash_token("valid-token")


def test_expired_session_rejected():
    with make_db() as db:
        add_session(
            db, "expired-token", "user-a",
            datetime.now(timezone.utc) - timedelta(days=1),
        )
        with pytest.raises(HTTPException) as error:
            active_session(
                db, "Bearer expired-token", "user-a"
            )
        assert error.value.status_code == 401


def test_other_account_session_rejected():
    with make_db() as db:
        add_session(
            db, "account-a-token", "user-a",
            datetime.now(timezone.utc) + timedelta(days=1),
        )
        with pytest.raises(HTTPException) as error:
            active_session(
                db, "Bearer account-a-token", "user-b"
            )
        assert error.value.status_code == 401


def test_revoked_session_rejected():
    with make_db() as db:
        add_session(
            db, "revoked-token", "user-a",
            datetime.now(timezone.utc) + timedelta(days=1),
        )
        row = db.get(UserSession, hash_token("revoked-token"))
        db.delete(row)
        db.commit()

        with pytest.raises(HTTPException) as error:
            active_session(
                db, "Bearer revoked-token", "user-a"
            )
        assert error.value.status_code == 401
