"""Authoritative feature restrictions for messaging, gifts and public profiles."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from sqlalchemy import select, or_
from .admin_models import ChatBan, UserBan

ISTANBUL = ZoneInfo("Europe/Istanbul")


def active_ban(db, user_id, chat=False):
    model = ChatBan if chat else UserBan
    return db.scalar(select(model).where(model.user_id == user_id, model.active.is_(True),
        or_(model.expires_at.is_(None), model.expires_at > datetime.now(timezone.utc)))
        .order_by(model.id.desc()))


def ban_until(ban):
    if ban.expires_at is None or getattr(ban, 'ban_type', '') == 'device':
        return 'Bu özelliğiniz kalıcı olarak engellenmiştir.'
    return 'Bu özelliğiniz uygulama yönetimi tarafından engelleniyor. Banınız ' + ban.expires_at.astimezone(ISTANBUL).strftime('%d.%m.%Y %H:%M') + ' tarihinde kalkacaktır.'


def profile_notice(ban):
    if ban.expires_at is None or ban.ban_type == 'device':
        return 'Bu kullanıcı Topluluk kuralları ihlalinden dolayı yasaklanmıştır.'
    return 'Bu kullanıcı Topluluk kurallarımızı ihlal ettiği için ' + ban.expires_at.astimezone(ISTANBUL).strftime('%d.%m.%Y %H:%M') + ' tarihine kadar uygulamadan yasaklanmıştır.'


def require_feature(db, sender_id, recipient_ids=()):
    ban = active_ban(db, sender_id) or active_ban(db, sender_id, chat=True)
    if ban: raise HTTPException(status_code=403, detail=ban_until(ban))
    for target_id in recipient_ids:
        if active_ban(db, target_id) or active_ban(db, target_id, chat=True):
            raise HTTPException(status_code=403, detail='Bu kişi topluluk kurallarımıza uymadığı için bu özellik engellenmiştir.')
