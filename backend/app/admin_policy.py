"""Explicit LidyaChat management capabilities. Higher rank does not imply every duty."""
from fastapi import HTTPException

ROLE_PERMISSIONS = {
    'SA': frozenset({'support.read_assigned', 'support.reply_assigned', 'evidence.submit'}),
    'UA': frozenset({'support.read_assigned', 'support.reply_assigned', 'evidence.submit', 'report.review', 'ban.request'}),
    'FA': frozenset({'support.read_assigned', 'support.reply_assigned', 'evidence.submit', 'report.review', 'ban.decide', 'ban.appeal_decide', 'announcement.publish'}),
    'DA': frozenset({'support.read_assigned', 'support.reply_assigned', 'evidence.submit', 'report.review', 'ban.request', 'ban.decide', 'ban.appeal_decide', 'announcement.publish', 'finance.manual_adjust', 'finance.audit', 'staff.manage', 'user.sensitive_lookup', 'ban.undo', 'security.admin'}),
}

def has_permission(role: str | None, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, frozenset())

def require_permission(role: str | None, permission: str) -> None:
    if not has_permission(role, permission):
        raise HTTPException(status_code=403, detail='Bu islem icin yetkiniz yok')

def may_decide(requester_id: str, target_id: str | None, reviewer_id: str, previous_reviewer_id: str | None = None) -> bool:
    return reviewer_id not in {requester_id, target_id, previous_reviewer_id}
