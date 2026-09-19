from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = {
    "frontend/erischat-main.html",
    "frontend/room-live.js",
    "frontend/demo-complete-live.js",
    "frontend/demo-extras-live.js",
}

REQUIRED_EXTRAS_MARKERS = {
    "seats": ("seatsDemo", "12 koltuk", "🎤 Mikrofon açık"),
    "music": ("musicDemo", "Oda müzik merkezi", "Gerçek kuyruk"),
    "announcement": ("announcementDemo", "Duyuru yönetimi", "📌 Sabitle"),
    "family": ("familyDemo", "Aile yönetimi + aile sohbeti", "➕ Üye ekle"),
    "store": ("storeDemo", "139 kozmetik", "cosFilter"),
    "profile": ("profileDemo", "👤 Profil + Lidya / Lidya Gem", "Avatarı uygula"),
    "safety": ("safetyDemo", "Bildirim • Güvenlik • Moderasyon", "Engelleme"),
    "onboarding": ("onboardingDemo", "Onboarding", "Anonim"),
}

REQUIRED_COMPLETE_MARKERS = {
    "vip": ("vipDemo", "VIP 1 → VIP 12", "Erkek ödülleri", "Kadın ödülleri"),
    "games": ("gamesDemo", "Oyun merkezi", "Roulette", "4 Kupa"),
    "checklist": ("checklistDemo", "Müşteri demo kontrol listesi", "139 kozmetik vitrini"),
}


def read(path: str) -> str:
    p = ROOT / path
    assert p.is_file() and p.stat().st_size > 0, f"missing/empty demo file: {path}"
    return p.read_text(encoding="utf-8")


def main() -> None:
    missing = [path for path in REQUIRED_FILES if not (ROOT / path).is_file()]
    assert not missing, f"missing required demo files: {missing}"

    extras = read("frontend/demo-extras-live.js")
    complete = read("frontend/demo-complete-live.js")
    room = read("frontend/room-live.js")

    for name, markers in REQUIRED_EXTRAS_MARKERS.items():
        absent = [marker for marker in markers if marker not in extras]
        assert not absent, f"demo extras surface '{name}' missing markers: {absent}"

    for name, markers in REQUIRED_COMPLETE_MARKERS.items():
        absent = [marker for marker in markers if marker not in complete]
        assert not absent, f"demo complete surface '{name}' missing markers: {absent}"

    for script in ("./demo-complete-live.js", "./demo-extras-live.js"):
        assert script in room, f"room-live.js does not load {script}"

    assert "12" in extras, "12-seat demo marker missing"
    assert "VIP 1" in complete and "VIP 12" in complete, "VIP range markers missing"
    assert "139" in extras, "139-cosmetic demo marker missing"

    print(
        "DEMO_SURFACE_INTEGRITY_PASS: "
        f"{len(REQUIRED_EXTRAS_MARKERS)} demo-extras surfaces + "
        f"{len(REQUIRED_COMPLETE_MARKERS)} demo-complete surfaces verified statically"
    )


if __name__ == "__main__":
    main()
