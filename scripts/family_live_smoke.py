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
    nickname = f"FamilySmoke_{suffix}"

    status, session = request("POST", "/users", {"nickname": nickname, "avatar": "👤", "gender": "male"})
    expect(status, 201, "family smoke registration", session)
    token = session.get("access_token")
    user = session.get("user") or {}
    if not token or not user.get("id"):
        raise AssertionError(f"registration response missing session/user: {session}")

    family_name = f"Smoke Family {suffix}"
    status, created = request("POST", "/families", {"name": family_name}, token)
    expect(status, 200, "family create", created)
    family_id = created.get("id")
    if not family_id or created.get("name") != family_name or created.get("level") != 1:
        raise AssertionError(f"family create mismatch: {created}")

    status, detail = request("GET", f"/families/{family_id}", token=token)
    expect(status, 200, "family detail", detail)
    if detail.get("id") != family_id or detail.get("balance") != 0 or detail.get("level") != 1:
        raise AssertionError(f"family detail mismatch: {detail}")
    if detail.get("capacity") != 30:
        raise AssertionError(f"family level-1 capacity mismatch: {detail}")

    donation = 40_000
    status, donated = request("POST", f"/families/{family_id}/donate", {"amount": donation}, token)
    expect(status, 200, "family donation", donated)
    if donated.get("family_id") != family_id or donated.get("balance") != donation or donated.get("level") != 2:
        raise AssertionError(f"family donation mismatch: {donated}")

    status, detail_after = request("GET", f"/families/{family_id}", token=token)
    expect(status, 200, "family detail after donation", detail_after)
    if detail_after.get("balance") != donation or detail_after.get("level") != 2 or detail_after.get("capacity") != 40:
        raise AssertionError(f"family post-donation mismatch: {detail_after}")

    status, chat = request("GET", f"/families/{family_id}/chat", token=token)
    expect(status, 200, "family chat", chat)
    if chat.get("family_id") != family_id or chat.get("enabled") is not True:
        raise AssertionError(f"family chat mismatch: {chat}")

    print("FAMILY_LIVE_SMOKE_PASS")
    print(f"family_id={family_id}")
    print(f"balance={detail_after.get('balance')} level={detail_after.get('level')} capacity={detail_after.get('capacity')}")


if __name__ == "__main__":
    main()
