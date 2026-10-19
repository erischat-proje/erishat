"""Public-facing staff privacy policy."""
from sqlalchemy import select
from .admin_models import AdminRole
STAFF_ROLES=('DA','UA','FA','SA')
def staff_ids_query():
    return select(AdminRole.user_id).where(AdminRole.role.in_(STAFF_ROLES))
def is_staff(db,uid):
    return bool(db.scalar(select(AdminRole.user_id).where(AdminRole.user_id==uid,AdminRole.role.in_(STAFF_ROLES))))
