"""Transactional management audit and durable staff notifications."""
import json
from sqlalchemy import select
from .admin_models import AdminRole, AdminAuditLog
from .models import User
from .platform_models import Notification

def audit(db,user,action,details,target=None):
    role=db.get(AdminRole,user.id)
    db.add(AdminAuditLog(admin_id=user.id,action=action,target_user_id=target,
        details=json.dumps({**details,'actor_role':role.role if role else None},ensure_ascii=False)))

def notify(db,recipients,title,body,exclude=None):
    ids={uid for uid in recipients if uid and uid!=exclude}
    if not ids:return
    active=db.scalars(select(User.id).where(User.id.in_(ids),User.is_active.is_(True)))
    for uid in active:db.add(Notification(user_id=uid,kind='management',title=title,body=body))

def reviewers(db):
    return db.scalars(select(AdminRole.user_id).where(AdminRole.role.in_(['FA','DA']))).all()
