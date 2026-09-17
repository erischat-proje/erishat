from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "backend" / "app" / "main.py"
PLATFORM = ROOT / "backend" / "app" / "platform_routes.py"
FAMILY = ROOT / "backend" / "app" / "family_routes.py"


def read_and_parse(path: Path) -> tuple[str, ast.Module]:
    source = path.read_text(encoding="utf-8")
    return source, ast.parse(source)


main, _ = read_and_parse(MAIN)
platform, platform_tree = read_and_parse(PLATFORM)
family, family_tree = read_and_parse(FAMILY)


def has_route(tree: ast.Module, method: str, path: str) -> bool:
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            target = decorator.func
            if not isinstance(target, ast.Attribute):
                continue
            if not isinstance(target.value, ast.Name) or target.value.id != "router":
                continue
            if target.attr != method or not decorator.args:
                continue
            first = decorator.args[0]
            if isinstance(first, ast.Constant) and first.value == path:
                return True
    return False


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

required_family_routes = [
    ("get", "/families/{family_id}"),
    ("get", "/families/{family_id}/members"),
    ("post", "/families/{family_id}/members"),
    ("patch", "/families/{family_id}/members/{member_user_id}"),
    ("delete", "/families/{family_id}/members/{member_user_id}"),
    ("post", "/families/{family_id}/donate"),
    ("get", "/families/{family_id}/chat"),
    ("post", "/families/{family_id}/chat/messages"),
]
for method, path in required_family_routes:
    if not has_route(family_tree, method, path):
        raise SystemExit(f"Missing canonical family route: {method.upper()} {path}")

duplicate_family_routes = [
    ("get", "/families/{family_id}"),
    ("post", "/families"),
    ("post", "/families/{family_id}/donate"),
    ("get", "/families/{family_id}/chat"),
]
for method, path in duplicate_family_routes:
    if has_route(platform_tree, method, path):
        raise SystemExit(f"Duplicate family route remains in platform router: {method.upper()} {path}")

for marker in ["class FamilyCreate", "class FamilyDonationCreate", "FamilyMember", "FamilyDonation"]:
    if marker not in family:
        raise SystemExit(f"Missing family backend marker: {marker}")

print("FAMILY_PRODUCTION_INTEGRITY_PASS canonical_family_router=1 duplicate_platform_routes=0 family_routes=8+production_create")
