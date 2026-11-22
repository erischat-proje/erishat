from types import SimpleNamespace

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.models import User
from app.push_device_models import PushDevice
from app.push_device_routes import register_auth


TOKEN = "firebase-test-token-" + "X" * 80


def make_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    User.__table__.create(engine)
    PushDevice.__table__.create(engine)

    app = FastAPI()

    def test_db():
        with Session(engine) as db:
            yield db

    def test_auth(x_test_user: str = Header(default="")):
        if not x_test_user:
            raise HTTPException(401, "Oturum gerekli")
        return SimpleNamespace(id=x_test_user)

    app.dependency_overrides[get_db] = test_db
    app.include_router(register_auth(test_auth))

    return TestClient(app), engine


def test_login_required():
    client, _ = make_client()
    response = client.post(
        "/v1/push/device", json={"token": TOKEN}
    )
    assert response.status_code == 401


def test_register_device():
    client, engine = make_client()
    response = client.post(
        "/v1/push/device",
        headers={"X-Test-User": "user-a"},
        json={"token": TOKEN},
    )
    assert response.status_code == 200
    assert response.json()["registered"] is True

    with Session(engine) as db:
        device = db.scalar(select(PushDevice))
        assert device.user_id == "user-a"


def test_account_switch():
    client, engine = make_client()

    for user in ("user-a", "user-b"):
        response = client.post(
            "/v1/push/device",
            headers={"X-Test-User": user},
            json={"token": TOKEN},
        )
        assert response.status_code == 200

    with Session(engine) as db:
        devices = db.scalars(select(PushDevice)).all()
        assert len(devices) == 1
        assert devices[0].user_id == "user-b"


def test_other_user_cannot_delete_device():
    client, engine = make_client()

    client.post(
        "/v1/push/device",
        headers={"X-Test-User": "user-a"},
        json={"token": TOKEN},
    )

    response = client.request(
        "DELETE",
        "/v1/push/device",
        headers={"X-Test-User": "user-b"},
        json={"token": TOKEN},
    )
    assert response.status_code == 200

    with Session(engine) as db:
        assert db.scalar(select(PushDevice)) is not None


def test_owner_can_delete_device():
    client, engine = make_client()

    client.post(
        "/v1/push/device",
        headers={"X-Test-User": "user-a"},
        json={"token": TOKEN},
    )

    response = client.request(
        "DELETE",
        "/v1/push/device",
        headers={"X-Test-User": "user-a"},
        json={"token": TOKEN},
    )
    assert response.status_code == 200

    with Session(engine) as db:
        assert db.scalar(select(PushDevice)) is None


def test_invalid_token_rejected():
    client, _ = make_client()

    response = client.post(
        "/v1/push/device",
        headers={"X-Test-User": "user-a"},
        json={"token": "123"},
    )
    assert response.status_code == 422
