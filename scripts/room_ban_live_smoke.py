from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request


def request(method: str, path: str, token: str, payload: dict | None = None):
    url = os.environ.get("ERISCHAT_SMOKE_BASE_URL", "http://127.0.0.1:8000/v1") + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            body = response.read().decode()
            return response.status, json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        try:
            parsed = json.loads(body) if body else None
        except json.JSONDecodeError:
            parsed = body
        return exc.code, parsed


def main() -> int:
    base = os.environ.get("ERISCHAT_SMOKE_BASE_URL", "http://127.0.0.1:8000/v1")
    print(f"ErisChat room ban smoke target: {base}")
    _, owner = request("POST", "/users", "", {"nickname": "BanOwner", "avatar": "👑", "gender": "unspecified"})
    _, target = request("POST", "/users", "", {"nickname": "BanTarget", "avatar": "🦊", "gender": "unspecified"})
    owner_token = owner["access_token"]
    target_token = target["access_token"]
    owner_id = owner["user"]["id"]
    target_id = target["user"]["id"]

    status, room = request("POST", "/rooms", owner_token, {"name": "Ban Smoke", "level": 1})
    if status >= 300:
        raise RuntimeError(f"room create failed: HTTP {status} {room}")
    room_id = room["id"]
    for token in (owner_token, target_token):
        status, _ = request("POST", f"/rooms/{room_id}/join", token)
        if status >= 300:
            raise RuntimeError(f"join failed: HTTP {status}")

    ws_target = None
    try:
        from websocket import create_connection
        ws_url = base.replace("http://", "ws://").replace("https://", "wss://")
        ws_target = create_connection(
            f"{ws_url}/ws/rooms/{room_id}?token={target_token}",
            timeout=2,
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
            closed = False
            for attempt in range(5):
                try:
                    ws_target.send(json.dumps({"type": "ping"}))
                    response = ws_target.recv()
                    if response in ("", None):
                        closed = True
                        break
                    print(f"ban revalidation attempt {attempt + 1}: connection still returned data")
                except Exception as exc:
                    closed = True
                    print(f"room WebSocket ban revalidation OK: {exc}")
                    break
                time.sleep(0.05)
            if not closed:
                raise AssertionError("banned room WebSocket remained usable after membership revoke")
            print("room WebSocket ban revalidation OK: server closed the connection")
        finally:
            try:
                ws_target.close()
            except Exception:
                pass

    status, bans = request("GET", f"/rooms/{room_id}/bans", owner_token)
    if status >= 300:
        raise RuntimeError(f"ban list failed: HTTP {status} {bans}")
    if not any(isinstance(row, dict) and row.get("user_id") == target_id for row in bans):
        raise AssertionError("target user missing from ban list")
    status, _ = request("POST", f"/rooms/{room_id}/join", target_token)
    if status != 403:
        raise AssertionError(f"banned user rejoin expected 403, got {status}")
    status, _ = request("DELETE", f"/rooms/{room_id}/bans/{target_id}", owner_token)
    if status >= 300:
        raise RuntimeError(f"unban failed: HTTP {status}")
    status, bans = request("GET", f"/rooms/{room_id}/bans", owner_token)
    if status >= 300:
        raise RuntimeError(f"post-unban ban list failed: HTTP {status} {bans}")
    if any(isinstance(row, dict) and row.get("user_id") == target_id for row in bans):
        raise AssertionError("target user remained in ban list after unban")
    status, _ = request("POST", f"/rooms/{room_id}/join", target_token)
    if status >= 300:
        raise RuntimeError(f"target rejoin after unban failed: HTTP {status}")
    print("LIVE_ROOM_BAN_SMOKE_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
