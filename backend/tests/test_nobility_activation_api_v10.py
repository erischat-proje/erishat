"""PostgreSQL nobility activation HTTP tests."""

from uuid import uuid4

import pytest
from nobility_confirmation_helpers import confirmed_payload
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app import admin_models
from backend.app.db import get_db
from backend.app.models import User
from backend.app.nobility_routes import register_auth

from test_nobility_postgres_v1 import scoped_db
from test_nobility_activation_v10 import (
    engine,
    fund,
    verify,
)


BASE = "/v1/nobility"
URL = BASE + "/activate"

H1 = {"Authorization": "Bearer test-u1"}
H2 = {"Authorization": "Bearer test-u2"}


def payload(rank=1, key=None):
    return {
        "rank": rank,
        "request_id": key or str(uuid4()),
    }


@pytest.fixture
def client(engine):
    def test_db():
        with Session(engine) as db:
            yield db

    def test_auth(
        authorization: str | None = Header(default=None),
    ):
        tokens = {
            "Bearer test-u1": "u1",
            "Bearer test-u2": "u2",
        }

        uid = tokens.get(authorization)

        if not uid:
            raise HTTPException(401, "Unauthorized")

        with Session(engine) as db:
            user = db.get(User, uid)

            if user is None:
                raise HTTPException(401, "Unauthorized")

            return user

    app = FastAPI()
    app.dependency_overrides[get_db] = test_db
    app.include_router(register_auth(test_auth))

    with TestClient(app) as c:
        yield c


@pytest.mark.parametrize("rank,cost", [
    (1, 400_000),
    (2, 800_000),
    (3, 1_600_000),
    (4, 3_200_000),
])
def test_activation(client, engine, rank, cost):
    fund(engine, cost + 100)

    r = client.post(
        URL,
        headers=H1,
        json=confirmed_payload(client, rank, action="activate"),
    )

    assert r.status_code == 200, r.text

    data = r.json()

    assert data["ok"] is True
    assert data["action"] == "activate"
    assert data["applied"] is True
    assert data["duplicate"] is False
    assert data["membership"]["rank"] == rank
    assert data["membership"]["points"] == "100"

    verify(engine, rank, 100, 1)


def test_unauthorized(client, engine):
    fund(engine, 800_000)

    r = client.post(URL, json=payload())

    assert r.status_code == 401
    verify(engine, 0, 800_000, 0)


def test_invalid_token(client, engine):
    fund(engine, 800_000)

    r = client.post(
        URL,
        headers={"Authorization": "Bearer invalid"},
        json=payload(),
    )

    assert r.status_code == 401
    verify(engine, 0, 800_000, 0)


def test_duplicate(client, engine):
    fund(engine, 800_000)

    body = confirmed_payload(client, action="activate")

    first = client.post(URL, headers=H1, json=body)
    second = client.post(URL, headers=H1, json=body)

    assert first.status_code == 200
    assert second.status_code == 200

    assert first.json()["applied"] is True
    assert second.json()["applied"] is False
    assert second.json()["duplicate"] is True

    verify(engine, 1, 400_000, 1)


def test_insufficient(client, engine):
    fund(engine, 399_999)

    r = client.post(URL, headers=H1, json=confirmed_payload(client, action="activate"))

    assert r.status_code == 409
    assert r.json()["detail"] == "insufficient_points"

    verify(engine, 0, 399_999, 0)


def test_account_isolation(client, engine):
    fund(engine, 800_000)

    r = client.post(
        URL + "?user_id=u1",
        headers=H2,
        json=confirmed_payload(client, action="activate", headers=H2),
    )

    assert r.status_code == 409
    verify(engine, 0, 800_000, 0)


@pytest.mark.parametrize("field", [
    "user_id",
    "points",
    "price",
    "duration_days",
    "privileges",
    "expires_at",
    "vip",
])
def test_forged_fields(client, engine, field):
    fund(engine, 800_000)

    body = confirmed_payload(client, action="activate")
    body[field] = "forged"

    r = client.post(URL, headers=H1, json=body)

    assert r.status_code == 422
    verify(engine, 0, 800_000, 0)


@pytest.mark.parametrize("rank", [
    True, "1", 1.0, 0, 5, None,
])
def test_invalid_rank(client, engine, rank):
    fund(engine, 800_000)

    r = client.post(
        URL,
        headers=H1,
        json=payload(rank),
    )

    assert r.status_code == 422
    verify(engine, 0, 800_000, 0)


def test_invalid_request_id(client, engine):
    fund(engine, 800_000)

    r = client.post(
        URL,
        headers=H1,
        json=payload(key="invalid"),
    )

    assert r.status_code == 422
    verify(engine, 0, 800_000, 0)


def test_inactive_account(client, engine):
    fund(engine, 800_000)

    with Session(engine) as db:
        user = db.get(User, "u1")
        user.is_active = False
        db.commit()

    r = client.post(URL, headers=H1, json=payload())

    assert r.status_code == 403
    verify(engine, 0, 800_000, 0)


def test_disabled(client, engine, monkeypatch):
    fund(engine, 800_000)

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    r = client.post(URL, headers=H1, json=payload())

    assert r.status_code == 503
    verify(engine, 0, 800_000, 0)


def test_rank_conflict(client, engine):
    fund(engine, 2_000_000)

    key = str(uuid4())

    first = client.post(
        URL, headers=H1, json=confirmed_payload(client, 1, key, action="activate")
    )

    second = client.post(
        URL, headers=H1, json=confirmed_payload(client, 2, key, action="activate")
    )

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["detail"] == "request_conflict"

    verify(engine, 1, 1_600_000, 1)


def test_me_after_activation(client, engine):
    fund(engine, 800_000)

    r = client.post(URL, headers=H1, json=confirmed_payload(client, action="activate"))

    assert r.status_code == 200

    me = client.get(BASE + "/me", headers=H1)

    assert me.status_code == 200
    assert me.json()["rank"] == 1
    assert me.json()["points"] == "400000"
    assert me.json()["active"] is True

    verify(engine, 1, 400_000, 1)


def test_second_activation_blocked(client, engine):
    fund(engine, 1_200_000)

    first = client.post(URL, headers=H1, json=confirmed_payload(client, action="activate"))
    second = client.post(URL, headers=H1, json=confirmed_payload(client, action="activate"))

    assert first.status_code == 200
    assert second.status_code == 409

    assert (
        second.json()["detail"]
        == "active_membership_exists"
    )

    verify(engine, 1, 800_000, 1)
