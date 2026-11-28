"""Global directory regression tests against isolated SQLite."""
from datetime import timedelta

from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.models import User
from backend.app.admin_models import RoomAdminBan, UserBan
from backend.app.ban_workflow_models import UserBrowserDevice
from backend.app.discovery_live import LiveConnection, now
from backend.app.global_search import search_directory
from backend.app.platform_models import PrivateProfileSetting, UserFollow, UserPrivacy, VipStatus
from backend.app.room_models import Room
from backend.tests.test_nobility_online_api_v13 import setup


def prepare(engine, monkeypatch):
    monkeypatch.setenv("LIDYACHAT_NOBILITY_ENABLED", "false")
    Base.metadata.create_all(engine, tables=[m.__table__ for m in (RoomAdminBan, UserBan,
        UserBrowserDevice, LiveConnection, PrivateProfileSetting, UserFollow, UserPrivacy, VipStatus)])


def test_offline_id_name_location_independent(setup, monkeypatch):
    _, engine = setup
    prepare(engine, monkeypatch)
    with Session(engine) as db:
        viewer = db.get(User, "owner")
        target = db.get(User, "offline")
        found = search_directory(db, viewer, target.public_id)["items"]
        assert len(found) == 1 and found[0]["user_id"] == target.id
        assert found[0]["online"] is False
        assert search_directory(db, viewer, "OFFLINE")["items"][0]["user_id"] == target.id
        assert search_directory(db, viewer, target.public_id[:-1])["items"] == []


def test_security(setup, monkeypatch):
    _, engine = setup
    prepare(engine, monkeypatch)
    with Session(engine) as db:
        db.add(UserBan(user_id="normal", banned_by="owner", ban_type="device", active=True))
        db.commit()
        viewer = db.get(User, "owner")
        for uid in ("normal", "inactive", "ghost", "blocked", "blocker"):
            target = db.get(User, uid)
            assert search_directory(db, viewer, target.public_id)["items"] == []
            assert search_directory(db, viewer, uid)["items"] == []
        assert search_directory(db, viewer, "%%")["items"] == []
        assert search_directory(db, db.get(User, "banned"), "880000000001", "rooms")["items"] == []
        assert search_directory(db, db.get(User, "adminban"), "880000000001", "rooms")["items"] == []


def test_empty_room_and_pagination(setup, monkeypatch):
    _, engine = setup
    prepare(engine, monkeypatch)
    with Session(engine) as db:
        db.add_all([Room(id="empty"+str(i), public_id=str(881000000000+i),
                         owner_id="owner", name="Global Salon "+str(i)) for i in range(3)])
        db.commit()
        viewer = db.get(User, "owner")
        found = search_directory(db, viewer, "881000000000", "rooms")["items"]
        assert len(found) == 1 and found[0]["member_count"] == 0
        page = search_directory(db, viewer, "Global Salon", "rooms", 2)
        assert len(page["items"]) == 2 and page["has_more"] is True
        second = search_directory(db, viewer, "Global Salon", "rooms", 2, page["next_offset"])
        assert len(second["items"]) == 1 and not second["has_more"]
        assert not ({r["room_id"] for r in page["items"]} & {r["room_id"] for r in second["items"]})


def test_online_presence(setup, monkeypatch):
    _, engine = setup
    prepare(engine, monkeypatch)
    with Session(engine) as db:
        db.add(LiveConnection(id="test-online", user_id="normal", expires_at=now()+timedelta(seconds=60)))
        db.commit()
        assert search_directory(db, db.get(User, "owner"), "normal")["items"][0]["online"] is True
