"""Public display-only staff role lookup. Roles remain owned by administration."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .admin_models import AdminRole

router = APIRouter(prefix="/v1", tags=["role badges"])
VALID_ROLES = {"SA", "UA", "FA", "DA"}


def register_auth(current_user):
    @router.get("/role-badges")
    def role_badges(ids: str = Query(min_length=1, max_length=13000),
                    db: Session = Depends(get_db), user: User = Depends(current_user)):
        keys = list(dict.fromkeys(key.strip() for key in ids.split(",") if key.strip()))
        if len(keys) > 100 or any(len(key) > 128 for key in keys):
            raise HTTPException(400, "En fazla 100 kullanıcı sorgulanabilir.")
        rows = db.execute(select(AdminRole.user_id, AdminRole.role).where(AdminRole.user_id.in_(keys))).all()
        roles = {user_id: role for user_id, role in rows if role in VALID_ROLES}
        return {"badges": {key: roles.get(key) for key in keys}}
    return router
