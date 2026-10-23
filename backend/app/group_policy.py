"""Shared group authorization. Lock order: group, then member/control rows."""
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
from .models import ConversationMember
from .group_models import MessageGroup, GroupRole, GroupSettings, GroupControl, GroupAudit


def locked_group(db, cid, active=True):
    group = db.scalar(select(MessageGroup).where(MessageGroup.conversation_id == cid)
                      .with_for_update().execution_options(populate_existing=True))
    if not group:
        raise HTTPException(404, 'Grup bulunamadı.')
    if active and settings(db, cid).closed:
        raise HTTPException(409, 'Grup kapatılmış. Mesaj geçmişi salt okunur.')
    return group


def settings(db, cid):
    row = db.get(GroupSettings, cid)
    # Do not insert on reads: legacy groups use these defaults until first edit.
    return row or GroupSettings(conversation_id=cid, closed=False, admins_only=False,
        members_can_invite=False, admins_edit_info=True, slow_seconds=0)


def role(db, cid, uid):
    group = db.get(MessageGroup, cid)
    if not group:
        raise HTTPException(404, 'Grup bulunamadı.')
    if not db.scalar(select(ConversationMember.id).where(
            ConversationMember.conversation_id == cid, ConversationMember.user_id == uid)):
        raise HTTPException(403, 'Bu gruba üye değilsiniz.')
    if group.owner_id == uid:
        return 'owner'
    row = db.get(GroupRole, (cid, uid))
    return 'moderator' if row and row.role == 'moderator' else 'member'


def audit(db, cid, uid, action, target=None):
    db.add(GroupAudit(conversation_id=cid, actor_id=uid, action=action, target_id=target))


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def require_write(db, cid, uid, consume=True, check_slow=True):
    if not db.get(MessageGroup, cid):
        return
    locked_group(db, cid)
    who = role(db, cid, uid)
    config = settings(db, cid)
    control = db.get(GroupControl, (cid, uid))
    now = datetime.now(timezone.utc)
    if control and control.banned:
        raise HTTPException(403, 'Bu gruptan yasaklandınız.')
    if who == 'member':
        if config.admins_only:
            raise HTTPException(403, 'Bu grupta yalnızca yöneticiler mesaj gönderebilir.')
        if control and control.muted_until and aware(control.muted_until) > now:
            raise HTTPException(403, 'Grupta mesaj gönderme yetkiniz geçici olarak kısıtlandı.')
        if check_slow and control and config.slow_seconds and control.last_sent_at:
            if (now - aware(control.last_sent_at)).total_seconds() < config.slow_seconds:
                raise HTTPException(429, 'Yavaş mod etkin. Yeni mesaj için bekleyin.')
    if consume:
        if not control:
            control = GroupControl(conversation_id=cid, user_id=uid, banned=False)
            db.add(control)
        control.last_sent_at = now


def require_pin(db, cid, uid):
    if db.get(MessageGroup, cid):
        locked_group(db, cid)
        if role(db, cid, uid) not in ('owner', 'moderator'):
            raise HTTPException(403, 'Grup mesajlarını yalnızca yöneticiler sabitleyebilir.')
