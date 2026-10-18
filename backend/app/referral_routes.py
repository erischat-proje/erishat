from datetime import datetime, timedelta, timezone
from secrets import token_hex
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .admin_models import AdminRole, AdminAuditLog
from .platform_models import Family, FamilyMember, Notification
from .referral_models import ReferralCode, ReferralRedemption, FamilyReferralClaim, FamilyReferralReceipt

router = APIRouter(prefix='/v1', tags=['referrals'])
_current_user = None

def register_referral_auth(dependency):
    global _current_user
    _current_user = dependency

def auth_user():
    from fastapi import Request
    # Resolved via Depends after register_referral_auth in main.py.
    if _current_user is None:
        raise RuntimeError('Referral auth not registered')

class NewCode(BaseModel):
    kind: str = Field(pattern='^(USER|TANIDIK)$')
    max_uses: int = Field(ge=1, le=100000)

class Redeem(BaseModel):
    code: str = Field(min_length=4, max_length=48)

def utc(value):
    if not value: return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

def require_da(db, user):
    role = db.get(AdminRole, user.id)
    if not role or role.role != 'DA':
        raise HTTPException(403, 'Yalnızca DA yetkilidir')

def install_routes(current_user):
    # Register once before app.include_router.
    @router.post('/admin/referrals')
    def create_code(payload: NewCode, db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        code = 'ERIS-' + payload.kind + '-' + token_hex(6).upper()
        obj = ReferralCode(code=code, kind=payload.kind, max_uses=payload.max_uses, created_by=user.id)
        db.add(obj)
        db.add(AdminAuditLog(admin_id=user.id, action='referral_create', target_id=code, details=f'{payload.kind}:{payload.max_uses}'))
        db.commit()
        return {'code': code, 'kind': payload.kind, 'max_uses': payload.max_uses, 'reward': 2500 if payload.kind == 'USER' else 12500}

    @router.get('/admin/referrals')
    def list_codes(db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        rows = db.scalars(select(ReferralCode).order_by(ReferralCode.created_at.desc()).limit(200)).all()
        return [{'id': r.id, 'code': r.code, 'kind': r.kind, 'uses': r.uses, 'max_uses': r.max_uses, 'active': r.active and r.uses < r.max_uses} for r in rows]

    @router.delete('/admin/referrals/{code_id}')
    def cancel_code(code_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        row = db.get(ReferralCode, code_id, with_for_update=True)
        if not row: raise HTTPException(404, 'Kod bulunamadı')
        row.active = False
        db.add(AdminAuditLog(admin_id=user.id, action='referral_cancel', target_id=row.code, details='Kod iptal edildi; ödüller korundu'))
        db.commit()
        return {'ok': True}

    @router.post('/referrals/redeem')
    def redeem(payload: Redeem, db: Session = Depends(get_db), user: User = Depends(current_user)):
        # Lock code first to serialize usage count and prevent exceeding quota.
        code = db.scalar(select(ReferralCode).where(ReferralCode.code == payload.code.strip().upper()).with_for_update())
        if not code: raise HTTPException(404, 'Geçersiz referans kodu')
        if db.scalar(select(ReferralRedemption.id).where(ReferralRedemption.code_id == code.id, ReferralRedemption.user_id == user.id)):
            raise HTTPException(409, 'Bu kodu daha önce kullandınız')
        if code.uses >= code.max_uses: raise HTTPException(409, 'Bu kod için maksimum limite ulaşılmıştır.')
        if not code.active: raise HTTPException(409, 'Bu kod artık aktif değil')
        wallet = db.scalar(select(User).where(User.id == user.id).with_for_update())
        if not wallet: raise HTTPException(404, 'Kullanıcı bulunamadı')
        amount = 2500 if code.kind == 'USER' else 12500
        wallet.lidya = int(wallet.lidya or 0) + amount
        code.uses += 1
        if code.uses >= code.max_uses: code.active = False
        db.add(ReferralRedemption(code_id=code.id, user_id=user.id, amount=amount))
        db.commit()
        return {'ok': True, 'code': code.code, 'amount': amount, 'balance': wallet.lidya}

    @router.get('/families/{family_id}/referral-reward')
    def family_status(family_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
        family = db.get(Family, family_id)
        if not family: raise HTTPException(404, 'Aile bulunamadı')
        if family.owner_id != user.id: raise HTTPException(403, 'Yalnızca aile sahibi')
        last = db.scalar(select(FamilyReferralClaim).where(FamilyReferralClaim.family_id == family_id).order_by(FamilyReferralClaim.created_at.desc(), FamilyReferralClaim.id.desc()).limit(1))
        next_at = utc(last.created_at) + timedelta(days=30) if last else None
        count = len(db.scalars(select(FamilyMember.user_id).where(FamilyMember.family_id == family_id)).all())
        return {'family_id': family_id, 'member_count': count, 'next_claim_at': next_at.isoformat() if next_at else None, 'eligible': not next_at or datetime.now(timezone.utc) >= next_at}

    @router.post('/families/{family_id}/referral-reward')
    def family_claim(family_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
        family = db.scalar(select(Family).where(Family.id == family_id).with_for_update())
        if not family: raise HTTPException(404, 'Aile bulunamadı')
        if family.owner_id != user.id: raise HTTPException(403, 'Yalnızca aile sahibi')
        last = db.scalar(select(FamilyReferralClaim).where(FamilyReferralClaim.family_id == family_id).order_by(FamilyReferralClaim.created_at.desc(), FamilyReferralClaim.id.desc()).limit(1))
        if last and datetime.now(timezone.utc) < utc(last.created_at) + timedelta(days=30):
            raise HTTPException(409, '30 günlük bekleme süresi henüz dolmadı')
        member_ids = list(dict.fromkeys(db.scalars(select(FamilyMember.user_id).where(FamilyMember.family_id == family_id)).all()))
        if not member_ids: raise HTTPException(409, 'Aile üyesi bulunamadı')
        claim = FamilyReferralClaim(family_id=family_id, owner_id=user.id, member_count=len(member_ids))
        db.add(claim); db.flush()
        owner_name = user.nickname
        for uid in sorted(member_ids):
            target = db.scalar(select(User).where(User.id == uid).with_for_update())
            if not target: continue
            target.lidya = int(target.lidya or 0) + 1000
            db.add(FamilyReferralReceipt(claim_id=claim.id, user_id=uid, amount=1000))
            db.add(Notification(user_id=uid, kind='family_referral_reward', title='Aile Lidya ikramiyesi', body=f'Aile sahibiniz {owner_name} tarafından 1000 Lidya ikramiye dağıtıldı. 1000 Lidya hesabınıza tanımlanmıştır.'))
        db.commit()
        return {'ok': True, 'member_count': len(member_ids), 'amount_each': 1000, 'next_claim_at': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()}
