from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.nobility_avatar import (
    active_avatar,
    grant_avatar,
)
from backend.app.nobility_avatar_models import NobilityAnimatedAvatar
from backend.app.nobility_appearance import public_appearance

from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine
from backend.tests.test_nobility_avatar_media_v11 import animation


@pytest.fixture
def avatar_engine(engine):
    NobilityAnimatedAvatar.__table__.create(
        engine, checkfirst=True
    )
    return engine


@pytest.fixture
def avatar_record(avatar_engine):
    now = datetime.now(timezone.utc)

    with Session(avatar_engine) as db:
        db.add(NobilityAnimatedAvatar(
            user_id="u1",
            asset_id="12345678-1234-4234-8234-123456789abc",
            granted_by=None,
            mime_type="image/gif",
            media=animation(),
            granted_at=now,
            expires_at=now + timedelta(days=15),
        ))
        db.commit()

    return now


def test_without_membership(
    avatar_engine, avatar_record
):
    with Session(avatar_engine) as db:
        assert active_avatar(db, "u1") is None


def test_other_user_cannot_inherit(
    avatar_engine, avatar_record
):
    with Session(avatar_engine) as db:
        assert active_avatar(db, "u2") is None


def test_active_entitlement(
    avatar_engine, avatar_record, monkeypatch
):
    monkeypatch.setattr(
        "backend.app.nobility_avatar.has_privilege",
        lambda *a, **kw: True,
    )

    with Session(avatar_engine) as db:
        row = active_avatar(db, "u1")
        assert row is not None
        assert row.mime_type == "image/gif"
        assert row.expires_at - row.granted_at == timedelta(days=15)


def test_expired_avatar(
    avatar_engine, avatar_record, monkeypatch
):
    monkeypatch.setattr(
        "backend.app.nobility_avatar.has_privilege",
        lambda *a, **kw: True,
    )

    with Session(avatar_engine) as db:
        assert active_avatar(
            db, "u1",
            avatar_record + timedelta(days=15),
        ) is None


def test_before_grant(
    avatar_engine, avatar_record, monkeypatch
):
    monkeypatch.setattr(
        "backend.app.nobility_avatar.has_privilege",
        lambda *a, **kw: True,
    )

    with Session(avatar_engine) as db:
        assert active_avatar(
            db, "u1",
            avatar_record - timedelta(seconds=1),
        ) is None


def test_revoked_privilege(
    avatar_engine, avatar_record, monkeypatch
):
    monkeypatch.setattr(
        "backend.app.nobility_avatar.has_privilege",
        lambda *a, **kw: False,
    )

    with Session(avatar_engine) as db:
        assert active_avatar(db, "u1") is None


def test_public_appearance_without_rank(
    avatar_engine, avatar_record
):
    with Session(avatar_engine) as db:
        result = public_appearance(db, "u1")
        assert result["rank"] == 0
        assert "animated_avatar" not in result


def test_normal_user_cannot_grant(avatar_engine):
    with Session(avatar_engine) as db:
        with pytest.raises(HTTPException) as exc:
            grant_avatar(
                db, "u1", "u2", animation()
            )

        assert exc.value.status_code == 403
        db.rollback()

        assert db.get(
            NobilityAnimatedAvatar, "u1"
        ) is None
