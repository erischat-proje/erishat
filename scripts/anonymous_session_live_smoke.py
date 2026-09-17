from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

BASE = os.getenv("ERISCHAT_SMOKE_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
API = BASE + "/v1"
TIMEOUT = float(os.getenv("ERISCHAT_SMOKE_TIMEOUT", "8"))


def request(method: str, path: str, payload: dict | None = None, token: str | None = None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(API + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {"raw": raw}
        return exc.code, data


def expect(status: int, expected: int, label: str, data) -> None:
    if status != expected:
        raise AssertionError(f"{label}: expected {expected}, got {status}: {data}")


def main() -> None:
    suffix = str(time.time_ns())[-8:]
    nickname = f"Smoke_{suffix}"

    status, session = request("POST", "/users", {"nickname": nickname, "avatar": "👤", "gender": "male"})
    expect(status, 201, "anonymous registration", session)
    token = session.get("access_token")
    user = session.get("user") or {}
    user_id = user.get("id")
    if not token or not user_id:
        raise AssertionError(f"registration response missing session/user: {session}")
    if user.get("nickname") != nickname or user.get("gender") != "male":
        raise AssertionError(f"registration profile mismatch: {user}")

    status, me = request("GET", "/me", token=token)
    expect(status, 200, "profile read", me)
    if me.get("id") != user_id:
        raise AssertionError(f"profile id mismatch: {me}")

    status, public = request("GET", f"/users/{user_id}")
    expect(status, 200, "public profile read", public)
    if public.get("id") != user_id:
        raise AssertionError(f"public profile mismatch: {public}")

    updated_nickname = f"{nickname}_u"
    status, updated = request("PATCH", "/me", {"nickname": updated_nickname, "notifications_enabled": False}, token)
    expect(status, 200, "profile update", updated)
    if updated.get("nickname") != updated_nickname or updated.get("notifications_enabled") is not False:
        raise AssertionError(f"profile update mismatch: {updated}")

    status, toggled = request("PATCH", "/me/notifications", {"notifications_enabled": True}, token)
    expect(status, 200, "notification toggle", toggled)
    if toggled.get("notifications_enabled") is not True:
        raise AssertionError(f"notification toggle mismatch: {toggled}")

    status, logout = request("POST", "/logout", token=token)
    expect(status, 200, "logout", logout)
    if logout.get("revoked") is not True:
        raise AssertionError(f"logout did not revoke session: {logout}")

    status, after_logout = request("GET", "/me", token=token)
    expect(status, 401, "revoked session rejected", after_logout)

    print("ANONYMOUS_SESSION_SMOKE_PASS")
    print(f"user_id={user_id}")


if __name__ == "__main__":
    main()
