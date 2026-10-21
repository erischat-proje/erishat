"""Read-only rolling 30-day recharge rewards; no balance or VIP mutations."""
import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .vip_membership_models import VipPurchaseReceipt
from .vip_membership import sync

router = APIRouter(prefix='/v1/me/upload-rewards', tags=['upload-rewards'])
NAMES = ('Şövalye', 'Kont', 'Dük', 'Kral')
COUNTS = (20, 20, 21, 24)

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
    @router.get('')
    def view(db: Session = Depends(get_db), user = Depends(current_user)):
        at = datetime.now(timezone.utc)
        sync(db, user.id, at)
        receipts = db.scalars(select(VipPurchaseReceipt).where(VipPurchaseReceipt.user_id == user.id)).all()
        return compute(receipts, at, thresholds())
    return router
