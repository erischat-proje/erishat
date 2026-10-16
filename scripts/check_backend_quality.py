from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "backend" / "app" / "main.py"
SESSION = ROOT / "backend" / "app" / "session.py"
CONFIG = ROOT / "backend" / "app" / "config.py"


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    main_text = MAIN.read_text(encoding="utf-8")
    session_text = SESSION.read_text(encoding="utf-8")
    config_text = CONFIG.read_text(encoding="utf-8")

    migration_calls = re.findall(r'ALTER TABLE users ADD COLUMN IF NOT EXISTS ([a-z_]+)', main_text)
    duplicates = sorted({name for name in migration_calls if migration_calls.count(name) > 1})
    if duplicates:
        errors.append("duplicate user migration columns: " + ", ".join(duplicates))

    if "secrets.token_urlsafe(48)" not in session_text:
        errors.append("session tokens are not generated with secrets.token_urlsafe(48)")
    if "hashlib.sha256" not in session_text or "token_hash" not in session_text:
        errors.append("session tokens are not stored/checked through a SHA-256 hash")
    if "expires_at" not in session_text or "expires_at <= now" not in session_text:
        errors.append("session expiry validation is missing")

    if 'cors_origins: str = "*"' in config_text:
        warnings.append("CORS default is wildcard; production should set CORS_ORIGINS explicitly")

    print("ErisChat backend quality check")
    for item in warnings:
        print(f"WARNING: {item}")
    for item in errors:
        print(f"ERROR: {item}")
    print(f"result={'FAIL' if errors else 'PASS_WITH_WARNINGS' if warnings else 'PASS'}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
