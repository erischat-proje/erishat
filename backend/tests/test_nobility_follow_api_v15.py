from datetime import datetime, timedelta, timezone

import pytest
from fastapi import (
    FastAPI, APIRouter, Depends, Header, HTTPException,
)
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db import Base, get_db
from backend.app.models import User
from backend.app import platform_routes as platform

from backend.app.admin_models import AdminRole, UserBan
from backend.app.ban_workflow_models import UserBrowserDevice
from backend.app.platform_models import (
    UserFollow, UserBlock, PrivateProfileSetting,
)
from backend.app.nobility_models import NobilityMembership
from backend.app.nobility_avatar_models import NobilityAnimatedAvatar

from backend.tests.test_nobility_online_api_v13 import setup


AUTH = {"Authorization": "Bearer owner"}
EMPTY = {"rank": 0, "privileges": []}
KNIGHT = {
    "rank": 1,
    "privileges": ["badge", "frame"],
}


@pytest.fixture
def follow_api(setup, monkeypatch):
    _, engine = setup

    Base.metadata.create_all(
        engine,
        tables=[
            model.__table__ for model in (
                UserFollow,
                PrivateProfileSetting,
                UserBan,
                UserBrowserDevice,
                NobilityAnimatedAvatar,
            )
        ],
    )

    with Session(engine) as db:
        for uid in (
            "knight", "count", "expired",
        ):
            db.add(UserFollow(
                follower_id=uid,
                following_id="owner",
            ))

            db.add(UserFollow(
                follower_id="owner",
                following_id=uid,
            ))

        db.add(UserFollow(
            follower_id="knight2",
            following_id="owner",
        ))

        db.commit()

    def test_db():
        with Session(engine) as db:
            yield db

    def auth(
        db: Session = Depends(get_db),
        authorization: str | None = Header(default=None),
    ):
        if authorization != "Bearer owner":
            raise HTTPException(401)

        return db.get(User, "owner")

    monkeypatch.setattr(
        platform,
        "router",
        APIRouter(prefix="/v1"),
    )

    platform.register_platform_auth(auth)

    app = FastAPI()
    app.dependency_overrides[get_db] = test_db
    app.include_router(platform.router)

    with TestClient(app) as client:
        yield client, engine


def fetch(api, kind="followers"):
    client, _ = api

    response = client.get(
        f"/v1/users/owner/{kind}",
        headers=AUTH,
    )

    assert response.status_code == 200, response.text

    return {
        row["user_id"]: row
        for row in response.json()
    }


@pytest.mark.parametrize(
    "kind", ["followers", "following"]
)
def test_knight_appearance(follow_api, kind):
    rows = fetch(follow_api, kind)

    assert rows["knight"]["nobility"] == KNIGHT


@pytest.mark.parametrize(
    "kind", ["followers", "following"]
)
def test_expired_membership(follow_api, kind):
    rows = fetch(follow_api, kind)

    assert rows["expired"]["nobility"] == EMPTY


@pytest.mark.parametrize(
    "kind", ["followers", "following"]
)
def test_count_appearance(follow_api, kind):
    rows = fetch(follow_api, kind)

    assert rows["count"]["nobility"] == {
        "rank": 2,
        "privileges": ["badge", "frame"],
    }


def test_private_unapproved(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        db.add(PrivateProfileSetting(
            user_id="knight2",
            is_private=True,
        ))
        db.commit()

    assert fetch(follow_api)["knight2"]["nobility"] == EMPTY


def test_private_approved(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        db.add(PrivateProfileSetting(
            user_id="knight",
            is_private=True,
        ))
        db.commit()

    assert fetch(follow_api)["knight"]["nobility"] == KNIGHT


@pytest.mark.parametrize(
    "blocker,blocked",
    [
        ("owner", "knight"),
        ("knight", "owner"),
    ],
)
def test_block_protection(
    follow_api, blocker, blocked
):
    _, engine = follow_api

    with Session(engine) as db:
        db.add(UserBlock(
            blocker_id=blocker,
            blocked_id=blocked,
        ))
        db.commit()

    for kind in ("followers", "following"):
        assert fetch(
            follow_api, kind
        )["knight"]["nobility"] == EMPTY


@pytest.mark.parametrize(
    "role", ["SA", "UA", "FA", "DA"]
)
def test_staff_identity(follow_api, role):
    _, engine = follow_api

    with Session(engine) as db:
        db.add(AdminRole(
            user_id="knight",
            role=role,
        ))
        db.commit()

    row = fetch(follow_api)["knight"]

    assert row["nobility"] == EMPTY


def test_banned_user(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        db.add(UserBan(
            user_id="knight",
            ban_type="account",
            banned_by="owner",
            reason="Test",
            active=True,
        ))
        db.commit()

    assert fetch(follow_api)["knight"]["nobility"] == EMPTY


def test_expiry_after_first_request(follow_api):
    _, engine = follow_api

    assert fetch(follow_api)["knight"]["nobility"] == KNIGHT

    with Session(engine) as db:
        member = db.get(
            NobilityMembership, "knight"
        )

        member.expires_at = (
            datetime.now(timezone.utc)
            - timedelta(seconds=1)
        )

        db.commit()

    assert fetch(follow_api)["knight"]["nobility"] == EMPTY


def test_disabled_system(follow_api, monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    assert fetch(follow_api)["knight"]["nobility"] == EMPTY


@pytest.mark.parametrize(
    "kind", ["followers", "following"]
)
def test_other_list_denied(follow_api, kind):
    client, _ = follow_api

    response = client.get(
        f"/v1/users/knight/{kind}",
        headers=AUTH,
    )

    assert response.status_code == 403


def test_authentication_required(follow_api):
    client, _ = follow_api

    assert client.get(
        "/v1/users/owner/followers"
    ).status_code == 401


@pytest.mark.parametrize("rank", [1, 2, 3, 4])
@pytest.mark.parametrize("kind", ["followers", "following"])
def test_all_nobility_ranks(follow_api, rank, kind):
    _, engine = follow_api

    with Session(engine) as db:
        member = db.get(NobilityMembership, "knight")
        member.rank = rank
        db.commit()

        from backend.app.nobility_policy import utc

        expires = utc(member.expires_at).isoformat()

    expected = {
        "rank": rank,
        "privileges": ["badge", "frame"],
    }

    if rank == 4:
        expected["privileges"].append("super_avatar")
        expected["king_avatar_variant"] = None
        expected["king_expires_at"] = expires

    assert fetch(follow_api, kind)["knight"]["nobility"] == expected


@pytest.mark.parametrize("rank", [2, 3, 4])
def test_higher_rank_block_protection(follow_api, rank):
    _, engine = follow_api

    with Session(engine) as db:
        member = db.get(NobilityMembership, "knight")
        member.rank = rank

        db.add(UserBlock(
            blocker_id="owner",
            blocked_id="knight",
        ))

        db.commit()

    assert fetch(follow_api)["knight"]["nobility"] == EMPTY


@pytest.mark.parametrize("rank", [2, 3, 4])
def test_higher_rank_staff_protection(follow_api, rank):
    _, engine = follow_api

    with Session(engine) as db:
        member = db.get(NobilityMembership, "knight")
        member.rank = rank

        db.add(AdminRole(
            user_id="knight",
            role="DA",
        ))

        db.commit()

    assert fetch(follow_api)["knight"]["nobility"] == EMPTY
