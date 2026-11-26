"""Super-kick API integration tests."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from backend.app.db import Base, get_db
from backend.app.models import User
from backend.app import room_routes as rooms
from backend.app.admin_models import AdminRole
from backend.app.platform_models import UserBlock
from backend.app.room_ban_models import RoomUserBan
from backend.app.relationship_models import Couple, CoupleRoom
from backend.app.room_models import (
    Room, RoomMember, RoomSeat, RoomBan,
    RoomModerator, RoomLivePresence,
)
from backend.app.nobility_super_kick_models import (
    NobilitySuperKickQuota,
    NobilitySuperKickEvent,
)

from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine
from backend.tests.test_nobility_super_kick_entitlement_v11 import activate


ROOM = "test-super-kick-room"
BASE = f"/v1/rooms/{ROOM}/super-kick"
HEADERS = {"Authorization": "Bearer u1"}


@pytest.fixture
def setup(engine, monkeypatch):
    Base.metadata.create_all(
        engine,
        tables=[
            model.__table__ for model in (
                Room, RoomMember, RoomSeat, RoomBan,
                RoomModerator, RoomLivePresence,
                AdminRole, UserBlock, RoomUserBan,
                Couple, CoupleRoom,
                NobilitySuperKickQuota,
                NobilitySuperKickEvent,
            )
        ],
    )

    activate(engine, 4)

    with Session(engine) as db:
        db.add(Room(
            id=ROOM,
            public_id="990000000001",
            owner_id="u1",
            name="Test Odasi",
        ))
        db.flush()

        for uid in ("u1", "u2"):
            db.add(RoomMember(
                room_id=ROOM,
                user_id=uid,
                ghost=False,
            ))

        for number in range(1, 13):
            db.add(RoomSeat(
                room_id=ROOM,
                seat_number=number,
                user_id="u2" if number == 1 else None,
                muted=number == 1,
            ))

        db.add(RoomLivePresence(
            room_id=ROOM,
            user_id="u2",
            last_seen_at=datetime.now(timezone.utc),
        ))
        db.commit()

    sent = []

    async def disconnect(uid, rid, **kwargs):
        sent.append((uid, rid, kwargs))

    def auth(
        db: Session = Depends(get_db),
        authorization: str | None = Header(default=None),
    ):
        if authorization != "Bearer u1":
            raise HTTPException(401, "Unauthorized")
        return db.get(User, "u1")

    def test_db():
        with Session(engine) as db:
            yield db

    def resolve_room(db, room_id):
        room = db.get(Room, room_id)
        if room is None:
            raise HTTPException(404, "Room not found")
        return room

    monkeypatch.setattr(
        rooms, "get_room_or_404", resolve_room
    )

    # Restore router state after each test.
    monkeypatch.setattr(
        rooms.router, "routes", list(rooms.router.routes)
    )
    monkeypatch.setattr(
        rooms.router, "dependencies",
        list(rooms.router.dependencies)
    )
    monkeypatch.setattr(
        rooms, "_room_auth_impl", auth
    )
    monkeypatch.setattr(
        rooms, "_room_disconnect_user", disconnect
    )
    monkeypatch.setattr(
        rooms, "_room_live_control", None
    )

    rooms.register_room_auth(
        auth, disconnect_user=disconnect
    )

    app = FastAPI()
    app.dependency_overrides[get_db] = test_db
    app.include_router(rooms.router)

    with TestClient(app) as client:
        yield client, engine, sent


def post(client, target="u2", key=None):
    return client.post(
        BASE,
        headers=HEADERS,
        json={
            "user_id": target,
            "request_id": key or str(uuid4()),
        },
    )


def count(db, model):
    return db.scalar(
        select(func.count()).select_from(model)
    )


def assert_unchanged(engine):
    with Session(engine) as db:
        assert count(db, NobilitySuperKickQuota) == 0
        assert count(db, NobilitySuperKickEvent) == 0
        assert count(db, RoomMember) == 2
        assert count(db, RoomSeat) == 12
        assert count(db, RoomBan) == 0


def test_success(setup):
    client, engine, sent = setup

    response = post(client)
    assert response.status_code == 200, response.text
    assert response.json()["remaining"] == 4

    with Session(engine) as db:
        assert count(db, RoomMember) == 1
        assert count(db, RoomSeat) == 12
        assert count(db, RoomBan) == 0
        assert count(db, RoomLivePresence) == 0
        assert count(db, NobilitySuperKickEvent) == 1

        seat = db.scalar(
            select(RoomSeat).where(
                RoomSeat.seat_number == 1
            )
        )

        assert seat.user_id is None
        assert seat.muted is False

    assert sent == [
        ("u2", ROOM, {"super_kick": True})
    ]


def test_duplicate(setup):
    client, engine, sent = setup
    key = str(uuid4())

    first = post(client, key=key)
    assert first.status_code == 200, first.text

    second = post(client, key=key)
    assert second.status_code == 200, second.text
    assert second.json()["duplicate"] is True

    with Session(engine) as db:
        quota = db.scalar(
            select(NobilitySuperKickQuota)
        )
        assert quota.used == 1
        assert count(db, NobilitySuperKickEvent) == 1

    assert len(sent) == 1


def test_request_conflict(setup):
    client, engine, sent = setup
    key = str(uuid4())

    assert post(client, key=key).status_code == 200

    response = post(client, target="u1", key=key)
    assert response.status_code == 409

    assert len(sent) == 1


def test_self_protection(setup):
    client, engine, sent = setup

    assert post(client, target="u1").status_code == 403
    assert_unchanged(engine)
    assert sent == []


def test_owner_protection(setup):
    client, engine, sent = setup

    with Session(engine) as db:
        db.get(Room, ROOM).owner_id = "u2"
        db.commit()

    assert post(client).status_code == 403
    assert_unchanged(engine)
    assert sent == []


def test_moderator_protection(setup):
    client, engine, sent = setup

    with Session(engine) as db:
        db.add(RoomModerator(
            room_id=ROOM, user_id="u2"
        ))
        db.commit()

    assert post(client).status_code == 403
    assert_unchanged(engine)
    assert sent == []


@pytest.mark.parametrize("role", ["SA", "UA", "FA", "DA"])
def test_admin_protection(setup, role):
    client, engine, sent = setup

    with Session(engine) as db:
        db.add(AdminRole(
            user_id="u2", role=role
        ))
        db.commit()

    assert post(client).status_code == 403
    assert_unchanged(engine)
    assert sent == []


def test_couple_owner_protection(setup):
    client, engine, sent = setup
    couple_id = str(uuid4())

    with Session(engine) as db:
        db.add(Couple(
            id=couple_id,
            male_id="u1",
            female_id="u2",
            active=True,
        ))
        db.flush()

        db.add(CoupleRoom(
            couple_id=couple_id,
            room_id=ROOM,
        ))
        db.commit()

    assert post(client).status_code == 403
    assert_unchanged(engine)
    assert sent == []


def test_ghost_actor(setup):
    client, engine, sent = setup

    with Session(engine) as db:
        db.add(AdminRole(
            user_id="u1",
            role="DA",
            ghost_mode=True,
        ))
        db.commit()

    assert post(client).status_code == 403
    assert_unchanged(engine)
    assert sent == []


def test_invalid_request(setup):
    client, engine, sent = setup

    response = post(client, key="invalid")
    assert response.status_code == 422

    assert_unchanged(engine)
    assert sent == []


def test_missing_target(setup):
    client, engine, sent = setup

    assert post(
        client, target="missing-user"
    ).status_code == 409

    assert_unchanged(engine)
    assert sent == []


def test_status(setup):
    client, engine, sent = setup

    response = client.get(
        BASE + "/status", headers=HEADERS
    )

    assert response.status_code == 200, response.text
    assert response.json()["allowed"] is True
    assert response.json()["remaining"] == 5

    assert post(client).status_code == 200

    response = client.get(
        BASE + "/status", headers=HEADERS
    )

    assert response.json()["remaining"] == 4
