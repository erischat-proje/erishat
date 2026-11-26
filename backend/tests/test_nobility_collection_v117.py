"""Isolated nobility collection regression tests."""

import json
import os
from threading import Barrier
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import select, text
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.models import User

from sqlalchemy import Integer

from backend.app.system_data import (
    LidyaLedger,
    LidyaGemLedger,
)

from backend.app.admin_models import AdminRole

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityRankConfig,
    NobilityVisualPreference,
    NobilityAuditLog,
)

from backend.app.nobility_config import get_rank_rule

from backend.app.nobility_collection import (
    inventory,
    set_preference,
    visual_enabled,
)

from backend.app.nobility_appearance import (
    public_appearance,
)

from backend.app.nobility_banner_policy import (
    authorized_banner,
)

from backend.app.nobility_room_priority import (
    member_nobility,
    order_room_members,
)

UID = "collection-test-user"


@pytest.fixture
def database(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "true"
    )

    socket_dir = os.getenv("LIDYA_COLLECTION_TEST_PG")

    if socket_dir:
        schema = "collection_" + uuid4().hex

        connect_args = {
            "host": socket_dir,
            "port": 55439,
        }

        root = create_engine(
            "postgresql+psycopg://lidya_test@/postgres",
            connect_args=connect_args,
        )

        with root.begin() as conn:
            conn.execute(text(
                "CREATE SCHEMA " + schema
            ))

        root.dispose()

        engine = create_engine(
            "postgresql+psycopg://lidya_test@/postgres",
            connect_args={
                **connect_args,
                "options": (
                    "-c search_path=" + schema +
                    " -c lock_timeout=10000"
                ),
            },
        )

    else:
        engine = create_engine(
            "sqlite:///" +
            str(tmp_path / "collection.db")
        )

    # Preserve actual financial ledger hooks.
    if engine.dialect.name == "sqlite":
        for model in (LidyaLedger, LidyaGemLedger):
            column = model.__table__.c.id

            monkeypatch.setattr(
                column,
                "type",
                column.type.with_variant(
                    Integer(), "sqlite"
                ),
            )

    tables = [
        LidyaLedger.__table__,
        LidyaGemLedger.__table__,
        User.__table__,
        AdminRole.__table__,
        NobilityMembership.__table__,
        NobilityRankConfig.__table__,
        NobilityVisualPreference.__table__,
        NobilityAuditLog.__table__,
    ]

    Base.metadata.create_all(
        engine, tables=tables
    )

    now = datetime.now(timezone.utc)

    with Session(engine) as db:
        db.add(User(
            id=UID,
            public_id="9999999991",
            _nickname="CollectionTest",
            _frame_asset="previous-frame.png",
            lidya=123456,
            lidya_gem=98765,
        ))

        for rank in range(1, 5):
            rule = get_rank_rule(rank)

            db.add(NobilityRankConfig(
                rank=rank,
                enabled=True,
                required_points=rule.required_points,
                renewal_points=rule.renewal_points,
                duration_days=rule.duration_days,
            ))

        db.flush()

        db.add(NobilityMembership(
            user_id=UID,
            rank=1,
            points=400000,
            started_at=now-timedelta(days=1),
            expires_at=now+timedelta(days=29),
        ))

        db.commit()

    yield engine

    engine.dispose()


def test_knight_inventory(database):
    with Session(database) as db:
        items = inventory(
            db, db.get(User, UID)
        )

        assert len(items) == 4

        assert {
            x["nobility_privilege"]
            for x in items
        } == {
            "badge",
            "frame",
            "entrance",
            "gift_banner",
        }

        assert all(x["equipped"] for x in items)
        assert all(not x["locked"] for x in items)


@pytest.mark.parametrize(
    "privilege",
    ["frame", "badge", "entrance", "gift_banner"]
)
def test_disable_and_restore(database, privilege):
    with Session(database) as db:
        user = db.get(User, UID)

        set_preference(
            db, user, 1, privilege, False
        )

        assert not visual_enabled(
            db, UID, 1, privilege
        )

    # Reopen database session.

    with Session(database) as db:
        user = db.get(User, UID)

        item = next(
            x for x in inventory(db, user)
            if x["nobility_privilege"] == privilege
        )

        assert not item["equipped"]
        assert not item["locked"]

        set_preference(
            db, user, 1, privilege, True
        )

        assert visual_enabled(
            db, UID, 1, privilege
        )


@pytest.mark.parametrize(
    "privilege", ["frame", "badge", "entrance"]
)
def test_public_appearance(database, privilege):
    with Session(database) as db:
        user = db.get(User, UID)

        assert privilege in public_appearance(
            db, UID
        )["privileges"]

        set_preference(
            db, user, 1, privilege, False
        )

        appearance = public_appearance(db, UID)

        assert appearance["rank"] == 1

        assert privilege not in (
            appearance["privileges"]
        )


