"""Read-only rolling 30-day recharge rewards; no balance or VIP mutations."""
import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, String, ForeignKey
from sqlalchemy.orm import Session, Mapped, mapped_column
from .db import get_db, Base
from .vip_membership_models import VipPurchaseReceipt
from .vip_membership import sync
from pydantic import BaseModel

# Add to backend/app/upload_rewards.py after 'from pydantic import BaseModel'
from .platform_models import Notification


def notify_purchase(db, uid, amount, at):
    """Record one level-up event for a unique approved paid purchase. Never touches Lidya."""
    targets = thresholds()
    if not targets:
        return
    receipts = db.scalars(select(VipPurchaseReceipt).where(VipPurchaseReceipt.user_id == uid)).all()
    previous = compute(receipts, at, targets)['level']
    current = compute(receipts, at, targets)['rolling_purchased'] + max(0, int(amount))
    level = sum(current >= x for x in targets)
    if level > previous:
        title = NAMES[level-1]
        db.add(Notification(
            user_id=uid, kind='upload_reward_upgrade',
            title=f'Artık {title} oldun!',
            body=f'{title} seviyesine yükseldin! Ödüllerini Profil → Yükleme Ödülleri bölümünden alabilirsin.',
        ))

router = APIRouter(prefix='/v1/me/upload-rewards', tags=['upload-rewards'])
NAMES = ('Şövalye', 'Kont', 'Dük', 'Kral')
COUNTS = (20, 20, 21, 24)
KEYS = ('knight', 'count', 'duke', 'king')

class UploadRewardSelection(Base):
    __tablename__ = 'upload_reward_selections'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    reward_key: Mapped[str] = mapped_column(String(36), nullable=False)

class SelectReward(BaseModel):
    reward_key: str

def parse_reward_key(value):
    if not isinstance(value, str): return None
    parts = value.split('/')
    if len(parts) != 2 or parts[0] not in KEYS: return None
    n = parts[1]
    if len(n) != 2 or not n.isascii() or not n.isdigit(): return None
    index = KEYS.index(parts[0])
    if not 1 <= int(n) <= COUNTS[index]: return None
    return index + 1

def entitled(receipts, at, targets, key):
    tier = parse_reward_key(key)
    return bool(tier and compute(receipts, at, targets)['level'] >= tier)


def thresholds():
    raw = os.getenv('UPLOAD_REWARD_THRESHOLDS', '').strip()
    try:
        vals = tuple(int(x.strip()) for x in raw.split(','))
    except ValueError:
        return None
    return vals if len(vals) == 4 and 0 < vals[0] < vals[1] < vals[2] < vals[3] else None

def compute(receipts, now, targets=None):
    cutoff = now - timedelta(days=30)
    amount = 0
    for row in receipts:
        stamp = row.purchased_at
        if stamp is None: continue
        if stamp.tzinfo is None: stamp = stamp.replace(tzinfo=timezone.utc)
        if cutoff <= stamp <= now: amount += max(0, int(row.amount))
    level = sum(amount >= x for x in targets) if targets else 0
    return {'configured': targets is not None, 'rolling_purchased': amount, 'period_days': 30,
            'level': level, 'title': NAMES[level-1] if level else None,
            'tiers': [{'level': i+1, 'title': name, 'image_count': COUNTS[i],
                       'threshold': targets[i] if targets else None,
                       'unlocked': bool(targets and level >= i+1)} for i, name in enumerate(NAMES)]}

def register_auth(current_user):
    def state(db, user):
        at = datetime.now(timezone.utc)
        sync(db, user.id, at)
        receipts = db.scalars(select(VipPurchaseReceipt).where(VipPurchaseReceipt.user_id == user.id)).all()
        return at, receipts

    @router.get('')
    def view(db: Session = Depends(get_db), user = Depends(current_user)):
        at, receipts = state(db, user)
        result = compute(receipts, at, thresholds())
        selected = db.get(UploadRewardSelection, user.id)
        key = selected.reward_key if selected else None
        result['selected_reward'] = key if entitled(receipts, at, thresholds(), key) else None
        result['selection_expired'] = bool(key and not result['selected_reward'])
        return result

    @router.put('/selection')
    def equip(payload: SelectReward, db: Session = Depends(get_db), user = Depends(current_user)):
        tier = parse_reward_key(payload.reward_key)
        if not tier:
            raise HTTPException(status_code=422, detail='Geçersiz ödül.')
        from .models import User
        db.scalar(select(User.id).where(User.id == user.id).with_for_update())
        at, receipts = state(db, user)
        if not entitled(receipts, at, thresholds(), payload.reward_key):
            raise HTTPException(status_code=403, detail='Son 30 günlük yükleme seviyen bu ödüle yetmiyor.')
        selection = db.get(UploadRewardSelection, user.id)
        if selection is None:
            selection = UploadRewardSelection(user_id=user.id, reward_key=payload.reward_key)
            db.add(selection)
        else:
            selection.reward_key = payload.reward_key
        db.commit()
        return {'selected_reward': payload.reward_key, 'level_required': tier}

    @router.delete('/selection')
    def unequip(db: Session = Depends(get_db), user = Depends(current_user)):
        from .models import User
        db.scalar(select(User.id).where(User.id == user.id).with_for_update())
        selection = db.get(UploadRewardSelection, user.id)
        if selection:
            db.delete(selection)
            db.commit()
        return {'selected_reward': None}
    @router.get('/alerts')
    def reward_alerts(db: Session = Depends(get_db), user = Depends(current_user)):
        rows = db.scalars(select(Notification).where(
            Notification.user_id == user.id,
            Notification.kind == 'upload_reward_upgrade',
            Notification.read == False,
        ).order_by(Notification.id.asc()).limit(5)).all()
        return {'events': [{'id': r.id, 'kind': r.kind, 'title': r.title, 'body': r.body} for r in rows]}

    @router.post('/alerts/{event_id}/ack')
    def ack_alert(event_id: int, db: Session = Depends(get_db), user = Depends(current_user)):
        row = db.get(Notification, event_id)
        if not row or row.user_id != user.id or row.kind != 'upload_reward_upgrade':
            raise HTTPException(status_code=404, detail='Bildirim bulunamadı.')
        row.read = True
        db.commit()
        return {'ok': True}

    return router
