from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, APIRouter, Depends, Header, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, Integer
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.db import Base, get_db
from backend.app.models import User
from backend.app.system_data import (
    LidyaLedger, LidyaGemLedger,
)
from backend.app import room_routes as rooms
from backend.app.admin_models import AdminRole
from backend.app.platform_models import UserBlock
from backend.app.room_ban_models import RoomUserBan
from backend.app.room_models import (
    Room, RoomMember, RoomSeat,
    RoomModerator, RoomBan, RoomLivePresence,
)
from backend.app.nobility_models import (
    NobilityMembership, NobilityRankConfig,
    NobilityVisualPreference,
)
from backend.app.nobility_config import get_rank_rule


ROOM = "nobility-test-room"
URL = f"/v1/rooms/{ROOM}/members"
AUTH = {"Authorization": "Bearer owner"}


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "true"
    )

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_PAID_POINTS_ENABLED", "false"
    )

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    for model in (LidyaLedger, LidyaGemLedger):
        column = model.__table__.c.id

        if "sqlite" in getattr(
            column.type, "_variant_mapping", {}
        ):
            continue

        monkeypatch.setattr(
            column,
            "type",
            column.type.with_variant(
                Integer(), "sqlite"
            ),
        )

    models = (
        LidyaLedger, LidyaGemLedger,
        User, Room, RoomMember, RoomSeat,
        RoomModerator, RoomBan, RoomLivePresence,
        AdminRole, UserBlock, RoomUserBan,
        NobilityMembership, NobilityRankConfig,
        NobilityVisualPreference,
    )

    Base.metadata.create_all(
        engine,
        tables=[m.__table__ for m in models],
    )

    now = datetime.now(timezone.utc)

    users = [
        "owner", "normal", "knight",
        "knight2", "count", "duke", "king",
        "expired", "offline", "ghost",
        "blocked", "blocker", "banned",
        "inactive", "outsider", "adminban",
    ]

    with Session(engine) as db:
        for i, uid in enumerate(users):
            db.add(User(
                id=uid,
                public_id=str(990000000000+i),
                _nickname=uid,
                is_active=uid != "inactive",
            ))

        db.flush()

        db.add(Room(
            id=ROOM,
            public_id="880000000001",
            owner_id="owner",
            name="Asalet Test Odasi",
        ))

        db.flush()

        for i, uid in enumerate(users):
            if uid == "outsider":
                continue

            db.add(RoomMember(
                room_id=ROOM,
                user_id=uid,
                ghost=uid == "ghost",
                joined_at=now+timedelta(seconds=i),
            ))

            age = 120 if uid == "offline" else 2

            db.add(RoomLivePresence(
                room_id=ROOM,
                user_id=uid,
                last_seen_at=now-timedelta(seconds=age),
            ))

        db.add(RoomModerator(
            room_id=ROOM,
            user_id="knight2",
        ))

        db.add(RoomSeat(
            room_id=ROOM,
            seat_number=1,
            user_id="knight",
        ))

        db.add(AdminRole(
            user_id="ghost",
            role="DA",
            ghost_mode=True,
        ))

        db.add_all([
            UserBlock(
                blocker_id="owner",
                blocked_id="blocked",
            ),
            UserBlock(
                blocker_id="blocker",
                blocked_id="owner",
            ),
            RoomBan(
                room_id=ROOM,
                user_id="banned",
                banned_by="owner",
            ),
            RoomUserBan(
                room_id=ROOM,
                user_id="adminban",
                banned_by="owner",
                active=True,
                reason="Test",
            ),
        ])

        for rank in range(1, 5):
            rule = get_rank_rule(rank)

            db.add(NobilityRankConfig(
                rank=rank,
                required_points=rule.required_points,
                renewal_points=rule.renewal_points,
                duration_days=rule.duration_days,
                enabled=True,
            ))

        ranks = {
            "knight": 1,
            "knight2": 1,
            "count": 2,
            "duke": 3,
            "king": 4,
            "expired": 4,
            "offline": 4,
            "ghost": 4,
        }

        for uid, rank in ranks.items():
            db.add(NobilityMembership(
                user_id=uid,
                rank=rank,
                points=0,
                started_at=now-timedelta(days=10),
                expires_at=(
                    now-timedelta(days=1)
                    if uid == "expired"
                    else now+timedelta(days=20)
                ),
            ))

        db.commit()

    def test_db():
        with Session(engine) as db:
            yield db

    def auth(
        db: Session = Depends(get_db),
        authorization: str | None = Header(default=None),
    ):
        if authorization not in (
            "Bearer owner",
            "Bearer outsider",
        ):
            raise HTTPException(401)

        return db.get(User, authorization.split()[1])

    def resolve_room(db, room_id):
        room = db.get(Room, room_id)

        if room is None:
            raise HTTPException(404)

        return room

    monkeypatch.setattr(
        rooms, "get_room_or_404", resolve_room
    )

    # Never copy routes registered by the production app.
    # Each test must receive its own isolated router.
    monkeypatch.setattr(
        rooms,
        "router",
        APIRouter(
            prefix="/v1/rooms",
            tags=["rooms"],
        ),
    )

    for field in (
        "_room_auth_impl",
        "_room_disconnect_user",
        "_room_live_control",
    ):
        monkeypatch.setattr(
            rooms, field, getattr(rooms, field)
        )

    rooms.register_room_auth(auth)

    app = FastAPI()
    app.dependency_overrides[get_db] = test_db
    app.include_router(rooms.router)

    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        engine.dispose()