def test_gift_banner(database):
    with Session(database) as db:
        user = db.get(User, UID)

        assert authorized_banner(
            db, UID, "gift_banner", ghost=False
        )

        set_preference(
            db, user, 1, "gift_banner", False
        )

        assert authorized_banner(
            db, UID, "gift_banner", ghost=False
        ) is None

        set_preference(
            db, user, 1, "gift_banner", True
        )

        assert authorized_banner(
            db, UID, "gift_banner", ghost=False
        )


def test_priority_preserved(database):
    with Session(database) as db:
        set_preference(
            db, db.get(User, UID),
            1, "badge", False
        )

        data = member_nobility(
            db, UID, datetime.now(timezone.utc)
        )

        assert data["rank"] == 1
        assert "badge" not in data["privileges"]

        rows = [
            {"id":"normal", "nobility":{"rank":0}},
            {"id":UID, "nobility":data},
        ]

        assert order_room_members(rows)[0]["id"] == UID


@pytest.mark.parametrize(
    "rank,privilege,enabled",
    [
        (4, "frame", True),
        (1, "super_avatar", True),
        (1, "unknown", True),
        (1, "frame", "true"),
        (True, "frame", True),
    ]
)
def test_invalid_requests(
    database, rank, privilege, enabled
):
    with Session(database) as db:
        with pytest.raises(HTTPException):
            set_preference(
                db, db.get(User, UID),
                rank, privilege, enabled
            )


def test_expired_membership(database):
    with Session(database) as db:
        member = db.get(
            NobilityMembership, UID
        )

        now = datetime.now(timezone.utc)

        member.started_at = now-timedelta(days=32)
        member.expires_at = now-timedelta(days=2)

        db.commit()

        user = db.get(User, UID)
        items = inventory(db, user)

        assert len(items) == 4
        assert all(x["locked"] for x in items)
        assert all(x["expired"] for x in items)
        assert not any(x["equipped"] for x in items)

        with pytest.raises(HTTPException):
            set_preference(
                db, user, 1, "frame", True
            )

        assert public_appearance(
            db, UID
        )["rank"] == 0


def test_history_preserved(database):
    with Session(database) as db:
        member = db.get(
            NobilityMembership, UID
        )

        now = datetime.now(timezone.utc)

        db.add(NobilityAuditLog(
            id=str(uuid4()),
            user_id=UID,
            actor_id=UID,
            action="rank_activation",
            before_state="{}",
            after_state=json.dumps({
                "rank": 1,
                "expires_at": (
                    now+timedelta(days=15)
                ).isoformat(),
            }),
            reason="Collection regression test",
        ))

        member.rank = 2
        db.commit()

        items = inventory(
            db, db.get(User, UID)
        )

        old = [
            x for x in items
            if x["nobility_rank"] == 1
        ]

        current = [
            x for x in items
            if x["nobility_rank"] == 2
        ]

        assert len(old) == 4
        assert len(current) == 4

        assert all(x["locked"] for x in old)
        assert all(x["equipped"] for x in current)


def test_staff_protection(database):
    with Session(database) as db:
        db.add(AdminRole(
            user_id=UID,
            role="SA",
        ))

        db.commit()

        user = db.get(User, UID)

        with pytest.raises(HTTPException):
            set_preference(
                db, user, 1, "frame", True
            )

        assert not any(
            x["nobility_privilege"] == "frame"
            for x in inventory(db, user)
        )


def test_balances_unchanged(database):
    with Session(database) as db:
        user = db.get(User, UID)

        for privilege in (
            "frame", "badge", "entrance", "gift_banner"
        ):
            for enabled in (False, True):
                set_preference(
                    db, user, 1, privilege, enabled
                )

        db.refresh(user)

        member = db.get(
            NobilityMembership, UID
        )

        assert user.lidya == 123456
        assert user.lidya_gem == 98765
        assert member.points == 400000
        assert member.rank == 1
        assert user._frame_asset == "previous-frame.png"


def test_concurrent_preference(database):
    if database.dialect.name != "postgresql":
        pytest.skip("PostgreSQL required")

    barrier = Barrier(5)

    def worker(index):
        with Session(database) as db:
            user = db.get(User, UID)

            barrier.wait(timeout=20)

            result = set_preference(
                db, user, 1, "frame",
                index % 2 == 0
            )

            return result["ok"]

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(worker, range(5)))

    assert all(results)

    with Session(database) as db:
        rows = db.scalars(
            select(NobilityVisualPreference)
            .where(
                NobilityVisualPreference.user_id == UID,
                NobilityVisualPreference.rank == 1,
                NobilityVisualPreference.privilege == "frame",
            )
        ).all()

        assert len(rows) == 1

        user = db.get(User, UID)

        member = db.get(
            NobilityMembership, UID
        )

        assert user.lidya == 123456
        assert user.lidya_gem == 98765
        assert member.points == 400000
        assert member.rank == 1

        set_preference(
            db, user, 1, "frame", False
        )

        assert not visual_enabled(
            db, UID, 1, "frame"
        )

        set_preference(
            db, user, 1, "frame", True
        )

        assert visual_enabled(
            db, UID, 1, "frame"
        )


