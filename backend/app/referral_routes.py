import re
from datetime import datetime, timedelta, timezone
from secrets import choice
from string import ascii_uppercase, digits
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from .db import get_db
from .models import User
from .admin_models import AdminRole, AdminAuditLog
from .platform_models import Family, FamilyMember, Notification
from .referral_models import ReferralCode, ReferralRedemption, FamilyReferralClaim, FamilyReferralReceipt, CustomReferralReward

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
    kind: str = Field(pattern='^(USER|TANIDIK|CUSTOM)$')
    max_uses: int = Field(ge=1, le=100000, strict=True)
    code: str | None = Field(default=None, max_length=48)
    reward: int | None = Field(default=None, ge=1, le=1000000, strict=True)
    active: bool = Field(default=True, strict=True)


class CodeState(BaseModel):
    active: bool = Field(strict=True)


def reward_amount(db, row):
    if row.kind == 'USER': return 2500
    if row.kind == 'TANIDIK': return 12500
    if row.kind == 'CUSTOM':
        custom = db.get(CustomReferralReward, row.id)
        if custom and 1 <= custom.amount <= 1000000:
            return int(custom.amount)
    raise HTTPException(409, 'Kod ödülü geçersiz; yönetim ile iletişime geçin.')

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
        if payload.kind == 'CUSTOM':
            raw = (payload.code or '').strip()
            if not re.fullmatch(r'[A-Za-z0-9]{4,48}', raw):
                raise HTTPException(422, 'Kod 4-48 İngilizce harf veya rakam içermeli.')
            code = raw.upper()
            amount = payload.reward
            if amount is None:
                raise HTTPException(422, 'Ödül miktarı gerekli.')
            if amount * payload.max_uses > 100000000:
                raise HTTPException(422, 'Bir kodun toplam ödül bütçesi 100.000.000 Lidya sınırını aşamaz.')
        else:
            if payload.code is not None or payload.reward is not None:
                raise HTTPException(422, 'Özel kod ve ödül için CUSTOM seçin.')
            code = ''.join(choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(14))
            amount = 2500 if payload.kind == 'USER' else 12500
        obj = ReferralCode(code=code, kind=payload.kind, max_uses=payload.max_uses,
                           created_by=user.id, active=payload.active)
        try:
            db.add(obj)
            db.flush()
            if payload.kind == 'CUSTOM':
                db.add(CustomReferralReward(code_id=obj.id, amount=amount))
            db.add(AdminAuditLog(admin_id=user.id, action='referral_create', target_id=code,
                details=f'{payload.kind}:{payload.max_uses}:reward={amount}:active={payload.active}'))
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, 'Bu referans kodu zaten mevcut veya kayıt oluşturulamadı.')
        return {'id':obj.id, 'code': code, 'kind': payload.kind, 'max_uses': payload.max_uses,
                'reward': amount, 'active': obj.active}

    @router.get('/admin/referrals')
    def list_codes(db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        rows = db.scalars(select(ReferralCode).order_by(ReferralCode.created_at.desc(), ReferralCode.id.desc()).limit(200)).all()
        result = []
        for r in rows:
            try:
                amount = reward_amount(db, r)
            except HTTPException:
                amount = None
            result.append({'id': r.id, 'code': r.code, 'kind': r.kind, 'uses': r.uses,
                'max_uses': r.max_uses, 'active': r.active and r.uses < r.max_uses and amount is not None,
                'reward': amount, 'remaining': max(0, r.max_uses-r.uses)})
        return result

    @router.patch('/admin/referrals/{code_id}/state')
    def set_code_state(code_id: int, payload: CodeState, db: Session = Depends(get_db), user: User = Depends(current_user)):
        require_da(db, user)
        row = db.get(ReferralCode, code_id, with_for_update=True)
        if not row: raise HTTPException(404, 'Kod bulunamadı')
        if row.kind != 'CUSTOM': raise HTTPException(409, 'Yeniden aktifleştirme yalnızca özel kodlara açıktır.')
        if payload.active:
            if row.uses >= row.max_uses: raise HTTPException(409, 'Kullanım limiti doldu.')
            reward_amount(db, row)
        row.active = payload.active
        db.add(AdminAuditLog(admin_id=user.id, action='referral_state', target_id=row.code,
            details=f'active={payload.active}'))
        db.commit()
        return {'ok': True, 'active': row.active}

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
        wallet = db.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
        if not wallet: raise HTTPException(404, 'Kullanıcı bulunamadı')
        amount = reward_amount(db, code)
        if not wallet.is_active: raise HTTPException(403, 'Hesap aktif değil.')
        if int(wallet.lidya or 0) > 9223372036854775807 - amount:
            raise HTTPException(409, 'Bakiye sınırı aşılıyor.')
        db.info.update(lidya_operation='referral_reward', lidya_reference_id=str(code.id),
                       lidya_actor_id=code.created_by, lidya_details=code.kind)
        wallet.lidya = int(wallet.lidya or 0) + amount
        code.uses += 1
        if code.uses >= code.max_uses: code.active = False
        db.add(ReferralRedemption(code_id=code.id, user_id=user.id, amount=amount))
        db.commit()
        return {'ok': True, 'code': code.code, 'amount': amount, 'balance': wallet.lidya}

    @router.get('/families/{family_id}/referral-reward')
    def family_status(family_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
        family = db.get(Family, family_id)
        if not family or family.closed: raise HTTPException(404, 'Aile bulunamadı')
        if family.owner_id != user.id: raise HTTPException(403, 'Yalnızca aile sahibi')
        last = db.scalar(select(FamilyReferralClaim).where(FamilyReferralClaim.family_id == family_id).order_by(FamilyReferralClaim.created_at.desc(), FamilyReferralClaim.id.desc()).limit(1))
        next_at = utc(last.created_at) + timedelta(days=30) if last else None
        count = len(db.scalars(select(FamilyMember.user_id).where(FamilyMember.family_id == family_id)).all())
        return {'family_id': family_id, 'member_count': count, 'next_claim_at': next_at.isoformat() if next_at else None, 'eligible': not next_at or datetime.now(timezone.utc) >= next_at}

    @router.post('/families/{family_id}/referral-reward')
    def family_claim(family_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
        family = db.scalar(select(Family).where(Family.id == family_id).with_for_update())
        if not family or family.closed: raise HTTPException(404, 'Aile bulunamadı')
        if family.owner_id != user.id: raise HTTPException(403, 'Yalnızca aile sahibi')
        last = db.scalar(select(FamilyReferralClaim).where(FamilyReferralClaim.family_id == family_id).order_by(FamilyReferralClaim.created_at.desc(), FamilyReferralClaim.id.desc()).limit(1))
        if last and datetime.now(timezone.utc) < utc(last.created_at) + timedelta(days=30):
            raise HTTPException(409, '30 günlük bekleme süresi henüz dolmadı')
        member_ids = list(dict.fromkeys(db.scalars(select(FamilyMember.user_id).where(FamilyMember.family_id == family_id)).all()))
        if not member_ids: raise HTTPException(409, 'Aile üyesi bulunamadı')
        if user.id not in member_ids: raise HTTPException(409, 'Aile sahibi üye listesinde bulunamadı')
        # Fail the whole transaction rather than silently paying only some members.
        member_users = list(db.scalars(select(User).where(User.id.in_(member_ids)).order_by(User.id).with_for_update().execution_options(populate_existing=True)))
        if len(member_users) != len(member_ids): raise HTTPException(409, 'Aile üye kayıtları tutarsız')
        claim = FamilyReferralClaim(family_id=family_id, owner_id=user.id, member_count=len(member_ids))
        db.add(claim); db.flush()
        owner_name = user.nickname
        for target in member_users:
            uid = target.id
            target.lidya = int(target.lidya or 0) + 1000
            db.add(FamilyReferralReceipt(claim_id=claim.id, user_id=uid, amount=1000))
            db.add(Notification(user_id=uid, kind='family_referral_reward', title='Aile Lidya ikramiyesi', body=f'Aile sahibiniz {owner_name} tarafından 1000 Lidya ikramiye dağıtıldı. 1000 Lidya hesabınıza tanımlanmıştır.'))
        db.commit()
        return {'ok': True, 'member_count': len(member_ids), 'amount_each': 1000, 'next_claim_at': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()}
