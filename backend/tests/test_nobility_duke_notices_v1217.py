from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy.orm import Session

from backend.app.models import User
from backend.app.nobility_models import NobilityMembership
from backend.app.nobility_banner_models import NobilityBannerLimit
from backend.app.nobility_banner_limits import reserve_banner
from backend.app.nobility_banner_service import (
    prepare_banner,
    prepare_entry_banners,
)
from backend.app import room_routes

from backend.tests.test_nobility_collection_v117 import (
    database,
    UID,
)


@pytest.fixture
def duke_db(database):
    assert database.dialect.name == "postgresql"

    NobilityBannerLimit.__table__.create(
        database, checkfirst=True
    )

    with Session(database) as db:
        member = db.get(NobilityMembership, UID)
        member.rank = 3
        db.commit()

    return database


@pytest.mark.parametrize(
    "action", ["activate", "upgrade", "renew"]
)
def test_global_activation(duke_db, action):
    with Session(duke_db) as db:
        result = prepare_banner(
            db, UID,
            "activation_banner",
            action=action,
        )

        assert result["rank"] == 3
        assert result["scope"] == "global"
        assert result["action"] == action


def test_first_room_entry(duke_db):
    with Session(duke_db) as db:
        results = prepare_entry_banners(
            db, UID, "room-a"
        )

        assert len(results) == 2

        assert {
            x["kind"]: x["scope"]
            for x in results
        } == {
            "daily_banner": "global",
            "room_welcome": "room",
        }

        assert all(x["rank"] == 3 for x in results)

        assert not prepare_entry_banners(
            db, UID, "room-a"
        )


def test_different_room(duke_db):
    with Session(duke_db) as db:
        assert len(prepare_entry_banners(
            db, UID, "room-a"
        )) == 2

        results = prepare_entry_banners(
            db, UID, "room-b"
        )

        assert len(results) == 1
        assert results[0]["kind"] == "room_welcome"
        assert results[0]["room_id"] == "room-b"


def test_istanbul_midnight(duke_db):
    before = datetime(
        2026, 11, 27, 20, 59,
        tzinfo=timezone.utc
    )

    with Session(duke_db) as db:
        assert reserve_banner(
            db, UID, "daily_banner", "a", before
        )

        assert not reserve_banner(
            db, UID, "daily_banner", "b",
            before+timedelta(seconds=30)
        )

        assert reserve_banner(
            db, UID, "daily_banner", "b",
            before+timedelta(minutes=1)
        )

        db.commit()


def test_welcome_exact_cooldown(duke_db):
    now = datetime.now(timezone.utc)

    with Session(duke_db) as db:
        assert reserve_banner(
            db, UID, "room_welcome", "a", now
        )

        assert not reserve_banner(
            db, UID, "room_welcome", "a",
            now+timedelta(seconds=1799)
        )

        assert reserve_banner(
            db, UID, "room_welcome", "a",
            now+timedelta(seconds=1800)
        )

        db.commit()


@pytest.mark.parametrize(
    "kind", ["daily_banner", "room_welcome"]
)
def test_concurrent_reservation(duke_db, kind):
    barrier = Barrier(5)
    now = datetime.now(timezone.utc)

    def worker(_):
        with Session(duke_db) as db:
            barrier.wait(timeout=15)

            result = reserve_banner(
                db, UID, kind, "room-a", now
            )

            db.commit()
            return result

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(worker, range(5)))

    assert results.count(True) == 1
    assert results.count(False) == 4


def test_ghost_mode_denied(duke_db, monkeypatch):
    monkeypatch.setattr(
        room_routes, "ghost_active",
        lambda *args, **kwargs: True
    )

    with Session(duke_db) as db:
        assert not prepare_entry_banners(
            db, UID, "room-a"
        )

        assert prepare_banner(
            db, UID, "activation_banner",
            action="activate"
        ) is None


def test_count_cannot_use_duke_notices(duke_db):
    with Session(duke_db) as db:
        member = db.get(NobilityMembership, UID)
        member.rank = 2
        db.commit()

        assert not prepare_entry_banners(
            db, UID, "room-a"
        )


def test_expired_duke_denied(duke_db):
    with Session(duke_db) as db:
        member = db.get(NobilityMembership, UID)

        now = datetime.now(timezone.utc)

        member.started_at = now-timedelta(days=32)
        member.expires_at = now-timedelta(days=2)

        db.commit()

        assert not prepare_entry_banners(
            db, UID, "room-a"
        )


def test_balances_unchanged(duke_db):
    with Session(duke_db) as db:
        assert prepare_entry_banners(
            db, UID, "room-a"
        )

    with Session(duke_db) as db:
        user = db.get(User, UID)
        member = db.get(NobilityMembership, UID)

        assert user.lidya == 123456
        assert user.lidya_gem == 98765
        assert member.points == 400000
        assert member.rank == 3
