from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock

from app import push_sender


def device(token="test-fcm-token"):
    return SimpleNamespace(token=token, session_hash="session-1")


def session(expires):
    return SimpleNamespace(
        token_hash="session-1",
        expires_at=expires,
        user_id="user-a",
    )


def test_disabled_notifications(monkeypatch):
    monkeypatch.setattr(push_sender, "allowed", lambda *args: False)
    db = Mock()

    result = push_sender.eligible_devices(db, "user-a", "chat-1")

    assert result == []
    db.execute.assert_not_called()


def test_active_session(monkeypatch):
    monkeypatch.setattr(push_sender, "allowed", lambda *args: True)
    db = Mock()
    db.execute.return_value.all.return_value = [
        (device(), session(datetime.now(timezone.utc) + timedelta(days=1)))
    ]

    result = push_sender.eligible_devices(db, "user-a", "chat-1")

    assert result == ["test-fcm-token"]


def test_expired_session(monkeypatch):
    monkeypatch.setattr(push_sender, "allowed", lambda *args: True)
    db = Mock()
    db.execute.return_value.all.return_value = [
        (device(), session(datetime.now(timezone.utc) - timedelta(days=1)))
    ]

    assert push_sender.eligible_devices(db, "user-a", "chat-1") == []


def test_revoked_session(monkeypatch):
    monkeypatch.setattr(push_sender, "allowed", lambda *args: True)
    db = Mock()
    db.execute.return_value.all.return_value = []

    assert push_sender.eligible_devices(db, "user-a", "chat-1") == []


def test_push_disabled_by_default(monkeypatch):
    monkeypatch.delenv("LIDYA_PUSH_ENABLED", raising=False)

    db = Mock()
    assert push_sender.send_dm_push(db, "user-a", "chat-1") == 0
    db.execute.assert_not_called()


def test_no_credentials_does_not_send(monkeypatch):
    monkeypatch.setenv("LIDYA_PUSH_ENABLED", "1")
    monkeypatch.delenv("LIDYA_FIREBASE_SERVICE_ACCOUNT_JSON", raising=False)
    monkeypatch.setattr(
        push_sender, "eligible_devices",
        lambda *args: ["test-fcm-token"]
    )

    api = Mock()
    monkeypatch.setattr(push_sender.requests, "post", api)

    assert push_sender.send_dm_push(Mock(), "user-a", "chat-1") == 0
    api.assert_not_called()
