"""A reversible, server-owned management appearance; never changes account keys."""
from sqlalchemy import case, column, select, table, event
from sqlalchemy.orm import Session, object_session
from fastapi import HTTPException

ROLES = ('SA', 'UA', 'FA', 'DA')
NAME = 'ErisChatYönetim'
AVATAR = '/role-icons/management-v1/light/avatar.png'
FRAME = '/role-icons/management-v1/light/frame.png'
STAFF = table('admin_roles', column('user_id'), column('role'))
CACHE = 'eris_staff_identity_roles'


def role_for(user):
    db = object_session(user)
    if db is None:
        return user.__dict__.get('_staff_role_hint')
    with db.no_autoflush:
        if CACHE not in db.info:
            db.info[CACHE] = dict(db.execute(select(STAFF.c.user_id, STAFF.c.role)).all())
        roles = dict(db.info[CACHE])
        for item in (*db.new, *db.dirty):
            if getattr(type(item), '__tablename__', None) == 'admin_roles':
                roles[item.user_id] = item.role
        for item in db.deleted:
            if getattr(type(item), '__tablename__', None) == 'admin_roles':
                roles.pop(item.user_id, None)
        value = roles.get(user.id)
        value = value if value in ROLES else None
        user.__dict__['_staff_role_hint'] = value
        return value


def effective(user, stored, replacement):
    return replacement if role_for(user) else getattr(user, stored)


def expression(cls, stored, replacement, label):
    staff = select(STAFF.c.user_id).where(STAFF.c.user_id == cls.id, STAFF.c.role.in_(ROLES)).correlate(cls).exists()
    return case((staff, replacement), else_=getattr(cls, stored)).label(label)


def require_editable(user):
    if role_for(user):
        raise HTTPException(403, detail='Yönetim kimliği sabittir. Kullanıcı adı, avatar ve çerçeve değiştirilemez.')


def set_value(user, stored, value):
    require_editable(user)
    setattr(user, stored, value)


def inventory():
    return [{'type':kind, 'asset_key':key, 'asset':key, 'name':name,
             'source':'management', 'level':0, 'equip_key':key, 'equipped':True,
             'locked':True, 'compatible':True}
            for kind,key,name in [('avatar',AVATAR,'ErisChat Yönetim Logosu'),('frame',FRAME,'SA · UA · FA · DA Yönetim Çerçevesi')]]


def install_load_hints(user_class):
    # Detached websocket/background objects keep the confirmed appearance only.
    @event.listens_for(user_class, 'load', restore_load_context=True)
    def loaded(user, context):
        role_for(user)
    @event.listens_for(user_class, 'refresh', restore_load_context=True)
    def refreshed(user, context, attrs):
        role_for(user)


@event.listens_for(Session, 'after_transaction_end')
def clear_transaction_cache(db, transaction):
    if transaction.parent is None:
        db.info.pop(CACHE, None)


def public_identity(user):
    role = role_for(user)
    return {'nickname':user.nickname, 'avatar':user.avatar,
            'avatar_asset':user.avatar_asset, 'frame_asset':user.frame_asset,
            'admin_role':role, 'management_locked':bool(role),
            'management_badges':list(ROLES) if role else []}


@event.listens_for(Session, 'after_flush_postexec')
def clear_flushed_roles(db, flush_context):
    # A flushed grant/revocation is no longer present in db.new/db.deleted.
    db.info.pop(CACHE, None)
