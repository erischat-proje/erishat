"""Authorized personal animated avatar endpoints."""

import json
import re
from datetime import datetime, timezone

from fastapi import (
    APIRouter, Depends, File,
    HTTPException, UploadFile, Response, Header,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .security_center import access_grant
from .models import User
from .admin_models import AdminRole, AdminAuditLog
from .nobility_avatar_models import NobilityAnimatedAvatar
from .nobility_avatar import (
    MAX_BYTES, grant_avatar, active_avatar,
)


def register_auth(current_user):
    router = APIRouter(
        prefix="/v1/nobility",
        tags=["nobility-avatar"],
    )

    @router.post("/admin/animated-avatar/{user_id}")
    def assign_avatar(
        user_id: str,
        file: UploadFile = File(...),
        db: Session = Depends(get_db),
        actor: User = Depends(current_user),
        authorization: str | None = Header(default=None),
    ):
        try:
            access_grant(db, actor, authorization)
            role = db.get(
                AdminRole,
                actor.id,
                populate_existing=True,
            )

            if not role or role.role != "DA":
                raise HTTPException(403, "DA yetkisi gerekli.")

            if not re.fullmatch(r"[0-9]{10,12}", user_id):
                raise HTTPException(422, "Geçerli kullanıcı ID girin.")

            target = db.scalar(
                select(User).where(
                    User.public_id == user_id,
                    User.is_active.is_(True),
                )
            )

            if target is None:
                raise HTTPException(404, "Kullanıcı bulunamadı.")

            data = file.file.read(MAX_BYTES + 1)

            row = grant_avatar(
                db, target.id, actor.id, data,
            )

            access_grant(db, actor, authorization)

            result = {
                "ok": True,
                "user_id": row.user_id,
                "asset_id": row.asset_id,
                "granted_at": row.granted_at.isoformat(),
                "expires_at": row.expires_at.isoformat(),
            }

            db.add(AdminAuditLog(
                admin_id=actor.id,
                action="nobility_animated_avatar_grant",
                target_user_id=target.id,
                target_id=row.asset_id,
                details=json.dumps(result),
            ))

            db.commit()

            return result

        except Exception:
            db.rollback()
            raise

    @router.get("/animated-avatar/{asset_id}")
    def read_avatar(
        asset_id: str,
        db: Session = Depends(get_db),
    ):
        if len(asset_id) != 36:
            raise HTTPException(404, "Medya bulunamadı.")

        at = datetime.now(timezone.utc)

        user_id = db.scalar(
            select(NobilityAnimatedAvatar.user_id)
            .where(
                NobilityAnimatedAvatar.asset_id == asset_id,
                NobilityAnimatedAvatar.granted_at <= at,
                NobilityAnimatedAvatar.expires_at > at,
            )
        )

        if user_id is None:
            raise HTTPException(404, "Medya bulunamadı.")

        target = db.get(User, user_id)

        if not target or not target.is_active:
            raise HTTPException(404, "Medya bulunamadı.")

        if db.get(AdminRole, user_id):
            raise HTTPException(404, "Medya bulunamadı.")

        row = active_avatar(db, user_id, at)

        if row is None or row.asset_id != asset_id:
            raise HTTPException(404, "Medya bulunamadı.")

        return Response(
            content=row.media,
            media_type=row.mime_type,
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    return router
