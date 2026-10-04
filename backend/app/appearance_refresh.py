"""Retire old looks without deleting historical purchases or charging currency."""
import re
from sqlalchemy import select
from .models import User
from .platform_models import VipStatus
from .room_models import Room, RoomWallpaper
from .cosmetics import frame_catalog
from .wallpapers import find


def replacement(key, gender, level, kind):
    if not key:
        return key
    if kind == 'frame':
        item = next((i for i in frame_catalog() if i['asset_key'] == key), None)
        if item and item['gender'] == gender and item['vip_level'] <= level:
            return key
        old_level = item['vip_level'] if item else 0
        if not item and ('vip' in key.lower()):
            digits = re.findall(r'\d+', key.rsplit('/', 1)[-1])
            old_level = int(digits[-1]) if digits else level
        chosen = min(max(old_level, 0), level, 12)
        return f"vip-designs/avatar-frame-{gender}-{chosen if chosen else 'standard'}.svg"
    item = find(key)
    if item and item['gender'] == gender and item['vip_level'] <= level:
        return key
    old_level = item['vip_level'] if item else 0
    if not item and key.startswith('vip_wallpaper_'):
        digits = re.findall(r'\d+', key)
        old_level = int(digits[-1]) if digits else level
    chosen = min(max(old_level, 0), level, 12)
    return f"vip_wallpaper_{gender}_{chosen:02d}" if chosen else f"wallpaper_{gender}_standard"


def refresh_user(db, user, level=None):
    gender = 'male' if user.gender == 'male' else 'female'
    if level is None:
        status = db.get(VipStatus, user.id)
        level = int(status.level or 0) if status else 0
    level = max(0, min(12, level))
    changed = False
    for kind in ('frame', 'wallpaper'):
        column = kind + '_asset'
        old = getattr(user, column)
        new = replacement(old, gender, level, kind)
        if new != old:
            setattr(user, column, new)
            changed = True
    return changed


def refresh_room(db, room, row):
    owner = db.get(User, room.owner_id)
    status = db.get(VipStatus, room.owner_id)
    level = max(0, min(12, int(status.level or 0))) if status else 0
    gender = 'male' if owner and owner.gender == 'male' else 'female'
    row.asset_key = replacement(row.asset_key, gender, level, 'wallpaper')


def migrate_retired_looks(db):
    users = select(User, VipStatus).outerjoin(VipStatus, VipStatus.user_id == User.id)
    for user, status in db.execute(users.execution_options(yield_per=200)):
        refresh_user(db, user, int(status.level or 0) if status else 0)
    for row, room in db.execute(select(RoomWallpaper, Room).join(Room, Room.id == RoomWallpaper.room_id).execution_options(yield_per=200)):
        refresh_room(db, room, row)
    db.commit()
