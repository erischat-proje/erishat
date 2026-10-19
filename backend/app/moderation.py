"""Authoritative feature restrictions for messaging, gifts and public profiles."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from sqlalchemy import select, or_
from .admin_models import ChatBan, UserBan

ISTANBUL = ZoneInfo("Europe/Istanbul")


def active_ban(db, user_id, chat=False):
    model = ChatBan if chat else UserBan
    query=select(model).where(model.user_id==user_id,model.active.is_(True),
        or_(model.expires_at.is_(None),model.expires_at>datetime.now(timezone.utc)))
    query=query.order_by(model.expires_at.desc().nulls_first(),model.id.desc()) if chat else query.order_by(model.id.desc())
    direct=db.scalar(query)
    if direct or chat: return direct
    from .ban_workflow_models import UserBrowserDevice
    hashes=select(UserBrowserDevice.device_hash).where(UserBrowserDevice.user_id==user_id)
    owners=select(UserBrowserDevice.user_id).where(UserBrowserDevice.device_hash.in_(hashes))
    return db.scalar(select(UserBan).where(UserBan.user_id.in_(owners),UserBan.ban_type=='device',UserBan.active.is_(True),
        or_(UserBan.expires_at.is_(None),UserBan.expires_at>datetime.now(timezone.utc))).order_by(UserBan.id.desc()))


def ban_until(ban):
    if ban.expires_at is None:
        return 'Bu özelliğiniz kalıcı olarak engellenmiştir.'
    return 'Bu özelliğiniz uygulama yönetimi tarafından engelleniyor. Banınız ' + ban.expires_at.astimezone(ISTANBUL).strftime('%d.%m.%Y %H:%M') + ' tarihinde kalkacaktır.'


def profile_notice(ban):
    if ban.expires_at is None:
        return 'Bu kullanıcı Topluluk kuralları ihlalinden dolayı yasaklanmıştır.'
    return 'Bu kullanıcı Topluluk kurallarımızı ihlal ettiği için ' + ban.expires_at.astimezone(ISTANBUL).strftime('%d.%m.%Y %H:%M') + ' tarihine kadar uygulamadan yasaklanmıştır.'


def require_feature(db, sender_id, recipient_ids=()):
    ban = active_ban(db, sender_id)
    if ban: raise HTTPException(status_code=403, detail=ban_until(ban))
    require_chat_write(db,sender_id)
    for target_id in recipient_ids:
        if active_ban(db, target_id) or active_ban(db, target_id, chat=True):
            raise HTTPException(status_code=403, detail='Bu kişi topluluk kurallarımıza uymadığı için bu özellik engellenmiştir.')


def chat_ban_detail(db,ban):
    from math import ceil
    from .chat_ban_models import ChatBanRequestBinding
    from .admin_models import BanApproval
    request=db.scalar(select(BanApproval).join(ChatBanRequestBinding,ChatBanRequestBinding.approval_id==BanApproval.id).where(ChatBanRequestBinding.ban_id==ban.id))
    end=ban.expires_at
    if end and end.tzinfo is None:end=end.replace(tzinfo=timezone.utc)
    start=ban.created_at
    if start and start.tzinfo is None:start=start.replace(tzinfo=timezone.utc)
    days=request.days if request else max(1,ceil((end-start).total_seconds()/86400)) if end and start else None
    duration='Süresiz' if end is None else f'{days} gün'
    message=(f'{duration} süre boyunca chat ve mesaj işlemleriniz yasaklanmıştır. '
        +(f'{end.astimezone(ISTANBUL).strftime("%d.%m.%Y %H:%M")} tarihine kadar beklemek zorundasınız. ' if end else 'Sohbet yasağınız süresizdir. ')
        +'ErisChat moderasyonu olarak keyifli zaman geçirmenizi diliyoruz.')
    return {'code':'chat_dm_banned','message':message,'duration_days':days,'duration_label':duration,'expires_at':end.isoformat() if end else None}


def require_chat_write(db,user_id):
    ban=active_ban(db,user_id,chat=True)
    if ban:raise HTTPException(403,detail=chat_ban_detail(db,ban))
