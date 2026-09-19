import os
import re
import sys
from pathlib import Path
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app.admin_models import AdminRole

BASE = os.getenv("ERISCHAT_SMOKE_BASE_URL", "http://127.0.0.1:8000")
DB = os.getenv("DATABASE_URL", "postgresql+psycopg://erischat:erischat@127.0.0.1:5432/erischat")


def create_user(name: str):
    r = requests.post(f"{BASE}/v1/users", json={"nickname": name, "avatar": "👤", "gender": "male"}, timeout=15)
    r.raise_for_status()
    data = r.json()
    return data["user"], data["access_token"]


def api(token, method, path, **kwargs):
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    r = requests.request(method, BASE + path, headers=headers, timeout=15, **kwargs)
    return r


u1, t1 = create_user("identity-owner")
u2, t2 = create_user("identity-member")
u3, t3 = create_user("identity-sa")
u4, t4 = create_user("identity-ua")
u5, t5 = create_user("identity-da")

assert re.fullmatch(r"\d{10}", u1["public_id"])
assert re.fullmatch(r"\d{10}", u2["public_id"])
assert u1["public_id"] != u2["public_id"]

r = api(t1, "POST", "/v1/rooms", json={"name": "1234567890123456"})
assert r.status_code == 201, r.text
room = r.json()
assert re.fullmatch(r"\d{12}", room["public_id"]), room
assert room["public_id"] not in {u1["public_id"], u2["public_id"]}

r = api(t1, "POST", "/v1/rooms", json={"name": "12345678901234567"})
assert r.status_code == 422, r.text

r = api(t1, "PATCH", f"/v1/rooms/{room['public_id']}/name", json={"name": "abcdefghijklmnop"})
assert r.status_code == 200, r.text
r = api(t1, "PATCH", f"/v1/rooms/{room['public_id']}/name", json={"name": "abcdefghijklmnopq"})
assert r.status_code == 422, r.text

assert api(t1, "GET", "/v1/admin/me").status_code == 403

engine = create_engine(DB)
with Session(engine) as db:
    for uid, role in ((u3["id"], "SA"), (u4["id"], "UA"), (u5["id"], "DA")):
        row = db.get(AdminRole, uid)
        if row:
            row.role = role
        else:
            db.add(AdminRole(user_id=uid, role=role))
    db.commit()

assert api(t3, "POST", f"/v1/admin/users/{u1['id']}/ban", json={"reason": "smoke"}).status_code == 403
assert api(t4, "POST", f"/v1/admin/users/{u1['id']}/ban", json={"reason": "smoke"}).status_code == 200
assert api(t4, "POST", f"/v1/admin/users/{u1['id']}/device-ban", json={"reason": "smoke"}).status_code == 200
assert api(t4, "POST", f"/v1/admin/users/{u1['id']}/chat-ban", json={"reason": "smoke"}).status_code == 200
assert api(t4, "POST", f"/v1/admin/rooms/{room['public_id']}/ban", json={"reason": "smoke"}).status_code == 200
assert api(t4, "DELETE", f"/v1/admin/rooms/{room['public_id']}/ban").status_code == 200
assert api(t4, "GET", f"/v1/admin/users/{u1['id']}").status_code == 403
assert api(t5, "GET", f"/v1/admin/users/{u1['id']}").status_code == 200
assert api(t5, "POST", f"/v1/admin/users/{u1['id']}/lidya/add", json={"amount": 100}).status_code == 200
assert api(t4, "POST", f"/v1/admin/users/{u1['id']}/lidya/add", json={"amount": 100}).status_code == 403

print("system identity/admin smoke: PASS")
