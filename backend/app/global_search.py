"""Authenticated directory; independent of location discovery."""
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import and_, case, func, or_, select

from .admin_models import AdminRole, RoomAdminBan, UserBan
from .ban_workflow_models import UserBrowserDevice
from .discovery_live import LiveConnection, now, utc
from .models import User
from .nobility_follow_appearance import knight_follow_appearances
from .platform_models import PrivateProfileSetting, UserBlock, UserFollow, UserPrivacy, VipStatus
from .room_ban_models import RoomUserBan
from .room_models import Room, RoomBan, RoomLivePresence, RoomMember
from .staff_identity import ROLES


def _blocked(uid):
    return select(case((UserBlock.blocker_id == uid, UserBlock.blocked_id),
                       else_=UserBlock.blocker_id)).where(
        or_(UserBlock.blocker_id == uid, UserBlock.blocked_id == uid))


def _banned(at):
    live = and_(UserBan.active.is_(True), or_(UserBan.expires_at.is_(None), UserBan.expires_at > at))
    direct = select(UserBan.user_id).where(live)
    owners = select(UserBan.user_id).where(live, UserBan.ban_type == "device")
    hashes = select(UserBrowserDevice.device_hash).where(UserBrowserDevice.user_id.in_(owners))
    shared = select(UserBrowserDevice.user_id).where(UserBrowserDevice.device_hash.in_(hashes))
    return direct.union(shared)


def _match(query, model, name, q):
    if q.isascii() and q.isdigit():
        return query.where(model.public_id == q).order_by(model.id)
    if len(q) < 2:
        raise HTTPException(422, "İsim aramak için en az 2 karakter gir.")
    folded = func.lower(func.replace(func.replace(name, "İ", "i"), "I", "i"))
    folded = func.replace(folded, "ı", "i")
    needle = q.replace("İ", "i").replace("I", "i").lower().replace("ı", "i")
    return query.where(folded.contains(needle, autoescape=True)).order_by(
        case((folded == needle, 0), (folded.startswith(needle, autoescape=True), 1), else_=2), folded, model.id)


def search_directory(db, viewer, q, kind="people", limit=20, offset=0):
    q = q.strip()
    if not q or len(q) > 80:
        raise HTTPException(422, "Geçerli bir isim veya ID gir.")
    at = now()
    blocked = _blocked(viewer.id)
    banned = _banned(at)
    staff = select(AdminRole.user_id).where(AdminRole.role.in_(ROLES))
    if kind == "people":
        query = select(User).where(User.is_active.is_(True), User.id.not_in(blocked),
                                    User.id.not_in(banned), User.id.not_in(staff))
        users = list(db.scalars(_match(query, User, User._nickname, q).offset(offset).limit(limit+1)))
        more = len(users) > limit
        users = users[:limit]
        ids = [u.id for u in users]
        appearances = knight_follow_appearances(db, viewer.id, ids, at)
        online = set(db.scalars(select(LiveConnection.user_id).where(
            LiveConnection.user_id.in_(ids), LiveConnection.expires_at > at)))
        rows = []
        for u in users:
            private = db.get(PrivateProfileSetting, u.id)
            can_view = (u.id == viewer.id or not (private and private.is_private)
                        or bool(db.scalar(select(UserFollow.id).where(UserFollow.follower_id == viewer.id,
                                                                     UserFollow.following_id == u.id).limit(1))))
            privacy = db.get(UserPrivacy, u.id)
            vip = db.get(VipStatus, u.id)
            vip_visible = can_view and not (privacy and (privacy.hide_vip or privacy.hide_vip_badge))
            rows.append(dict(user_id=u.id, public_id=u.public_id, nickname=u.nickname,
                avatar=u.avatar, avatar_asset=u.avatar_asset, frame_asset=u.frame_asset,
                online=u.id in online, vip_level=int(vip.level or 0) if vip and vip_visible else 0,
                nobility=appearances.get(u.id) if can_view else None))
    elif kind == "rooms":
        personal_bans = select(RoomUserBan.room_id).where(RoomUserBan.user_id == viewer.id,
            RoomUserBan.active.is_(True), or_(RoomUserBan.expires_at.is_(None), RoomUserBan.expires_at > at))
        old_bans = select(RoomBan.room_id).where(RoomBan.user_id == viewer.id)
        admin_bans = select(RoomAdminBan.room_id).where(RoomAdminBan.active.is_(True),
            or_(RoomAdminBan.expires_at.is_(None), RoomAdminBan.expires_at > at))
        query = select(Room).join(User, User.id == Room.owner_id).where(
            Room.is_active.is_(True), User.is_active.is_(True),
            Room.owner_id.not_in(blocked), Room.owner_id.not_in(banned), Room.owner_id.not_in(staff),
            Room.id.not_in(personal_bans), Room.id.not_in(old_bans), Room.id.not_in(admin_bans))
        rooms = list(db.scalars(_match(query, Room, Room.name, q).offset(offset).limit(limit+1)))
        more = len(rooms) > limit
        rooms = rooms[:limit]
        ids = [r.id for r in rooms]
        owner_ids = [r.owner_id for r in rooms]
        owners = {u.id: u for u in db.scalars(select(User).where(User.id.in_(owner_ids)))}
        appearances = knight_follow_appearances(db, viewer.id, owner_ids, at)
        counts = dict(db.execute(select(RoomLivePresence.room_id, func.count(RoomLivePresence.user_id))
            .join(User, User.id == RoomLivePresence.user_id)
            .where(RoomLivePresence.room_id.in_(ids), RoomLivePresence.last_seen_at >= at - timedelta(seconds=48),
                   User.is_active.is_(True), User.id.not_in(banned),
                   User.id.not_in(select(AdminRole.user_id).where(AdminRole.ghost_mode.is_(True))),
                   ~select(RoomMember.id).where(RoomMember.room_id == RoomLivePresence.room_id,
                       RoomMember.user_id == RoomLivePresence.user_id, RoomMember.ghost.is_(True))
                       .correlate(RoomLivePresence).exists())
            .group_by(RoomLivePresence.room_id)).all())
        rows = []
        for r in rooms:
            owner = owners[r.owner_id]
            rows.append(dict(room_id=r.id, public_id=r.public_id, name=r.name, level=r.level,
                member_count=counts.get(r.id, 0),
                locked=bool(r.locked and (not r.lock_expires_at or utc(r.lock_expires_at) > at)),
                owner_avatar=owner.avatar, owner_avatar_asset=owner.avatar_asset,
                owner_frame_asset=owner.frame_asset, owner_nobility=appearances.get(owner.id)))
    else:
        raise HTTPException(422, "Geçersiz arama türü.")
    more = more and offset+limit <= 10000
    return {"items": rows, "has_more": more, "next_offset": offset+limit if more else None}
