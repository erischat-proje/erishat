#!/usr/bin/env python3
"""Live smoke harness for ErisChat room chat/gift flows.

This script is intentionally opt-in: it never runs against production unless
ERISCHAT_SMOKE_BASE_URL is explicitly supplied. It creates two anonymous
sessions, creates/joins a room, enables chat, exercises the REST gift path,
and reports the expected invariants. WebSocket assertions use the optional
websocket-client package when available.
"""
from __future__ import annotations

import json
import os
import sys
import time
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


def register():
    status, data = request("POST", "/auth/anonymous", payload={})
    if status >= 300:
        raise RuntimeError(f"anonymous auth failed: HTTP {status} {data}")
    token = data.get("access_token") or data.get("token")
    if not token:
        raise RuntimeError(f"anonymous auth response has no token: {data}")
    return token, data


def main() -> int:
    print(f"ErisChat room smoke target: {API}")
    if BASE.startswith("http://127.0.0.1") or BASE.startswith("http://localhost"):
        print("Target is local; production is not touched.")
    else:
        print("WARNING: non-local target supplied; this is an explicit live smoke run.")

    token_a, user_a = register()
    token_b, user_b = register()
    uid_a = user_a.get("user_id") or user_a.get("id")
    uid_b = user_b.get("user_id") or user_b.get("id")
    print(f"two sessions created: {uid_a}, {uid_b}")

    status, room = request("POST", "/rooms", token_a, {"name": "Smoke Room"})
    if status >= 300:
        raise RuntimeError(f"room create failed: HTTP {status} {room}")
    room_id = room.get("id") or room.get("room_id")
    if not room_id:
        raise RuntimeError(f"room create response has no id: {room}")
    print(f"room created: {room_id}")

    for token in (token_a, token_b):
        status, data = request("POST", f"/rooms/{room_id}/join", token, {})
        if status >= 300:
            raise RuntimeError(f"join failed: HTTP {status} {data}")

    status, data = request("PATCH", f"/rooms/{room_id}/chat", token_a, {"enabled": True})
    if status >= 300:
        raise RuntimeError(f"chat enable failed: HTTP {status} {data}")
    print("two members joined and room chat enabled")

    status, catalog = request("GET", f"/rooms/{room_id}/gift-catalog", token_a)
    if status >= 300 or not isinstance(catalog, list) or not catalog:
        raise RuntimeError(f"gift catalog failed: HTTP {status} {catalog}")
    gift = catalog[0]
    gift_key = gift.get("gift_key") or gift.get("key")
    price = int(gift.get("price") or 0)
    if not gift_key or price <= 0:
        raise RuntimeError(f"invalid gift catalog item: {gift}")

    status, before_a = request("GET", "/me", token_a)
    status_b, before_b = request("GET", "/me", token_b)
    if status >= 300 or status_b >= 300:
        raise RuntimeError(f"profile read failed: {before_a} / {before_b}")
    balance_a = int(before_a.get("lidya") or before_a.get("balance") or 0)
    balance_b = int(before_b.get("lidya") or before_b.get("balance") or 0)
    if balance_a < price:
        print(f"SKIP gift assertion: sender balance {balance_a} < gift price {price}")
    else:
        status, sent = request("POST", f"/rooms/{room_id}/gifts", token_a, {
            "recipient_id": uid_b, "gift_key": gift_key, "quantity": 1,
        })
        if status >= 300:
            raise RuntimeError(f"gift send failed: HTTP {status} {sent}")
        status, after_a = request("GET", "/me", token_a)
        status_b, after_b = request("GET", "/me", token_b)
        if status >= 300 or status_b >= 300:
            raise RuntimeError("profile read after gift failed")
        after_balance_a = int(after_a.get("lidya") or after_a.get("balance") or 0)
        after_balance_b = int(after_b.get("lidya") or after_b.get("balance") or 0)
        if after_balance_a != balance_a - price:
            raise AssertionError(f"sender balance invariant failed: {balance_a} -> {after_balance_a}, price={price}")
        expected_recipient = (price * 70) // 100
        if after_balance_b != balance_b + expected_recipient:
            raise AssertionError(f"recipient 70% invariant failed: {balance_b} -> {after_balance_b}, expected +{expected_recipient}")
        status, events = request("GET", f"/rooms/{room_id}/gift-events?limit=10", token_a)
        if status >= 300 or not events:
            raise AssertionError(f"gift event missing: HTTP {status} {events}")
        print(f"gift invariant OK: sender -{price}, recipient +{expected_recipient}, room_gift event present")

    print("REST room smoke completed.")
    try:
        import websocket  # type: ignore
    except ImportError:
        print("WebSocket assertion not run: install websocket-client to enable it.")
        return 0

    ws_base = BASE.replace("https://", "wss://").replace("http://", "ws://")
    url_a = f"{ws_base}/ws/rooms/{room_id}?token={token_a}"
    url_b = f"{ws_base}/ws/rooms/{room_id}?token={token_b}"
    ws_a = websocket.create_connection(url_a, timeout=TIMEOUT)
    ws_b = websocket.create_connection(url_b, timeout=TIMEOUT)
    try:
        history_a = json.loads(ws_a.recv())
        history_b = json.loads(ws_b.recv())
        assert history_a.get("type") == "room_history"
        assert history_b.get("type") == "room_history"
        ws_a.send(json.dumps({"type": "room_chat", "text": "smoke-chat"}))
        received = [json.loads(ws_b.recv()), json.loads(ws_a.recv())]
        if not any(item.get("type") == "room_chat" and item.get("text") == "smoke-chat" for item in received):
            raise AssertionError(f"room chat broadcast missing: {received}")
        print("two-client room WebSocket chat broadcast OK")
    finally:
        ws_a.close()
        ws_b.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"SMOKE FAILED: {exc}", file=sys.stderr)
        raise
