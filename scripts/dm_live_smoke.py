#!/usr/bin/env python3
"""Opt-in live smoke harness for ErisChat direct-message REST flows.

The script defaults to localhost and never targets production unless
ERISCHAT_SMOKE_BASE_URL is explicitly supplied. It creates two anonymous
sessions, creates a direct conversation, verifies membership isolation, sends a
message, and verifies that the message is readable from the conversation.
"""
from __future__ import annotations

import json
import os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE = os.getenv("ERISCHAT_SMOKE_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
API = BASE + "/v1"
TIMEOUT = float(os.getenv("ERISCHAT_SMOKE_TIMEOUT", "8"))


def request(method: str, path: str, token: str | None = None, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(API + path, data=body, headers=headers, method=method)
    try:
        with urlopen(req, timeout=TIMEOUT) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw else {})
    except HTTPError as exc:
        raw = exc.read().decode()
        try:
            data = json.loads(raw)
        except Exception:
            data = {"detail": raw}
        return exc.code, data


def upload(path: str, token: str, field: str, filename: str, mime: str, data: bytes, fields=None):
    boundary = "----ErisChatSmokeBoundary"
    chunks = []
    for key, value in (fields or {}).items():
        chunks.extend([f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode()])
    chunks.extend([f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n".encode(), data, f"\r\n--{boundary}--\r\n".encode()])
    req = Request(API + path, data=b"".join(chunks), headers={
        "Authorization": f"Bearer {token}", "Content-Type": f"multipart/form-data; boundary={boundary}"}, method="POST")
    try:
        with urlopen(req, timeout=TIMEOUT) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else {}
    except HTTPError as exc:
        raw = exc.read().decode()
        try:
            data = json.loads(raw)
        except Exception:
            data = {"detail": raw}
        return exc.code, data


def register(label: str) -> tuple[str, dict]:
    status, data = request("POST", "/users", payload={
        "nickname": f"DM Smoke {label}", "avatar": "👤", "gender": "male"
    })
    if status >= 300:
        raise RuntimeError(f"anonymous auth failed: HTTP {status} {data}")
    token = data.get("access_token") or data.get("token")
    user = data.get("user") or {}
    user_id = data.get("user_id") or user.get("id") or data.get("id")
    if not token or not user_id:
        raise RuntimeError(f"anonymous auth response missing token/user id: {data}")
    return token, {**data, "user_id": user_id}


def main() -> int:
    print(f"ErisChat DM smoke target: {API}")
    if BASE.startswith("http://127.0.0.1") or BASE.startswith("http://localhost"):
        print("Target is local; production is not touched.")
    else:
        print("WARNING: non-local target supplied; this is an explicit live smoke run.")

    token_a, user_a = register("A")
    token_b, user_b = register("B")
    uid_a = user_a["user_id"]
    uid_b = user_b["user_id"]
    print(f"two sessions created: {uid_a}, {uid_b}")

    status, conversation = request(
        "POST", "/conversations", token_a, {"participant_id": uid_b}
    )
    if status not in (200, 201):
        raise RuntimeError(f"conversation create failed: HTTP {status} {conversation}")
    conversation_id = conversation.get("id")
    members = {item.get("user_id") for item in conversation.get("members", [])}
    if not conversation_id or members != {uid_a, uid_b}:
        raise AssertionError(f"conversation membership invariant failed: {conversation}")
    print(f"conversation created: {conversation_id}")

    status, listed = request("GET", "/conversations", token_a)
    if status >= 300 or not any(item.get("id") == conversation_id for item in listed):
        raise AssertionError(f"conversation missing from sender list: HTTP {status} {listed}")

    status, listed_b = request("GET", "/conversations", token_b)
    if status >= 300 or not any(item.get("id") == conversation_id for item in listed_b):
        raise AssertionError(f"conversation missing from recipient list: HTTP {status} {listed_b}")
    print("conversation visible to both members")

    status, sent = request(
        "POST", f"/messages/{conversation_id}", token_a, {"text": "dm-smoke-message"}
    )
    if status not in (200, 201):
        raise RuntimeError(f"message send failed: HTTP {status} {sent}")
    if sent.get("conversation_id") != conversation_id or sent.get("sender_id") != uid_a:
        raise AssertionError(f"message response invariant failed: {sent}")
    status, unread_list = request("GET", "/conversations", token_b)
    unread_conv = next((item for item in unread_list if item.get("id") == conversation_id), None)
    if status >= 300 or not unread_conv or unread_conv.get("unread_count") != 1:
        raise AssertionError(f"unread count invariant failed: HTTP {status} {unread_list}")
    if not sent.get("created_at"):
        raise AssertionError(f"message timestamp missing: {sent}")

    status, messages = request("GET", f"/messages/{conversation_id}", token_b)
    if status >= 300:
        raise RuntimeError(f"message history failed: HTTP {status} {messages}")
    if not any(item.get("id") == sent.get("id") and item.get("text") == "dm-smoke-message" for item in messages):
        raise AssertionError(f"sent message missing from recipient history: {messages}")
    print("DM send/history invariant OK")

    status, sender_messages = request("GET", f"/messages/{conversation_id}", token_a)
    read_message = next((item for item in sender_messages if item.get("id") == sent.get("id")), None)
    if status >= 300 or not read_message or read_message.get("is_read") is not True:
        raise AssertionError(f"read receipt invariant failed: HTTP {status} {sender_messages}")
    print("unread counter and read receipt invariants OK")

    status, voice = upload(f"/messages/{conversation_id}/media", token_a, "file", "voice.ogg", "audio/ogg", b"OggS" + b"\0" * 64,
        {"media_type": "voice", "view_seconds": "0"})
    if status not in (200, 201) or voice.get("media_type") != "voice":
        raise AssertionError(f"voice message upload failed: HTTP {status} {voice}")
    status, voice_history = request("GET", f"/messages/{conversation_id}", token_b)
    if status >= 300 or not any(m.get("id") == voice.get("id") and m.get("media_type") == "voice" for m in voice_history):
        raise AssertionError(f"voice message missing from recipient history: HTTP {status} {voice_history}")
    print("voice upload and history invariants OK")

    status, pinned = request("POST", f"/conversations/{conversation_id}/pins/{sent['id']}", token_a)
    if status >= 300 or not pinned.get("pinned"):
        raise AssertionError(f"pin failed: HTTP {status} {pinned}")
    status, a_messages = request("GET", f"/messages/{conversation_id}", token_a)
    if status >= 300 or not any(m.get("id") == sent["id"] and m.get("is_pinned") for m in a_messages):
        raise AssertionError(f"pinned message missing from history: {a_messages}")
    status, deleted = request("POST", f"/messages/{conversation_id}/delete", token_b, {"message_ids": [sent["id"]]})
    status, b_messages = request("GET", f"/messages/{conversation_id}", token_b)
    if status >= 300 or deleted.get("scope") != "me" or any(m.get("id") == sent["id"] for m in b_messages):
        raise AssertionError(f"per-user message deletion invariant failed: {deleted} {b_messages}")
    status, a_messages = request("GET", f"/messages/{conversation_id}", token_a)
    if status >= 300 or not any(m.get("id") == sent["id"] for m in a_messages):
        raise AssertionError(f"sender should retain the other user's deleted message: {a_messages}")
    print("pin and per-user deletion invariants OK")

    status, restriction = request("PUT", "/me/message-restriction", token_b,
        {"enabled": True, "gift_key": "Zeytin Dalı"})
    if status >= 300 or not restriction.get("enabled"):
        raise AssertionError(f"message restriction setup failed: HTTP {status} {restriction}")
    status, blocked = request("POST", f"/messages/{conversation_id}", token_a, {"text": "locked-message"})
    if status != 402:
        raise AssertionError(f"restricted sender should be asked for the selected gift: HTTP {status} {blocked}")
    status, gift = request("POST", f"/messages/{conversation_id}/gifts", token_a, {"gift_key": "Zeytin Dalı"})
    if status >= 300 or gift.get("gift_key") != "Zeytin Dalı":
        raise AssertionError(f"unlock gift failed: HTTP {status} {gift}")
    status, unlocked_message = request("POST", f"/messages/{conversation_id}", token_a, {"text": "unlocked-message"})
    if status >= 300 or unlocked_message.get("text") != "unlocked-message":
        raise AssertionError(f"gift did not unlock this sender-recipient pair: HTTP {status} {unlocked_message}")
    token_c, user_c = register("C")
    status, c_conversation = request("POST", "/conversations", token_c, {"participant_id": uid_b})
    status, c_blocked = request("POST", f"/messages/{c_conversation['id']}", token_c, {"text": "separate-sender"})
    if status != 402:
        raise AssertionError(f"unlock must not apply to another sender: HTTP {status} {c_blocked}")
    print("gift unlock and sender-specific restriction invariants OK")

    status, followed = request("POST", f"/users/{uid_a}/follow", token_b, {})
    if status >= 300:
        raise AssertionError(f"story follow setup failed: HTTP {status} {followed}")
    status, story = upload("/stories", token_a, "file", "story.jpg", "image/jpeg", b"\xff\xd8\xff" + b"\0" * 64,
        {"caption": "24h story smoke"})
    if status != 201 or not story.get("expires_at"):
        raise AssertionError(f"story upload failed: HTTP {status} {story}")
    status, visible_stories = request("GET", "/stories", token_b)
    if status >= 300 or not any(item.get("id") == story.get("id") for item in visible_stories):
        raise AssertionError(f"followed story missing from feed: HTTP {status} {visible_stories}")
    status, own_stories = request("GET", "/stories", token_a)
    if status >= 300 or not any(item.get("id") == story.get("id") for item in own_stories):
        raise AssertionError(f"own story missing from feed: HTTP {status} {own_stories}")
    status, deleted_story = request("DELETE", f"/stories/{story['id']}", token_a)
    if status >= 300 or not deleted_story.get("deleted"):
        raise AssertionError(f"own story delete failed: HTTP {status} {deleted_story}")
    print("24h story creation, follower visibility, and deletion invariants OK")

    status, reread = request("GET", f"/messages/{conversation_id}", token_b)
    if status >= 300:
        raise RuntimeError(f"recipient re-read failed: HTTP {status} {reread}")

    print("DM REST smoke completed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"SMOKE FAILED: {exc}")
        raise
