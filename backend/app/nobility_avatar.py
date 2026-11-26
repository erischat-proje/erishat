"""Personal animated avatar validation and entitlement."""

from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import uuid4

from fastapi import HTTPException
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import defer

from .models import User
from .nobility_avatar_models import NobilityAnimatedAvatar
from .nobility_policy import has_privilege

MAX_BYTES = 2 * 1024 * 1024
MAX_DIMENSION = 512
MAX_FRAMES = 150
MAX_DURATION_MS = 10000
VALID_DAYS = 15

FORMATS = {
    "GIF": "image/gif",
    "WEBP": "image/webp",
}


def validate_animation(data):
    if type(data) is not bytes or not data:
        raise HTTPException(422, "Animasyon dosyası boş.")

    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Dosya en fazla 2 MB olabilir.")

    try:
        with Image.open(BytesIO(data)) as image:
            mime = FORMATS.get(image.format)

            if not mime:
                raise ValueError("format")

            if not (
                1 <= image.width <= MAX_DIMENSION
                and 1 <= image.height <= MAX_DIMENSION
            ):
                raise ValueError("dimensions")

            if not getattr(image, "is_animated", False):
                raise ValueError("not animated")

            frames = image.n_frames

            if not 2 <= frames <= MAX_FRAMES:
                raise ValueError("frames")

            duration = 0

            for index in range(frames):
                image.seek(index)
                image.load()

                if image.width > MAX_DIMENSION:
                    raise ValueError("width")

                if image.height > MAX_DIMENSION:
                    raise ValueError("height")

                delay = image.info.get("duration", 0)

                if type(delay) is not int or delay <= 0:
                    raise ValueError("duration")

                duration += delay

                if duration > MAX_DURATION_MS:
                    raise ValueError("too long")

            return mime

    except Exception as exc:
        raise HTTPException(
            422,
            "Geçerli animasyonlu GIF veya WebP seçin. "
            "En fazla 512x512, 150 kare ve 10 saniye."
        ) from exc


def active_avatar(db, user_id, at=None):
    at = at or datetime.now(timezone.utc)

    if not has_privilege(db, user_id, "animated_avatar", at):
        return None

    return db.scalar(
        select(NobilityAnimatedAvatar)
        .options(defer(NobilityAnimatedAvatar.media))
        .where(
            NobilityAnimatedAvatar.user_id == user_id,
            NobilityAnimatedAvatar.granted_at <= at,
            NobilityAnimatedAvatar.expires_at > at,
        )
        .execution_options(populate_existing=True)
    )


def grant_avatar(db, user_id, actor_id, data):
    if db.get_bind().dialect.name != "postgresql":
        raise HTTPException(503, "İşlem geçici olarak kullanılamıyor.")

    mime = validate_animation(data)

    from .admin_models import AdminRole
    from .relationship_routes import lock_users

    lock_users(db, [user_id, actor_id])

    actor = db.get(User, actor_id, populate_existing=True)
    role = db.get(AdminRole, actor_id, populate_existing=True)

    if not actor or not actor.is_active:
        raise HTTPException(403, "Yetkili hesabı geçersiz.")

    if not role or role.role != "DA":
        raise HTTPException(403, "DA yetkisi gerekli.")

    target = db.get(User, user_id, populate_existing=True)

    if not target or not target.is_active:
        raise HTTPException(404, "Kullanıcı bulunamadı.")

    if db.get(AdminRole, user_id):
        raise HTTPException(403, "Yetkili kimliği değiştirilemez.")

    at = datetime.now(timezone.utc)

    if not has_privilege(db, user_id, "animated_avatar", at):
        raise HTTPException(403, "Aktif Kral üyeliği gerekli.")

    row = db.get(
        NobilityAnimatedAvatar,
        user_id,
        populate_existing=True,
        with_for_update=True,
    )

    if row and row.expires_at > at:
        raise HTTPException(
            409, "Mevcut animasyonun süresi henüz dolmadı."
        )

    if row is None:
        row = NobilityAnimatedAvatar(user_id=user_id)
        db.add(row)

    row.asset_id = str(uuid4())
    row.granted_by = actor_id
    row.mime_type = mime
    row.media = data
    row.granted_at = at
    row.expires_at = at + timedelta(days=VALID_DAYS)

    db.flush()

    return row
