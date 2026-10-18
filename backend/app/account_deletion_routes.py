"""OTP-gated user deletion. Fail closed if DB constraints prevent complete deletion."""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, MetaData, Table, and_, or_, delete, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .db import get_db
from .models import User, AuthOTP, AuthIdentity
from .session import UserSession
from .otp import create_otp, verify_otp
from .otp_delivery import send_email_otp
from .admin_routes import require_role, resolve_admin_user
from .system_logs import record
from .admin_models import AdminRole

router=APIRouter(tags=['account-deletion'])
_current_user=None

def bind_auth(dependency):
    global _current_user
    _current_user=dependency
    install()

def authenticated():
    if _current_user is None: raise RuntimeError('Authentication not configured')
    return _current_user

class Confirm(BaseModel):
    code: str=Field(pattern=r'^\d{6}$')

def account_email(db,user):
    rows=list(db.scalars(select(AuthIdentity).where(AuthIdentity.user_id==user.id,AuthIdentity.provider=='email',AuthIdentity.verified_at.is_not(None))))
    if rows:return rows[0].identifier
    return None

def delete_user(db: Session, user: User):
    """Remove user-owned relational rows in one transaction, fail closed on unsafe schemas.

    Reflects the *deployed* database FK graph instead of assuming ORM cascades.
    Shared conversations and other members are retained. User-owned messages
    and membership rows are removed. Unknown ownership schemas fail closed.
    """
    from sqlalchemy.exc import SQLAlchemyError

    try:
        db.flush()
        engine = db.get_bind()
        metadata = MetaData()
        metadata.reflect(bind=engine)
        tables = metadata.tables
        user_table = tables.get('users')
        if user_table is None:
            raise RuntimeError('users tablosu bulunamadı')

        # Resolve FK links dynamically: schemas can differ between releases.
        incoming = {}
        for child in tables.values():
            for fk in child.foreign_key_constraints:
                if not fk.elements:
                    continue
                parent = fk.elements[0].column.table
                incoming.setdefault(parent.name, []).append((child, fk))

        uid = user.id
        visited = set()
        def cascade(table, condition, ancestors=()):
            # All descendants are removed BEFORE their parent. A cycle is unsafe.
            if table.name in ancestors:
                raise RuntimeError('Döngüsel FK bağımlılığı: ' + ' > '.join(ancestors+(table.name,)))
            key = (table.name, str(condition))
            if key in visited:
                return
            visited.add(key)
            for child, fk in incoming.get(table.name, []):
                if child.name == 'users':
                    raise RuntimeError('Silme işlemi başka kullanıcı hesabını etkileyebilir')
                clauses = []
                for element in fk.elements:
                    local = element.parent
                    remote = element.column
                    clauses.append(local == remote)
                # EXISTS correlates child FK values to selected parent rows.
                from sqlalchemy import exists
                matched = exists(select(1).select_from(table).where(and_(condition, *clauses)))
                cascade(child, matched, ancestors+(table.name,))
            db.execute(delete(table).where(condition))

        # Never delete a shared conversation solely because one member leaves.
        # If the schema owns conversations through a user FK, refuse automatic
        # deletion: a separate, explicitly reviewed migration is required.
        conversations = tables.get('conversations')
        if conversations is not None:
            for fk in conversations.foreign_key_constraints:
                if any(e.column.table.name == 'users' for e in fk.elements):
                    raise RuntimeError('Konuşma sahipliği şeması elle incelenmeli')

        # Everything else referencing this user (messages in other conversations,
        # reactions, follows, privacy, sessions, auth, roles, purchases, etc.).
        cascade(user_table, user_table.c.id == uid)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(409, 'Hesap güvenli biçimde tamamen silinemedi; hiçbir değişiklik kaydedilmedi.') from exc


def install():
    # Routes use the exact authenticated dependency injected by the main app.
    router.routes.clear()
    from fastapi import Depends
    # ERISCHAT_ACCOUNT_OTP_REQUEST_DIAGNOSTICS_V1
    @router.post('/v1/me/account-deletion/request')
    def request(db:Session=Depends(get_db),user:User=Depends(_current_user)):
        email=account_email(db,user)
        if not email:raise HTTPException(409,'Önce hesabınıza doğrulanmış e-posta ekleyin.')
        try: otp,code=create_otp(db,'email',email,'delete-account:'+user.id)
        except ValueError as e:raise HTTPException(429,str(e)) from e
        try:send_email_otp(email,code,'delete-account')
        except Exception as e:
            db.delete(otp);db.commit();raise HTTPException(503,'Doğrulama e-postası gönderilemedi. E-posta servisinin Gmail/SMTP ayarlarını kontrol edin.') from e
        return {'accepted':True}
    @router.post('/v1/me/account-deletion/confirm')
    def confirm(payload:Confirm,db:Session=Depends(get_db),user:User=Depends(_current_user)):
        email=account_email(db,user)
        if not email:raise HTTPException(409,'Doğrulanmış e-posta bulunamadı.')
        otp=db.scalar(select(AuthOTP).where(AuthOTP.provider=='email',AuthOTP.identifier==email,AuthOTP.purpose=='delete-account:'+user.id,AuthOTP.consumed_at.is_(None)).order_by(AuthOTP.created_at.desc()))
        if otp is None or not verify_otp(db,otp,payload.code):raise HTTPException(400,'Kod geçersiz veya süresi dolmuş.')
        delete_user(db,user)
        return {'deleted':True}
    @router.delete('/v1/admin/account-deletion/{user_id}')
    def admin_delete(user_id:str,db:Session=Depends(get_db),user:User=Depends(_current_user)):
        require_role(db,user,'DA')
        target=resolve_admin_user(db,user_id)
        if target is None:raise HTTPException(404,'Kullanıcı bulunamadı.')
        if target.id==user.id:raise HTTPException(403,'Yönetici kendi hesabını bu panelden silemez.')
        if db.get(AdminRole,target.id):
            raise HTTPException(403,'Yetkili yönetici hesabı bu panelden silinemez.')
        record('account','admin_delete_attempt',admin_id=user.id,target_user_id=target.id)
        delete_user(db,target)
        record('account','admin_deleted',admin_id=user.id,target_user_id=target.id)
        return {'deleted':True}