# Real HTTP collection preference regression.

@pytest.fixture
def collection_http(database):
    from fastapi import (
        FastAPI, Depends, Header,
    )
    from fastapi.testclient import TestClient
    from backend.app.db import get_db
    from backend.app.nobility_routes import register_auth

    with Session(database) as db:
        db.add(User(
            id="collection-other-user",
            public_id="9999999992",
            _nickname="OtherTest",
            lidya=5000,
            lidya_gem=1000,
        ))
        db.commit()

    def test_db():
        with Session(database) as db:
            yield db

    def test_auth(
        authorization: str | None = Header(default=None),
        db: Session = Depends(get_db),
    ):
        tokens = {
            "Bearer knight-test": UID,
            "Bearer other-test": "collection-other-user",
        }

        uid = tokens.get(authorization)

        if not uid:
            raise HTTPException(401, "Unauthorized")

        user = db.get(User, uid)

        if user is None:
            raise HTTPException(401, "Unauthorized")

        return user

    app = FastAPI()

    app.dependency_overrides[get_db] = test_db
    app.include_router(register_auth(test_auth))

    with TestClient(app) as client:
        yield client


COLLECTION_URL = "/v1/nobility/collection/preference"

KNIGHT_AUTH = {
    "Authorization": "Bearer knight-test"
}


@pytest.mark.parametrize(
    "privilege",
    ["badge", "frame", "entrance", "gift_banner"]
)
def test_http_disable_restore(
    collection_http, database, privilege
):
    for enabled in (False, True):
        response = collection_http.post(
            COLLECTION_URL,
            headers=KNIGHT_AUTH,
            json={
                "rank": 1,
                "privilege": privilege,
                "enabled": enabled,
            },
        )

        assert response.status_code == 200, response.text
        assert response.json()["enabled"] is enabled

        with Session(database) as db:
            assert visual_enabled(
                db, UID, 1, privilege
            ) is enabled

            user = db.get(User, UID)

            item = next(
                x for x in inventory(db, user)
                if x["nobility_privilege"] == privilege
            )

            assert item["equipped"] is enabled

            assert user.lidya == 123456
            assert user.lidya_gem == 98765

            member = db.get(
                NobilityMembership, UID
            )

            assert member.points == 400000
            assert member.rank == 1


def test_http_requires_auth(collection_http):
    response = collection_http.post(
        COLLECTION_URL,
        json={
            "rank": 1,
            "privilege": "frame",
            "enabled": False,
        },
    )

    assert response.status_code == 401


def test_http_other_account(
    collection_http, database
):
    response = collection_http.post(
        COLLECTION_URL,
        headers={
            "Authorization": "Bearer other-test"
        },
        json={
            "user_id": UID,
            "rank": 1,
            "privilege": "frame",
            "enabled": False,
        },
    )

    assert response.status_code == 403

    with Session(database) as db:
        assert visual_enabled(
            db, UID, 1, "frame"
        )


@pytest.mark.parametrize(
    "rank, privilege, enabled, status",
    [
        (4, "frame", True, 403),
        (1, "super_avatar", True, 403),
        (1, "unknown", True, 400),
        (1, "frame", "false", 400),
        (True, "frame", True, 400),
        (0, "frame", True, 400),
    ]
)
def test_http_invalid_preference(
    collection_http,
    rank, privilege, enabled, status
):
    response = collection_http.post(
        COLLECTION_URL,
        headers=KNIGHT_AUTH,
        json={
            "rank": rank,
            "privilege": privilege,
            "enabled": enabled,
        },
    )

    assert response.status_code == status


def test_http_expired_membership(
    collection_http, database
):
    with Session(database) as db:
        member = db.get(
            NobilityMembership, UID
        )

        now = datetime.now(timezone.utc)

        member.started_at = now-timedelta(days=32)
        member.expires_at = now-timedelta(days=2)

        db.commit()

    response = collection_http.post(
        COLLECTION_URL,
        headers=KNIGHT_AUTH,
        json={
            "rank": 1,
            "privilege": "frame",
            "enabled": True,
        },
    )

    assert response.status_code == 403


def test_http_staff_protection(
    collection_http, database
):
    with Session(database) as db:
        db.add(AdminRole(
            user_id=UID,
            role="SA",
        ))
        db.commit()

    response = collection_http.post(
        COLLECTION_URL,
        headers=KNIGHT_AUTH,
        json={
            "rank": 1,
            "privilege": "frame",
            "enabled": True,
        },
    )

    assert response.status_code == 403
