"""Time-limited shop cosmetics. Legacy permanent entitlements remain untouched."""
from datetime import datetime, timezone
from calendar import monthrange
from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, select
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

MONTHS=(1,3,6,12)
PRICES={'avatar':(2700,7500,14000,25000),'frame':(5200,15000,25000,45000),'bubble':(5200,15000,25000,45000),'entrance':(5200,15000,25000,45000),'profile':(5200,15000,25000,45000)}

class CosmeticLease(Base):
    __tablename__='cosmetic_leases'
    __table_args__=(UniqueConstraint('user_id','cosmetic_type','asset_key',name='uq_cosmetic_lease'),)
    id:Mapped[int]=mapped_column(primary_key=True,autoincrement=True)
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    cosmetic_type:Mapped[str]=mapped_column(String(32))
    asset_key:Mapped[str]=mapped_column(String(255))
    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),nullable=False)

def aware(dt):return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
def add_months(dt,n):
    m=dt.month-1+n;y=dt.year+m//12;m=m%12+1
    return dt.replace(year=y,month=m,day=min(dt.day,monthrange(y,m)[1]))
def active(lease,now=None):return bool(lease and aware(lease.expires_at)>(now or datetime.now(timezone.utc)))
def get(db,uid,kind,key):return db.scalar(select(CosmeticLease).where(CosmeticLease.user_id==uid,CosmeticLease.cosmetic_type==kind,CosmeticLease.asset_key==key))
def permanent(db,uid,kind,key):
    from .models import UserCosmetic
    return db.scalar(select(UserCosmetic.id).where(UserCosmetic.user_id==uid,UserCosmetic.cosmetic_type==kind,UserCosmetic.asset_key==key)) is not None
