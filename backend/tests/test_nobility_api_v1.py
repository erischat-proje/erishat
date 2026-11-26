"""Isolated nobility API security tests."""

import pytest
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, Integer
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.db import Base, get_db
from backend.app.models import User
from backend.app.system_data import LidyaLedger
from backend.app import admin_models
from backend.app.nobility_models import (
    NobilityMembership,
    NobilityRankConfig,
    NobilityPointsLedger,
)
from backend.app.nobility_routes import register_auth


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "true"
    )

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    ledger_id = LidyaLedger.__table__.c.id

    monkeypatch.setattr(
        ledger_id,
        "type",
        ledger_id.type.with_variant(Integer(), "sqlite"),
    )

    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            LidyaLedger.__table__,
            Base.metadata.tables["admin_roles"],
            NobilityMembership.__table__,
            NobilityRankConfig.__table__,
            NobilityPointsLedger.__table__,
        ],
    )

    now = datetime.now(timezone.utc)

    with Session(engine) as db:
        db.add_all([
            User(
                id="u1", public_id="990001",
                _nickname="Test 1", is_active=True,
            ),
            User(
                id="u2", public_id="990002",
                _nickname="Test 2", is_active=True,
            ),
        ])
        db.flush()

        db.add(NobilityRankConfig(
            rank=4,
            required_points=3_200_000,
            renewal_points=800_000,
            duration_days=30,
            enabled=True,
        ))

        db.add_all([
            NobilityMembership(
                user_id="u1",
                rank=4,
                points=1500,
                started_at=now-timedelta(days=1),
                expires_at=now+timedelta(days=1),
            ),
            NobilityMembership(
                user_id="u2",
                rank=4,
                points=200,
                started_at=now-timedelta(days=2),
                expires_at=now-timedelta(days=1),
            ),
        ])

        db.add_all([
            NobilityPointsLedger(
                event_key="test-u1",
                user_id="u1",
                amount=1500,
                source="test",
            ),
            NobilityPointsLedger(
                event_key="test-u2",
                user_id="u2",
                amount=200,
                source="test",
            ),
        ])

        db.commit()

    def test_db():
        with Session(engine) as db:
            yield db

    def test_auth(
        authorization: str | None = Header(default=None)
    ):
        tokens = {
            "Bearer test-u1": "u1",
            "Bearer test-u2": "u2",
        }

        uid = tokens.get(authorization)

        if not uid:
            raise HTTPException(401, "Unauthorized")

        with Session(engine) as db:
            return db.get(User, uid)

    app = FastAPI()
    app.dependency_overrides[get_db] = test_db
    app.include_router(register_auth(test_auth))

    try:
        with TestClient(app) as c:
            yield c
    finally:
        engine.dispose()


H1 = {"Authorization": "Bearer test-u1"}
H2 = {"Authorization": "Bearer test-u2"}
BASE = "/v1/nobility"


@pytest.mark.parametrize(
    "path", ["catalog", "me", "history"]
)
def test_unauthorized(client, path):
    assert client.get(
        f"{BASE}/{path}"
    ).status_code == 401


def test_active_rank(client):
    r = client.get(BASE+"/me", headers=H1)
    assert r.status_code == 200
    data = r.json()
    assert data["rank"] == 4
    assert data["points"] == "1500"
    assert len(data["privileges"]) == 16


def test_expired_rank(client):
    data = client.get(
        BASE+"/me", headers=H2
    ).json()

    assert data["rank"] == 0
    assert data["active"] is False
    assert data["privileges"] == []


def test_account_isolation(client):
    data = client.get(
        BASE+"/me?user_id=u1",
        headers=H2,
    ).json()

    assert data["points"] == "200"


def test_history_isolation(client):
    data = client.get(
        BASE+"/history?user_id=u1",
        headers=H2,
    ).json()

    assert len(data["items"]) == 1
    assert data["items"][0]["amount"] == "200"
    assert "event_key" not in data["items"][0]


def test_disabled_system(client, monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    data = client.get(
        BASE+"/me", headers=H1
    ).json()

    assert data["rank"] == 0
    assert data["enabled"] is False
    assert data["privileges"] == []


def test_catalog(client):
    data = client.get(
        BASE+"/catalog", headers=H1
    ).json()

    assert len(data["ranks"]) == 4
    assert len(data["privileges"]) == 16

    assert [
        len(r["privileges"])
        for r in data["ranks"]
    ] == [6, 8, 11, 16]


def test_invalid_pagination(client):
    for query in (
        "limit=0",
        "limit=51",
        "offset=-1",
        "offset=10001",
    ):
        assert client.get(
            BASE+"/history?"+query,
            headers=H1,
        ).status_code == 422


@pytest.mark.parametrize(
    "method", ["POST", "PUT", "PATCH", "DELETE"]
)
def test_write_blocked(client, method):
    assert client.request(
        method,
        BASE+"/me",
        headers=H1,
        json={"rank":4, "points":999999},
    ).status_code == 405
