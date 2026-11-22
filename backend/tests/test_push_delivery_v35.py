import json
from unittest.mock import Mock
from types import SimpleNamespace

from app import push_sender


def test_fcm_http_v1_request(monkeypatch):
    monkeypatch.setenv("LIDYA_PUSH_ENABLED", "1")
    monkeypatch.setenv(
        "LIDYA_FIREBASE_SERVICE_ACCOUNT_JSON",
        json.dumps({"project_id": "lidyachat-test"})
    )

    monkeypatch.setattr(
        push_sender,
        "eligible_devices",
        lambda *args: ["test-device-token"]
    )

    class FakeCredentials:
        token = "mock-oauth-access-token"

        def refresh(self, request):
            pass

    monkeypatch.setattr(
        push_sender.service_account.Credentials,
        "from_service_account_info",
        lambda *args, **kwargs: FakeCredentials()
    )

    calls = []

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return SimpleNamespace(ok=True, status_code=200)

    monkeypatch.setattr(push_sender.requests, "post", fake_post)

    result = push_sender.send_dm_push(
        Mock(), "user-a", "conversation-123"
    )

    assert result == 1
    assert len(calls) == 1

    url, kwargs = calls[0]

    assert url == (
        "https://fcm.googleapis.com/v1/projects/"
        "lidyachat-test/messages:send"
    )

    assert kwargs["headers"]["Authorization"] == (
        "Bearer mock-oauth-access-token"
    )

    message = kwargs["json"]["message"]
    assert message["token"] == "test-device-token"
    assert message["data"]["kind"] == "dm_message"
    assert message["data"]["conversation_id"] == "conversation-123"

    # Never expose private DM contents in the push payload.
    assert "notification" not in message
    assert "text" not in str(message)
    assert "body" not in str(message)


def test_fcm_rejection_is_not_success(monkeypatch):
    monkeypatch.setenv("LIDYA_PUSH_ENABLED", "1")
    monkeypatch.setenv(
        "LIDYA_FIREBASE_SERVICE_ACCOUNT_JSON",
        '{"project_id":"lidyachat-test"}'
    )
    monkeypatch.setattr(
        push_sender,
        "eligible_devices",
        lambda *args: ["test-device-token"]
    )

    class FakeCredentials:
        token = "mock-access-token"

        def refresh(self, request):
            pass

    monkeypatch.setattr(
        push_sender.service_account.Credentials,
        "from_service_account_info",
        lambda *args, **kwargs: FakeCredentials()
    )

    monkeypatch.setattr(
        push_sender.requests,
        "post",
        lambda *args, **kwargs: SimpleNamespace(
            ok=False, status_code=403
        )
    )

    assert push_sender.send_dm_push(
        Mock(), "user-a", "conversation-123"
    ) == 0
