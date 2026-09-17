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

    status, messages = request("GET", f"/messages/{conversation_id}", token_b)
    if status >= 300:
        raise RuntimeError(f"message history failed: HTTP {status} {messages}")
    if not any(item.get("id") == sent.get("id") and item.get("text") == "dm-smoke-message" for item in messages):
        raise AssertionError(f"sent message missing from recipient history: {messages}")
    print("DM send/history invariant OK")

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
