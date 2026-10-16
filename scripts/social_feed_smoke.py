#!/usr/bin/env python3
"""Opt-in local smoke test for ErisChat posts and story deletion."""
from __future__ import annotations

import json
import os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE = os.getenv("ERISCHAT_SMOKE_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
API = BASE + "/v1"
TIMEOUT = float(os.getenv("ERISCHAT_SMOKE_TIMEOUT", "8"))


def call(method: str, path: str, token: str | None = None, payload=None, multipart=None):
    headers = {}
    body = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        body = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    if multipart is not None:
        boundary = "----ErisChatSocialSmokeBoundary"
        chunks = []
        for key, value in multipart.get("fields", {}).items():
            chunks.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode())
        file = multipart.get("file")
        if file:
            name, mime, data = file
            chunks.extend([f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: {mime}\r\n\r\n".encode(), data, b"\r\n"])
        chunks.append(f"--{boundary}--\r\n".encode())
        body = b"".join(chunks)
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    req = Request(API + path, data=body, headers=headers, method=method)
    try:
        with urlopen(req, timeout=TIMEOUT) as response:
            raw = response.read()
            try:
                return response.status, json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                return response.status, raw
    except HTTPError as exc:
        raw = exc.read()
        try:
            data = json.loads(raw)
        except Exception:
            data = raw.decode(errors="replace")
        return exc.code, data


def register(label: str) -> tuple[str, str]:
    status, data = call("POST", "/users", payload={"nickname": f"Social Smoke {label}", "avatar": "👤", "gender": "male"})
    if status not in (200, 201):
        raise RuntimeError(f"registration failed: HTTP {status} {data}")
    token = data.get("access_token") or data.get("token")
    user = data.get("user") or {}
    user_id = data.get("user_id") or user.get("id") or data.get("id")
    if not token or not user_id:
        raise RuntimeError(f"registration response missing identity: {data}")
    return token, user_id


def main() -> int:
    print(f"ErisChat social smoke target: {API}")
    if not (BASE.startswith("http://127.0.0.1") or BASE.startswith("http://localhost")):
        print("WARNING: non-local target supplied; this creates temporary test users and content.")
    a, _ = register("A")
    b, _ = register("B")
    jpg = b"\xff\xd8\xff" + b"social-smoke-image"

    status, post = call("POST", "/posts", a, multipart={"fields": {"caption": "first post"}, "file": ("test.jpg", "image/jpeg", jpg)})
    if status != 201 or not post.get("id"):
        raise AssertionError(f"post create failed: HTTP {status} {post}")
    post_id = post["id"]
    status, feed = call("GET", "/posts/feed?mode=for-you", a)
    if status != 200 or not any(row.get("id") == post_id for row in feed):
        raise AssertionError(f"new post missing in discover feed: HTTP {status} {feed}")
    status, image = call("GET", post["media_url"], a)
    if status != 200 or not isinstance(image, bytes) or not image.startswith(b"\xff\xd8\xff"):
        raise AssertionError(f"post photo retrieval failed: HTTP {status}")
    status, edited = call("PATCH", f"/posts/{post_id}", a, multipart={"fields": {"caption": "edited post"}})
    if status != 200 or edited.get("caption") != "edited post":
        raise AssertionError(f"post edit failed: HTTP {status} {edited}")
    status, _ = call("PATCH", f"/posts/{post_id}", b, multipart={"fields": {"caption": "not mine"}})
    if status != 403:
        raise AssertionError(f"non-owner edited post: HTTP {status}")
    status, deleted = call("DELETE", f"/posts/{post_id}", a)
    if status != 200 or not deleted.get("deleted"):
        raise AssertionError(f"post delete failed: HTTP {status} {deleted}")
    status, mine = call("GET", "/me/posts", a)
    if status != 200 or any(row.get("id") == post_id for row in mine):
        raise AssertionError(f"deleted post remains in profile: HTTP {status} {mine}")
    print("post create, image, discover, edit, ownership, delete and profile invariants OK")

    status, story = call("POST", "/stories", a, multipart={"fields": {"caption": "story smoke"}, "file": ("test.jpg", "image/jpeg", jpg)})
    if status != 201 or not story.get("id"):
        raise AssertionError(f"story create failed: HTTP {status} {story}")
    status, _ = call("DELETE", f"/stories/{story['id']}", b)
    if status != 403:
        raise AssertionError(f"non-owner deleted story: HTTP {status}")
    status, deleted_story = call("DELETE", f"/stories/{story['id']}", a)
    if status != 200 or not deleted_story.get("deleted"):
        raise AssertionError(f"owner story delete failed: HTTP {status} {deleted_story}")
    print("story owner delete and non-owner protection invariants OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
