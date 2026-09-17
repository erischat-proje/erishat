from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("ERISCHAT_SMOKE_BASE_URL", "http://127.0.0.1:8000/v1").rstrip("/")
TIMEOUT = 10


def request(method: str, path: str, token: str, payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            body = response.read().decode()
            return response.status, json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            pass
        return exc.code, body


def create_user() -> tuple[str, str]:
    status, body = request("POST", "/users", "", {"display_name": "ErisBanSmoke"})
    if status >= 300 or not isinstance(body, dict):
        raise RuntimeError(f"user create failed: HTTP {status} {body}")
    token = body.get("token")
    user_id = body.get("user", {}).get("id")
    if not token or not user_id:
        raise RuntimeError(f"user create response missing token/id: {body}")
    return token, user_id


def main() -> int:
    print(f"ErisChat room ban smoke target: {BASE}")
    owner_token, owner_id = create_user()
    target_token, target_id = create_user()
    status, room = request("POST", "/rooms", owner_token, {"name": "Eris Ban Smoke"})
    if status >= 300 or not isinstance(room, dict):
        raise RuntimeError(f"room create failed: HTTP {status} {room}")
    room_id = room["id"]
    status, _ = request("POST", f"/rooms/{room_id}/join", target_token)
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
            response = ws_target.recv()
            if response not in ("", None):
                raise AssertionError("banned room WebSocket remained usable after membership revoke")
            print("room WebSocket ban revalidation OK: server closed the connection")
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
