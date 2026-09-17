from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "backend" / "app" / "main.py"
PLATFORM = ROOT / "backend" / "app" / "platform_routes.py"

main = MAIN.read_text(encoding="utf-8")
platform = PLATFORM.read_text(encoding="utf-8")
ast.parse(main)
ast.parse(platform)

required_main = [
    "from .platform_routes import register_platform_auth, router as platform_router",
    "register_platform_auth(current_user)",
    "app.include_router(platform_router)",
]
for marker in required_main:
    if marker not in main:
        raise SystemExit(f"Missing production platform registration marker: {marker}")

required_family = [
    '@router.get("/families/{family_id}")',
    '@router.post("/families")',
    '@router.post("/families/{family_id}/donate")',
    '@router.get("/families/{family_id}/chat")',
]
for marker in required_family:
    if marker not in platform:
        raise SystemExit(f"Missing production family route: {marker}")

for marker in ["class FamilyCreate", "class FamilyDonationCreate", "FamilyMember", "FamilyDonation"]:
    if marker not in platform:
        raise SystemExit(f"Missing family backend marker: {marker}")

print("FAMILY_PRODUCTION_INTEGRITY_PASS platform_router_registered=1 family_routes=4")
