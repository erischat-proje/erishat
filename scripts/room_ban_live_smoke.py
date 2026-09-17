#!/usr/bin/env python3
"""Opt-in smoke test for room-scoped ban, list, unban and rejoin flows."""
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
    try:
        with urlopen(Request(API + path, data=body, headers=headers, method=method), timeout=TIMEOUT) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw else {})
    except HTTPError as exc:
        raw = exc.read().decode()
        try:
            data = json.loads(raw)
        except Exception:
            data = {"detail": raw}
        return exc.code, data


def register(label: str) -> tuple[str, str]:
    status, data = request("POST", "/users", payload={
        "nickname": f"Ban Smoke {label}", "avatar": "👤", "gender": "male"
    })
    if status >= 300:
        raise RuntimeError(f"anonymous auth failed: HTTP {status} {data}")
    token = data.get("access_token") or data.get("token")
    user = data.get("user") or {}
    user_id = data.get("user_id") or user.get("id") or data.get("id")
    if not token or not user_id:
        raise RuntimeError(f"anonymous auth response missing token/user id: {data}")
    return token, user_id


def main() -> int:
    print(f"ErisChat room ban smoke target: {API}")
    if not (BASE.startswith("http://127.0.0.1") or BASE.startswith("http://localhost")):
        print("WARNING: non-local target supplied; this is an explicit live smoke run.")

    owner_token, owner_id = register("owner")
    target_token, target_id = register("target")

    status, room = request("POST", "/rooms", owner_token, {"name": "Ban Smoke Room"})
    if status >= 300:
        raise RuntimeError(f"room create failed: HTTP {status} {room}")
    room_id = room.get("id") or room.get("room_id")
    if not room_id:
        raise RuntimeError(f"room id missing: {room}")

    status, _ = request("POST", f"/rooms/{room_id}/join", target_token, {})
    if status >= 300:
        raise RuntimeError(f"target join failed: HTTP {status}")

    ws_target = None
    try:
        import websocket  # type: ignore
        ws_base = BASE.replace("https://", "wss://").replace("http://", "ws://")
        ws_target = websocket.create_connection(
            f"{ws_base}/ws/rooms/{room_id}?token={target_token}",
            timeout=TIMEOUT,
            http_proxy_host=None,
            http_proxy_port=None,
            http_no_proxy=["127.0.0.1", "localhost"],
        )
        history = json.loads(ws_target.recv())
        if history.get("type") != "room_history":
            raise AssertionError(f"unexpected room websocket history: {history}")
        print("target room WebSocket connected before ban")
    except ImportError:
        print("WebSocket ban regression not run: websocket-client unavailable.")

    status, _ = request("POST", f"/rooms/{room_id}/bans", owner_token, {"user_id": target_id})
    if status >= 300:
        raise RuntimeError(f"ban failed: HTTP {status}")

    if ws_target is not None:
        try:
            ws_target.send(json.dumps({"type": "ping"}))
            ws_target.recv()
            raise AssertionError("banned room WebSocket remained usable after membership revoke")
        except AssertionError:
            raise
        except Exception as exc:
            print(f"room WebSocket ban revalidation OK: {exc}")
        finally:
            try:
                ws_target.close()
            except Exception:
                pass

    status, bans = request("GET", f"/rooms/{room_id}/bans", owner_token)
    if status >= 300:
        raise RuntimeError(f"ban list failed: HTTP {status} {bans}")
    items = bans if isinstance(bans, list) else bans.get("bans") or bans.get("items") or []
    if not any((item.get("user_id") if isinstance(item, dict) else item) == target_id for item in items):
        raise AssertionError(f"target missing from room ban list: {bans}")

    status, _ = request("POST", f"/rooms/{room_id}/join", target_token, {})
    if status != 403:
        raise AssertionError(f"banned user could rejoin: HTTP {status}")

    status, _ = request("DELETE", f"/rooms/{room_id}/bans/{target_id}", owner_token)
    if status >= 300:
        raise RuntimeError(f"unban failed: HTTP {status}")

    status, bans_after = request("GET", f"/rooms/{room_id}/bans", owner_token)
    if status >= 300:
        raise RuntimeError(f"post-unban ban list failed: HTTP {status} {bans_after}")
    items_after = bans_after if isinstance(bans_after, list) else bans_after.get("bans") or bans_after.get("items") or []
    if any((item.get("user_id") if isinstance(item, dict) else item) == target_id for item in items_after):
        raise AssertionError(f"target still present after unban: {bans_after}")

    status, _ = request("POST", f"/rooms/{room_id}/join", target_token, {})
    if status >= 300:
        raise AssertionError(f"unbanned user could not rejoin: HTTP {status}")

    print("room ban/list/unban/rejoin invariant OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
