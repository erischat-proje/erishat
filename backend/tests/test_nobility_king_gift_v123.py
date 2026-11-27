import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import Session

from backend.app.models import User

from backend.app.nobility_models import (
    NobilityMembership,
)

from backend.app.nobility_banner_models import (
    NobilityBannerEvent,
)

from backend.app.nobility_collection import (
    set_preference,
)

from backend.app import nobility_banner_service as service

from backend.tests.test_nobility_collection_v117 import (
    database,
    UID,
)


DETAILS = {
    "key": "28",
    "name": "Toprak Bardak",
    "image_url": "/hediyesistemi/28.png",
    "quantity": 3,
    "event_ids": ["101", "102", "103"],
}


@pytest.fixture
def banner_db(database):
    assert database.dialect.name == "postgresql"

    NobilityBannerEvent.__table__.create(
        database, checkfirst=True
    )

    with Session(database) as db:
        member = db.get(NobilityMembership, UID)
        member.rank = 4
        db.commit()

    return database


def announce(db, key="gift:101"):
    return asyncio.run(
        service.announce_gift(
            db,
            UID,
            "test-room",
            key,
            gift_details=DETAILS,
        )
    )


def test_dynamic_gift_payload(banner_db, monkeypatch):
    publish = AsyncMock(return_value=True)

    monkeypatch.setattr(
        service, "publish_banner", publish
    )

    with Session(banner_db) as db:
        assert announce(db)

    publish.assert_awaited_once()

    payload = publish.call_args.args[0]

    assert payload["rank"] == 4
    assert payload["kind"] == "gift_banner"
    assert payload["scope"] == "global"
    assert payload["nickname"] == "CollectionTest"
    assert payload["gift"] == DETAILS

    with Session(banner_db) as db:
        assert db.get(
            NobilityBannerEvent, "gift:101"
        ) is not None


def test_disabled_gift_banner(banner_db, monkeypatch):
    publish = AsyncMock(return_value=True)

    monkeypatch.setattr(
        service, "publish_banner", publish
    )

    with Session(banner_db) as db:
        set_preference(
            db,
            db.get(User, UID),
            4,
            "gift_banner",
            False,
        )

        assert not announce(db)

        assert db.get(
            NobilityBannerEvent, "gift:101"
        ) is None

    publish.assert_not_awaited()


def test_reenabled_banner(banner_db, monkeypatch):
    publish = AsyncMock(return_value=True)

    monkeypatch.setattr(
        service, "publish_banner", publish
    )

    with Session(banner_db) as db:
        user = db.get(User, UID)

        set_preference(
            db, user, 4, "gift_banner", False
        )

        assert not announce(db)

        set_preference(
            db, user, 4, "gift_banner", True
        )

        assert announce(db)

    publish.assert_awaited_once()


def test_duplicate_event(banner_db, monkeypatch):
    publish = AsyncMock(return_value=True)

    monkeypatch.setattr(
        service, "publish_banner", publish
    )

    with Session(banner_db) as db:
        assert announce(db)
        assert not announce(db)

    publish.assert_awaited_once()


@pytest.mark.parametrize("rank", [1, 2, 3])
def test_other_rank_preserved(
    banner_db, monkeypatch, rank
):
    publish = AsyncMock(return_value=True)

    monkeypatch.setattr(
        service, "publish_banner", publish
    )

    with Session(banner_db) as db:
        member = db.get(NobilityMembership, UID)
        member.rank = rank
        db.commit()

        assert announce(db)

    payload = publish.call_args.args[0]

    assert payload["rank"] == rank
    assert payload["gift"] == DETAILS


def test_expired_rank_denied(banner_db, monkeypatch):
    publish = AsyncMock(return_value=True)

    monkeypatch.setattr(
        service, "publish_banner", publish
    )

    with Session(banner_db) as db:
        member = db.get(NobilityMembership, UID)
        now = datetime.now(timezone.utc)

        member.started_at = now-timedelta(days=32)
        member.expires_at = now-timedelta(days=2)

        db.commit()

        assert not announce(db)

    publish.assert_not_awaited()


def test_publication_failure_is_safe(
    banner_db, monkeypatch
):
    publish = AsyncMock(
        side_effect=RuntimeError("Test delivery failure")
    )

    monkeypatch.setattr(
        service, "publish_banner", publish
    )

    with Session(banner_db) as db:
        assert not announce(db)

    with Session(banner_db) as db:
        user = db.get(User, UID)

        assert user.lidya == 123456
        assert user.lidya_gem == 98765


def test_balances_and_points_unchanged(
    banner_db, monkeypatch
):
    monkeypatch.setattr(
        service,
        "publish_banner",
        AsyncMock(return_value=True),
    )

    with Session(banner_db) as db:
        assert announce(db)

    with Session(banner_db) as db:
        user = db.get(User, UID)
        member = db.get(NobilityMembership, UID)

        assert user.lidya == 123456
        assert user.lidya_gem == 98765
        assert member.points == 400000
        assert member.rank == 4
