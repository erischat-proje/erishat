from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "backend" / "app" / "main.py"
PLATFORM = ROOT / "backend" / "app" / "platform_routes.py"
FAMILY = ROOT / "backend" / "app" / "family_routes.py"

main = MAIN.read_text(encoding="utf-8")
platform = PLATFORM.read_text(encoding="utf-8")
family = FAMILY.read_text(encoding="utf-8")
for source in (main, platform, family):
    ast.parse(source)

required_main = [
    "from .platform_routes import register_platform_auth, router as platform_router",
    "from .family_routes import register_family_auth, router as family_router",
    "register_platform_auth(current_user)",
    "register_family_auth(current_user)",
    "app.include_router(platform_router)",
    "app.include_router(family_router)",
    '@app.post("/v1/families")',
    "def create_family_production(",
    "chat_conversation_id=conversation_id",
]
for marker in required_main:
    if marker not in main:
        raise SystemExit(f"Missing production family runtime marker: {marker}")

required_family = [
    '@router.get("/families/{family_id}")',
    '@router.get("/families/{family_id}/members")',
    '@router.post("/families/{family_id}/members")',
    '@router.patch("/families/{family_id}/members/{member_user_id}")',
    '@router.delete("/families/{family_id}/members/{member_user_id}")',
    '@router.post("/families/{family_id}/donate")',
    '@router.get("/families/{family_id}/chat")',
    '@router.post("/families/{family_id}/chat/messages")',
]
for marker in required_family:
    if marker not in family:
        raise SystemExit(f"Missing canonical family route: {marker}")

duplicate_family_routes = [
    '@router.get("/families/{family_id}")',
    '@router.post("/families")',
    '@router.post("/families/{family_id}/donate")',
    '@router.get("/families/{family_id}/chat")',
]
for marker in duplicate_family_routes:
    if marker in platform:
        raise SystemExit(f"Duplicate family route remains in platform router: {marker}")

for marker in ["class FamilyCreate", "class FamilyDonationCreate", "FamilyMember", "FamilyDonation"]:
    if marker not in family:
        raise SystemExit(f"Missing family backend marker: {marker}")

print("FAMILY_PRODUCTION_INTEGRITY_PASS canonical_family_router=1 duplicate_platform_routes=0 family_routes=9")
