from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.family_routes import register_family_auth, router as family_router
from app.platform_models import FamilyMember


EXPECTED = {
    ("GET", "/v1/families/{family_id}"),
    ("POST", "/v1/families"),
    ("GET", "/v1/families/{family_id}/members"),
    ("POST", "/v1/families/{family_id}/members"),
    ("PATCH", "/v1/families/{family_id}/members/{member_user_id}"),
    ("DELETE", "/v1/families/{family_id}/members/{member_user_id}"),
    ("POST", "/v1/families/{family_id}/donate"),
    ("GET", "/v1/families/{family_id}/chat"),
    ("POST", "/v1/families/{family_id}/chat/messages"),
}


def main() -> None:
    register_family_auth(lambda: None)
    app = FastAPI()
    app.include_router(family_router)
    actual = {(method, route.path) for route in app.routes for method in (route.methods or set()) if route.path.startswith("/v1/families")}
    missing = EXPECTED - actual
    if missing:
        raise SystemExit(f"Missing family routes: {sorted(missing)}")

    role_column = FamilyMember.__table__.c.role
    length = getattr(role_column.type, "length", None)
    if length != 16:
        raise SystemExit(f"Unexpected family member role column length: {length}")

    print(f"FAMILY_ROUTES_INTEGRITY_PASS routes={len(actual)} role_length={length}")


if __name__ == "__main__":
    main()
