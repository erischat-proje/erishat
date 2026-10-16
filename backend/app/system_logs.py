from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "sistemönemliveriler"

LOG_FILES = {
    "admin_login": "admin_girisleri.txt",
    "support": "destek_islemleri.txt",
    "support_view": "destek_goruntulemeleri.txt",
    "report": "sikayetler.txt",
    "application_gap": "uygulamaeksikleri.txt",
    "ban": "ban_islemleri.txt",
    "room_ban": "oda_banlari.txt",
    "chat_ban": "chat_banlari.txt",
    "ghost": "ghost_mode.txt",
    "role": "admin_yetki_islemleri.txt",
    "id_lookup": "id_sorgulari.txt",
    "lidya": "lidya_islemleri.txt",
    "vip": "vip_islemleri.txt",
    "room": "oda_islemleri.txt",
    "user_id": "kullanici_idleri.txt",
    "room_id": "oda_idleri.txt",
    "system": "sistem_islemleri.txt",
}


def record(kind: str, action: str, **details: object) -> None:
    filename = LOG_FILES.get(kind, LOG_FILES["system"])
    ROOT.mkdir(parents=True, exist_ok=True)
    payload = {
        "time": datetime.now(timezone.utc).isoformat(),
        "action": action,
        **details,
    }
    with (ROOT / filename).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")


def ensure_log_files() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for filename in LOG_FILES.values():
        path = ROOT / filename
        if not path.exists():
            path.write_text("", encoding="utf-8")
