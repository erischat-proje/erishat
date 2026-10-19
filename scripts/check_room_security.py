from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROOM_ROUTES = ROOT / "backend" / "app" / "room_routes.py"
MAIN = ROOT / "backend" / "app" / "main.py"

REQUIRED_ROOM_MARKERS = {
    "room-scoped ban lookup": 'RoomBan.room_id == room.id, RoomBan.user_id == user.id',
    "ban list endpoint": '@router.get("/{room_id}/bans")',
    "ban removes membership": 'delete(RoomMember).where(RoomMember.room_id == room.id, RoomMember.user_id == payload.user_id)',
    "ban removes seat": 'delete(RoomSeat).where(RoomSeat.room_id == room.id, RoomSeat.user_id == payload.user_id)',
    "ban removes moderator": 'delete(RoomModerator).where(RoomModerator.room_id == room.id, RoomModerator.user_id == payload.user_id)',
    "unban is room-scoped": 'delete(RoomBan).where(RoomBan.room_id == room.id, RoomBan.user_id == banned_user_id)',
    "staff requires membership": 'not moderator or not is_member(db, room.id, user.id)',
}

WS_MARKERS = {
    "websocket ban check": 'RoomBan.room_id == room_id, RoomBan.user_id == user.id',
    "websocket room membership": 'RoomMember.room_id == room_id, RoomMember.user_id == user.id',
}


def check(path: Path, markers: dict[str, str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [name for name, marker in markers.items() if marker not in text]


def main() -> int:
    missing = check(ROOM_ROUTES, REQUIRED_ROOM_MARKERS) + check(MAIN, WS_MARKERS)
    if missing:
        print("Room security check FAILED")
        for item in missing:
            print(f"  missing: {item}")
        return 1
    print("Room security check OK")
    print("  room-scoped ban/list/unban: present")
    print("  ban cleanup: member/seat/moderator: present")
    print("  active staff membership: present")
    print("  room WebSocket ban/member checks: present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
