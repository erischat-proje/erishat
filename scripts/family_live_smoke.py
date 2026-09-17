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


def member_items(data) -> list[dict]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("members"), list):
        return data["members"]
    raise AssertionError(f"family member list response shape mismatch: {data}")


def main() -> None:
    suffix = str(time.time_ns())[-8:]
    nickname = f"FamilySmoke_{suffix}"
    member_nickname = f"FamilyMember_{suffix}"

    status, session = request("POST", "/users", {"nickname": nickname, "avatar": "👤", "gender": "male"})
    expect(status, 201, "family smoke registration", session)
    token = session.get("access_token")
    user = session.get("user") or {}
    owner_id = user.get("id")
    if not token or not owner_id:
        raise AssertionError(f"registration response missing session/user: {session}")

    status, member_session = request("POST", "/users", {"nickname": member_nickname, "avatar": "🐼", "gender": "female"})
    expect(status, 201, "family member registration", member_session)
    member = member_session.get("user") or {}
    member_id = member.get("id")
    if not member_id:
        raise AssertionError(f"member registration response missing user: {member_session}")

    family_name = f"Smoke Family {suffix}"
    status, created = request("POST", "/families", {"name": family_name}, token)
    expect(status, 200, "family create", created)
    family_id = created.get("id")
    if not family_id or created.get("name") != family_name or created.get("level") != 1:
        raise AssertionError(f"family create mismatch: {created}")

    status, detail = request("GET", f"/families/{family_id}", token=token)
    expect(status, 200, "family detail", detail)
    if detail.get("id") != family_id or detail.get("balance") != 0 or detail.get("level") != 1 or detail.get("capacity") != 30:
        raise AssertionError(f"family detail mismatch: {detail}")

    status, members = request("GET", f"/families/{family_id}/members", token=token)
    expect(status, 200, "family member list", members)
    if not any(item.get("user_id") == owner_id and item.get("role") == "member" for item in member_items(members)):
        raise AssertionError(f"owner missing from member list: {members}")

    status, invited = request("POST", f"/families/{family_id}/members", {"user_id": member_id}, token)
    expect(status, 201, "family member invite", invited)
    if invited.get("user_id") != member_id or invited.get("role") != "member":
        raise AssertionError(f"family member invite mismatch: {invited}")

    status, promoted = request("PATCH", f"/families/{family_id}/members/{member_id}", {"user_id": member_id, "role": "admin"}, token)
    expect(status, 200, "family member role", promoted)
    if promoted.get("user_id") != member_id or promoted.get("role") != "admin":
        raise AssertionError(f"family member role mismatch: {promoted}")

    status, members_after_role = request("GET", f"/families/{family_id}/members", token=token)
    expect(status, 200, "family member list after role", members_after_role)
    if not any(item.get("user_id") == member_id and item.get("role") == "admin" for item in member_items(members_after_role)):
        raise AssertionError(f"promoted member missing from list: {members_after_role}")

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

    message_text = f"Family smoke message {suffix}"
    status, message = request("POST", f"/families/{family_id}/chat/messages", {"text": message_text}, token=token)
    expect(status, 201, "family chat message", message)
    if not message.get("sender_id") or message.get("text") != message_text:
        raise AssertionError(f"family chat message mismatch: {message}")

    status, removed = request("DELETE", f"/families/{family_id}/members/{member_id}", token=token)
    expect(status, 200, "family member remove", removed)
    if removed.get("removed") is not True or removed.get("user_id") != member_id:
        raise AssertionError(f"family member remove mismatch: {removed}")

    status, members_final = request("GET", f"/families/{family_id}/members", token=token)
    expect(status, 200, "family member list final", members_final)
    if any(item.get("user_id") == member_id for item in member_items(members_final)):
        raise AssertionError(f"removed member still present: {members_final}")

    print("FAMILY_LIVE_SMOKE_PASS")
    print(f"family_id={family_id}")
    print(f"owner_id={owner_id} invited={member_id} removed=1")
    print(f"balance={detail_after.get('balance')} level={detail_after.get('level')} capacity={detail_after.get('capacity')}")
    print("member_list=1 invite=1 role=1 remove=1 chat_message=1")


if __name__ == "__main__":
    main()
