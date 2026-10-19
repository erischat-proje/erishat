"""VIP points come from completed purchases, never balance transfers or escrow."""
from uuid import uuid4
from sqlalchemy import ForeignKey, String, BigInteger, select
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base
from .models import User
from .platform_models import VipStatus

from .vip_membership import THRESHOLDS

SOURCES = {'room_gift','dm_gift','couple_gift','cosmetic','relationship_purchase','anonymous_purchase','location_purchase','nickname'}

class VipSpendReceipt(Base):
    __tablename__='vip_spend_receipts'
    key: Mapped[str] = mapped_column(String(192),primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    amount: Mapped[int] = mapped_column(BigInteger,nullable=False)

def level_for(amount):
    return max((n for n,threshold in THRESHOLDS.items() if amount>=threshold),default=0)

def record_spend(db,uid,amount,source,reference=None):
    if source not in SOURCES or not isinstance(amount,int) or amount<=0:
        raise ValueError('Geçersiz VIP harcaması.')
    # All callers charge and record within the same user-locked transaction.
    db.scalar(select(User.id).where(User.id==uid).with_for_update())
    key=f'{source}:{uid}:{reference or uuid4().hex}'
    receipt=db.get(VipSpendReceipt,key)
    row=db.get(VipStatus,uid)
    if receipt:
        if receipt.amount!=amount:raise ValueError('VIP işlem tutarı değiştirilemez.')
        return row
    if row is None:
        row=VipStatus(user_id=uid,level=0,total_spent=0);db.add(row)
    row.total_spent=int(row.total_spent or 0)+amount
    # Spending is audited for compatibility, but never raises purchase-backed VIP.
    db.add(VipSpendReceipt(key=key,user_id=uid,amount=amount))
    db.flush()
    return row