def online(setup):
    client, _ = setup

    response = client.get(
        URL+"?online_only=true",
        headers=AUTH,
    )

    assert response.status_code == 200, response.text

    return response.json()


def test_priority_order(setup):
    rows = online(setup)

    assert [r["user_id"] for r in rows] == [
        "king", "duke", "count",
        "knight", "knight2",
        "owner", "normal", "expired",
    ]


@pytest.mark.parametrize("uid", [
    "offline", "ghost", "blocked",
    "blocker", "banned", "inactive", "adminban",
])
def test_hidden_users(setup, uid):
    assert uid not in {
        r["user_id"] for r in online(setup)
    }


def test_expired_rank(setup):
    rows = {
        r["user_id"]: r
        for r in online(setup)
    }

    assert rows["expired"]["nobility"] == {
        "rank": 0, "privileges": []
    }


def test_knight_badge(setup):
    rows = {
        r["user_id"]: r
        for r in online(setup)
    }

    assert rows["knight"]["nobility"] == {
        "rank": 1,
        "privileges": ["badge"],
    }


def test_owner_role(setup):
    rows = {
        r["user_id"]: r
        for r in online(setup)
    }

    assert rows["owner"]["role"] == "owner"
    assert rows["knight2"]["role"] == "moderator"


def test_listener_included(setup):
    rows = {
        r["user_id"]: r
        for r in online(setup)
    }

    assert rows["normal"]["seat_number"] is None
    assert rows["knight"]["seat_number"] == 1


def test_no_authentication(setup):
    client, _ = setup
    assert client.get(
        URL+"?online_only=true"
    ).status_code == 401


def test_non_member_denied(setup):
    client, _ = setup

    assert client.get(
        URL+"?online_only=true",
        headers={
            "Authorization": "Bearer outsider"
        },
    ).status_code == 403


def test_management_compatibility(setup):
    client, _ = setup

    response = client.get(URL, headers=AUTH)
    assert response.status_code == 200

    rows = response.json()

    assert all("nobility" not in r for r in rows)
    assert "offline" in {
        r["user_id"] for r in rows
    }


def test_disabled_nobility(setup, monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    rows = online(setup)

    assert all(
        r["nobility"]["rank"] == 0
        for r in rows
    )


def test_presence_expiry(setup):
    _, engine = setup

    assert "knight" in {
        r["user_id"] for r in online(setup)
    }

    with Session(engine) as db:
        row = db.get(
            RoomLivePresence,
            (ROOM, "knight"),
        )

        row.last_seen_at = (
            datetime.now(timezone.utc)
            - timedelta(seconds=60)
        )

        db.commit()

    assert "knight" not in {
        r["user_id"] for r in online(setup)
    }


def test_reconnected_user(setup):
    _, engine = setup

    with Session(engine) as db:
        row = db.get(
            RoomLivePresence,
            (ROOM, "offline"),
        )

        row.last_seen_at = datetime.now(timezone.utc)
        db.commit()

    assert "offline" in {
        r["user_id"] for r in online(setup)
    }
