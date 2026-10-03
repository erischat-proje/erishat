from __future__ import annotations

from .runtime_tasks import database_task, live_socket, bind_live_loop

from pathlib import Path
from io import BytesIO
from uuid import uuid4
from datetime import datetime, timedelta, timezone
import asyncio
import logging
import re

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, Response, UploadFile, WebSocket, WebSocketDisconnect
from sqlalchemy import and_, delete, func, or_, select, text, update
from sqlalchemy.exc import IntegrityError, OperationalError, TimeoutError as PoolTimeout
from sqlalchemy.orm import Session
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from PIL import Image, ImageFilter

from .auth import (
    create_anonymous_user,
    create_or_login_google_user,
    create_or_login_verified_identity,
)
from .cosmetic_routes import router as cosmetic_router
from .config import settings
from .cosmetics import catalog
from . import vip_spending
from .db import Base, engine, get_db
from .models import AuthOTP, AuthIdentity, Conversation, ConversationMember, Message, User, UserCosmetic
from .repositories import ConversationRepository, MessageRepository, UserRepository
from .room_fan_levels import level_for_total
from .personal_fans import gift_totals, fan_leaderboard
from .room_models import Room, RoomBan, RoomChatMute, RoomGiftEvent, RoomMember, RoomModerator, RoomMusic, RoomSeat, RoomChatMessage, RoomPassword
from .room_routes import GIFT_CATALOG, GIFT_META, gift_visual, register_room_auth, router as room_router
from .platform_models import (ConversationReadState, DirectMessageGift, DirectMessageRestriction, DirectMessageUnlock,
    Family, FamilyDonation, FamilyMember, FamilyVisual, FanProfile, GameBet, GameRound, DiscoveryPreference, MessageHidden,
    MessageMedia, PinnedMessage, Report, RoomAnnouncement, UserLocation, UserPrivacy, VipStatus, Notification,
    SocialPost, SocialPostLike, SocialPostComment, SocialPostCommentLike, SocialStory, SocialStoryView, SocialStoryLike, UserBlock, UserFollow)
from .platform_routes import register_platform_auth, router as platform_router
from . import relationship_routes, ludo_live
from .family_routes import register_family_auth, router as family_router
from .support_models import SupportTicket
from .admin_models import AdminRole, AdminAuditLog, SupportMessage, SupportAssignment, UserBan, ChatBan, RoomAdminBan, ApplicationGap, SystemAnnouncement
from .moderation import active_ban, require_feature, profile_notice, require_chat_write, chat_ban_detail
from .dm_folders import register_auth as register_dm_folder_auth, router as dm_folder_router, require_unlocked, _folder, _session
from .call_routes import register_auth as register_call_auth, router as call_router
from .support_routes import register_support_auth, router as support_router
from . import support_workflow, ban_workflow, purchase_routes, seat_workflow, discovery_live, anonymous_calls, location_calls
from .room_ban_rules import active_room_user_ban, require_room_access
from .suggestion_routes import register_auth as register_suggestion_auth, router as suggestion_router
from .admin_routes import register_admin_auth, router as admin_router
from .system_data import UserIdRegistry, RoomIdRegistry, LidyaLedger
from .system_logs import ensure_log_files, record
from .schemas import ConversationCreate, ConversationOut, MessageCreate, MessageOut, NicknameChange, OnboardingRequest, OTPRequest, OTPVerify, SessionOut, UserCreate, UserOut, UserUpdate
from .services import MessageService
from .performance_queries import message_context, conversation_page
from .performance import install_diagnostics, ensure_query_indexes
from .session import cleanup_expired_sessions, create_session, get_user_from_token, revoke_session
from .otp import create_otp, verify_otp
from .otp_delivery import send_email_otp

logger = logging.getLogger("erischat.api")


def migrate_legacy_frames(db: Session) -> None:
    """Replace equipped and purchased legacy frames without losing entitlements."""
    rows = db.execute(text("SELECT DISTINCT asset_key FROM user_cosmetics WHERE cosmetic_type='frame' AND (asset_key LIKE 'standartcerceve/%' OR asset_key LIKE 'vipcerceve/%') UNION SELECT DISTINCT frame_asset FROM users WHERE frame_asset LIKE 'standartcerceve/%' OR frame_asset LIKE 'vipcerceve/%'")).scalars().all()
    if not rows:
        return
    frames = [item["asset_key"] for item in catalog() if item["type"] == "frame"]
    standard = [key for key in frames if key.startswith("cercevesistemi/standart/")]
    vip = [key for key in frames if key.startswith("cercevesistemi/vip/")]
    if not standard or len(vip) != 12:
        raise RuntimeError("Yeni çerçeve kataloğu eksik; eski çerçeveler taşınmadı")
    for old in rows:
        is_vip = old.startswith("vipcerceve/")
        number = re.search(r"(?:vip|cerceve_)(\d+)", old.rsplit("/", 1)[-1], re.I)
        items = vip if is_vip else standard
        new = items[min(max(int(number.group(1)) - 1, 0), len(items) - 1)] if number else items[0]
        db.execute(text("INSERT INTO user_cosmetics (user_id, cosmetic_type, asset_key) SELECT user_id, 'frame', :new FROM user_cosmetics WHERE cosmetic_type='frame' AND asset_key=:old ON CONFLICT (user_id, cosmetic_type, asset_key) DO NOTHING"), {"new": new, "old": old})
        db.execute(text("UPDATE users SET frame_asset=:new WHERE frame_asset=:old"), {"new": new, "old": old})
        db.execute(text("DELETE FROM user_cosmetics WHERE cosmetic_type='frame' AND asset_key=:old"), {"old": old})
    db.commit()


def migrate_legacy_avatars(db: Session) -> None:
    """Keep existing avatar purchases and equipped looks when retiring old files."""
    prefixes = ("erkekavatar/", "kadınavatar/", "viperkekavatar/", "vipkadınavatar/")
    rows = db.execute(text("SELECT DISTINCT asset_key FROM user_cosmetics WHERE cosmetic_type='avatar' UNION SELECT DISTINCT avatar_asset FROM users WHERE avatar_asset IS NOT NULL")).scalars().all()
    old_keys = [key for key in rows if key and key.startswith(prefixes)]
    if not old_keys:
        return
    avatars = [item for item in catalog() if item["type"] == "avatar"]
    for old in old_keys:
        vip = old.startswith("vip")
        gender = "female" if "kadınavatar/" in old else "male"
        choices = [item["asset_key"] for item in avatars if item["vip"] == vip and item["gender"] == gender]
        if len(choices) != (12 if vip else 48):
            raise RuntimeError("Yeni avatar koleksiyonu eksik; eski avatarlar taşınmadı")
        digits = re.findall(r"\d+", old.rsplit("/", 1)[-1])
        index = min(max(int(digits[-1]) - 1, 0), len(choices) - 1) if digits else 0
        new = choices[index]
        db.execute(text("INSERT INTO user_cosmetics (user_id, cosmetic_type, asset_key) SELECT user_id, 'avatar', :new FROM user_cosmetics WHERE cosmetic_type='avatar' AND asset_key=:old ON CONFLICT (user_id, cosmetic_type, asset_key) DO NOTHING"), {"old": old, "new": new})
        db.execute(text("UPDATE users SET avatar_asset=:new WHERE avatar_asset=:old"), {"old": old, "new": new})
        db.execute(text("DELETE FROM user_cosmetics WHERE cosmetic_type='avatar' AND asset_key=:old"), {"old": old})
    db.commit()

app = FastAPI(title="ErisChat API", version="1.0.3-optimization-20261003")
install_diagnostics(app)
app.include_router(cosmetic_router)

origins = [item.strip() for item in settings.cors_origins.split(",") if item.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins or ["*"], allow_credentials=bool(origins and "*" not in origins), allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Erischat-Expires-In", "X-Erischat-Preview", "X-Request-ID", "Retry-After", "Server-Timing"])


def ensure_system_data_columns() -> None:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ALTER COLUMN lidya TYPE BIGINT"))
        conn.execute(text("ALTER TABLE users ALTER COLUMN lidya SET DEFAULT 0"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS lidya_gem BIGINT NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip VARCHAR(64)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS device_info VARCHAR(512)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email VARCHAR(320)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(64)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(64)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date VARCHAR(10)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(300)"))
        conn.execute(text("ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS audience VARCHAR(16) NOT NULL DEFAULT 'public'"))
        conn.execute(text("ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("ALTER TABLE social_post_comments ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_gift_claimed BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS attachments_json TEXT NOT NULL DEFAULT '[]'"))
        conn.execute(text("ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS attachments_json TEXT NOT NULL DEFAULT '[]'"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL"))
        conn.execute(text("ALTER TABLE system_lidya_gem_ledger ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128)"))
        conn.execute(text("ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS state_data TEXT NOT NULL DEFAULT '{}'"))
        conn.execute(text("ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS user_id VARCHAR(64)"))
        conn.execute(text("ALTER TABLE room_announcements ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT ''"))
        conn.execute(text("ALTER TABLE room_music ADD COLUMN IF NOT EXISTS is_playing BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("ALTER TABLE room_music ADD COLUMN IF NOT EXISTS position_seconds INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE room_music ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ"))
        conn.execute(text("ALTER TABLE room_music ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"))
        conn.execute(text("ALTER TABLE room_music ADD COLUMN IF NOT EXISTS audio_bytes BYTEA"))
        conn.execute(text("ALTER TABLE room_music ADD COLUMN IF NOT EXISTS audio_mime VARCHAR(32)"))
        conn.execute(text("ALTER TABLE room_announcements ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_system_lidya_gem_ledger_idempotency ON system_lidya_gem_ledger (idempotency_key) WHERE idempotency_key IS NOT NULL"))
        conn.execute(text("ALTER TABLE vip_status ADD COLUMN IF NOT EXISTS total_spent INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE vip_status ALTER COLUMN total_spent TYPE BIGINT"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS wallpaper_asset VARCHAR(255)"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS public_id VARCHAR(12)"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner_id VARCHAR(64)"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS name VARCHAR(64) NOT NULL DEFAULT 'ErisChat Odası'"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS seat_count INTEGER NOT NULL DEFAULT 8"))
        conn.execute(text("ALTER TABLE room_members ADD COLUMN IF NOT EXISTS ghost BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS theme VARCHAR(32) NOT NULL DEFAULT 'normal'"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT true"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true"))
        conn.execute(text("UPDATE rooms SET is_active = false WHERE NOT EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = rooms.id)"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMPTZ"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()"))
        conn.execute(text("ALTER TABLE rooms ALTER COLUMN public_id TYPE VARCHAR(12)"))
        conn.execute(text("ALTER TABLE game_rounds ALTER COLUMN room_id DROP NOT NULL"))
        rows = conn.execute(text("SELECT id, public_id FROM rooms")).fetchall()
        import uuid as _uuid
        import re as _re
        from collections import Counter
        counts = Counter(str(x[1]) for x in rows if x[1])
        used = {str(x[1]) for x in rows if _re.fullmatch(r"\d{12}", str(x[1] or ""))}
        for rid, pid in rows:
            if not _re.fullmatch(r"\d{12}", str(pid or "")) or counts[str(pid)] > 1:
                while True:
                    candidate = f"{_uuid.uuid4().int % 1_000_000_000_000:012d}"
                    if candidate not in used:
                        break
                conn.execute(text("UPDATE rooms SET public_id=:pid WHERE id=:rid"), {"pid": candidate, "rid": rid})
                used.add(candidate)


def normalize_public_ids(db: Session) -> None:
    import re
    rows = db.scalars(select(User)).all()
    registry_ids = {row.public_id for row in db.scalars(select(UserIdRegistry)).all()}
    seen = set()
    for user in rows:
        current = str(user.public_id or "")
        if re.fullmatch(r"\d{10}", current) and current not in seen:
            seen.add(current)
            continue
        while True:
            candidate = f"{uuid4().int % 10_000_000_000:010d}"
            if candidate not in seen and candidate not in registry_ids and not db.scalar(select(User.id).where(User.public_id == candidate)):
                break
        user.public_id = candidate
        seen.add(candidate)
    db.commit()


def sync_system_registries(db: Session) -> None:
    normalize_public_ids(db)
    users = db.scalars(select(User)).all()
    rooms = db.scalars(select(Room)).all()
    existing_users = {row.user_id: row for row in db.scalars(select(UserIdRegistry)).all()}
    existing_rooms = {row.room_id: row for row in db.scalars(select(RoomIdRegistry)).all()}
    for user in users:
        row = existing_users.get(user.id)
        if row:
            user.public_id = row.public_id
        else:
            db.add(UserIdRegistry(user_id=user.id, public_id=user.public_id))
    for room in rooms:
        row = existing_rooms.get(room.id)
        if row:
            room.public_id = row.public_id
        else:
            db.add(RoomIdRegistry(room_id=room.id, public_id=room.public_id))
    db.commit()


def bootstrap_initial_developer_admins(db: Session) -> None:
    ids = [x.strip() for x in settings.initial_da_ids.split(",") if x.strip()]
    for user_id in ids:
        if db.get(User, user_id) and not db.get(AdminRole, user_id):
            db.add(AdminRole(user_id=user_id, role="DA"))
    public_ids = [x.strip() for x in settings.initial_da_public_ids.split(",") if x.strip()]
    for public_id in public_ids:
        if len(public_id) != 10 or not public_id.isdigit():
            logger.error("Ignoring malformed INITIAL_DA_PUBLIC_IDS entry")
            continue
        target = db.scalar(select(User).where(User.public_id == public_id))
        if target is None:
            logger.error("Configured initial DA public ID was not found: %s", public_id)
            record("role", "initial_da_target_not_found", target_public_id=public_id, role="DA")
            continue
        role = db.get(AdminRole, target.id)
        if role is None:
            db.add(AdminRole(user_id=target.id, role="DA"))
            logger.info("Initial DA role granted for public ID %s", public_id)
            record("role", "initial_da_granted", target_user_id=target.id, target_public_id=public_id, role="DA")
        elif role.role != "DA":
            role.role = "DA"
            logger.info("Initial DA role elevated for public ID %s", public_id)
            record("role", "initial_da_elevated", target_user_id=target.id, target_public_id=public_id, role="DA")
    db.commit()


def _initialize_database() -> None:
    logger.info("ErisChat API startup: environment=%s", settings.environment)
    Base.metadata.create_all(bind=engine)
    ensure_log_files()
    ensure_system_data_columns()
    with Session(engine) as db:
        migrate_legacy_frames(db)
        migrate_legacy_avatars(db)
        for house in db.scalars(select(relationship_routes.Couple).where(relationship_routes.Couple.active.is_(True))):
            relationship_routes.owned_house(db,house.male_id,lock=True)
            relationship_routes.rewards.ensure_rewards(db,house)
            db.commit()
        cleanup_expired_sessions(db)
        sync_system_registries(db)
        bootstrap_initial_developer_admins(db)
    ensure_query_indexes()
    logger.info("ErisChat API startup complete")


@app.on_event("startup")
async def startup() -> None:
    await run_in_threadpool(_initialize_database)


@app.on_event("startup")
async def start_support_router():
    bind_live_loop()
    app.state.support_routing_task = asyncio.create_task(support_workflow.routing_loop())
    app.state.ludo_routing_task = asyncio.create_task(ludo_live.routing_loop())


@app.on_event("shutdown")
async def stop_support_router():
    ludo_task = getattr(app.state, "ludo_routing_task", None)
    if ludo_task:
        ludo_task.cancel()
        try:
            await ludo_task
        except asyncio.CancelledError:
            pass
    task = getattr(app.state, "support_routing_task", None)
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass



def bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    return token


def current_user(db: Session = Depends(get_db), authorization: str | None = Header(default=None), request: Request = None) -> User:
    user = get_user_from_token(db, bearer_token(authorization))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş oturum")
    ban_workflow.remember_device(db,user,request.headers.get("x-eris-device") if request else None)
    ban_remaining = ban_workflow.restriction(db,user.id)
    remaining = support_workflow.remaining_restriction(db, user.id)
    path = request.url.path if request else ""
    allowed = path == "/v1/me" or path.startswith(("/v1/support/", "/v1/admin/", "/v1/notifications", "/v1/auth/"))
    ban_allowed = path in {"/v1/me","/v1/admin/me"} or path.startswith(("/v1/admin/ban-workflow/","/v1/notifications","/v1/auth/"))
    if ban_remaining and not ban_allowed:
        raise HTTPException(403,detail={"code":"ban_review_restricted","remaining_seconds":ban_remaining,"message":ban_workflow.restriction_message(db,user.id)})
    if remaining and not allowed:
        raise HTTPException(403, detail={"code": "support_restricted", "remaining_seconds": remaining, "message": f"Müşteri taleplerine gereken özeni göstermediğiniz için normal işlevleriniz (Kalan Süre: {remaining} saniye) boyunca yasaklanmıştır."})
    if path.startswith("/v1/rooms/") and not path.endswith("/leave"):
        room_key=path.split("/")[3]
        room=db.get(Room,room_key) or db.scalar(select(Room).where(Room.public_id==room_key))
        if room: require_room_access(db,room.id,user.id)
    account_ban=active_ban(db,user.id)
    if account_ban:
        from .moderation import ban_until
        raise HTTPException(status_code=403,detail=ban_until(account_ban))
    return user


location_calls.register_auth(current_user)
app.include_router(location_calls.router)
anonymous_calls.register_auth(current_user)
app.include_router(anonymous_calls.router)
purchase_routes.register_auth(current_user)
app.include_router(purchase_routes.router)
seat_workflow.register_auth(current_user)
app.include_router(seat_workflow.router)
register_room_auth(current_user, lambda room_id,payload: _broadcast_room_chat(room_id,payload))
register_platform_auth(current_user)
relationship_routes.register_auth(current_user)
app.include_router(relationship_routes.router)
register_family_auth(current_user)
register_support_auth(current_user)
register_suggestion_auth(current_user)
ban_workflow.register_auth(current_user, lambda user_id: disconnect_ban_user(user_id), lambda user_id, room_id: disconnect_room_ban_user(user_id,room_id))
app.include_router(ban_workflow.router)
app.include_router(suggestion_router)
register_admin_auth(current_user, lambda user_id, enabled: transition_room_ghost(user_id, enabled), lambda user_id: disconnect_ban_user(user_id))
support_workflow.register_auth(current_user, lambda user_id: disconnect_support_agent(user_id))
app.include_router(support_workflow.router)
register_dm_folder_auth(current_user)
register_call_auth(current_user)
app.include_router(room_router)
app.include_router(ludo_live.router)
# These legacy router handlers were mounted before the authoritative DM
# handlers below, so FastAPI resolved requests to the stale versions first.
# Keep only the conversation and text-message routes implemented in this file.
_authoritative_dm_routes = {
    ("/v1/conversations", "GET"), ("/v1/conversations", "POST"),
    ("/v1/conversations/{conversation_id}", "GET"),
    ("/v1/messages/{conversation_id}", "GET"), ("/v1/messages/{conversation_id}", "POST"),
}
platform_router.routes[:] = [route for route in platform_router.routes if not any(
    (getattr(route, "path", ""), method) in _authoritative_dm_routes
    for method in (getattr(route, "methods", None) or set()))]
app.include_router(platform_router)
app.include_router(family_router)
app.include_router(support_router)
app.include_router(admin_router)
app.include_router(dm_folder_router)
app.include_router(call_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "erischat-api", "version": app.version}


@app.get("/ready")
def ready() -> dict[str, str]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready", "service": "erischat-api", "version": app.version}
    except (OperationalError, PoolTimeout) as exc:
        logger.warning("Readiness DB check failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="database not ready") from exc


@app.get("/v1/announcements")
def list_announcements(limit: int = Query(default=20, ge=1, le=50), db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(SystemAnnouncement).where(SystemAnnouncement.active.is_(True)).order_by(SystemAnnouncement.created_at.desc()).limit(limit)).all()
    return [{"id": row.id, "title": "ErisChat Yönetim", "message": row.message, "created_at": row.created_at} for row in rows]


@app.post("/v1/users", response_model=SessionOut, status_code=201)
def register_user(payload: UserCreate, db: Session = Depends(get_db)) -> SessionOut:
    try:
        user = create_anonymous_user(db, payload.nickname.strip(), payload.avatar, payload.gender)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SessionOut(access_token=create_session(db, user), user=user)


class GoogleLoginPayload(BaseModel):
    credential: str = Field(min_length=20, max_length=20000)


@app.get("/v1/auth/provider-config")
def provider_config():
    return {
        "google": bool(settings.google_client_id),
        "google_client_id": settings.google_client_id,
    }

@app.get("/v1/auth/google-config")
def google_config() -> dict[str, str | bool]:
    return {"enabled": bool(settings.google_client_id), "client_id": settings.google_client_id}


@app.post("/v1/auth/google", response_model=SessionOut)
def google_login(payload: GoogleLoginPayload, request: Request, db: Session = Depends(get_db)) -> SessionOut:
    ip = request.client.host if request.client else None
    device_info = request.headers.get("user-agent", "")[:512]
    try:
        user = create_or_login_google_user(db, payload.credential, ip=ip, device_info=device_info)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SessionOut(access_token=create_session(db, user), user=user)



@app.post("/v1/auth/otp/request")
def request_otp(
    payload: OTPRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    identifier = payload.identifier.strip().lower() if payload.provider == "email" else payload.identifier.strip()

    try:
        otp, code = create_otp(
            db,
            provider=payload.provider,
            identifier=identifier,
            purpose=payload.purpose,
        )
    except ValueError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    if payload.provider == "email":
        try:
            send_email_otp(
                recipient=identifier,
                code=code,
                purpose=payload.purpose,
            )
        except Exception as exc:
            db.delete(otp)
            db.commit()
            logger.exception("Email OTP gönderilemedi: %s", exc)
            raise HTTPException(
                status_code=503,
                detail=f"MAIL_ERROR: {exc}",
            ) from exc

    elif payload.provider == "phone":
        # SMS sağlayıcısı bağlanana kadar telefon OTP'si gönderilmez.
        db.delete(otp)
        db.commit()
        raise HTTPException(
            status_code=503,
            detail="Telefon doğrulama servisi henüz yapılandırılmadı.",
        )

    logger.info(
        "OTP requested provider=%s purpose=%s identifier=%s expires_at=%s ip=%s",
        payload.provider,
        payload.purpose,
        identifier,
        otp.expires_at.isoformat(),
        request.client.host if request.client else None,
    )

    return {
        "accepted": True,
        "expires_at": otp.expires_at,
        "message": "Doğrulama kodu gönderim kuyruğuna alındı.",
    }


@app.post("/v1/auth/otp/verify", response_model=SessionOut)
def verify_otp_code(
    payload: OTPVerify,
    request: Request,
    db: Session = Depends(get_db),
) -> SessionOut:
    identifier = (
        payload.identifier.strip().lower()
        if payload.provider == "email"
        else payload.identifier.strip()
    )

    # OTP link işlemi mevcut oturumdaki kullanıcıya yapılır.
    # Authorization olmadan link işlemi kesinlikle kabul edilmez.
    link_user = None

    if payload.purpose == "link":
        authorization = request.headers.get("authorization", "").strip()

        if not authorization.lower().startswith("bearer "):
            raise HTTPException(
                status_code=401,
                detail="Email bağlamak için aktif oturum gerekli.",
            )

        token = authorization[7:].strip()

        if not token:
            raise HTTPException(
                status_code=401,
                detail="Geçersiz oturum.",
            )

        link_user = get_user_from_token(db, token)

        if link_user is None:
            raise HTTPException(
                status_code=401,
                detail="Oturum geçersiz veya süresi dolmuş.",
            )

    otp = (
        db.query(AuthOTP)
        .filter(
            AuthOTP.provider == payload.provider,
            AuthOTP.identifier == identifier,
            AuthOTP.purpose == payload.purpose,
            AuthOTP.consumed_at.is_(None),
        )
        .order_by(AuthOTP.created_at.desc())
        .first()
    )

    if otp is None or not verify_otp(db, otp, payload.code):
        raise HTTPException(
            status_code=400,
            detail="Geçersiz veya süresi dolmuş doğrulama kodu.",
        )

    ip = request.client.host if request.client else None
    device_info = request.headers.get("user-agent", "")[:512]

    try:
        if payload.purpose == "link":
            # Email identity başka bir kullanıcıya bağlıysa mevcut hesabı
            # ele geçirecek şekilde yeniden bağlamıyoruz.
            existing_identity = (
                db.query(AuthIdentity)
                .filter(
                    AuthIdentity.provider == payload.provider,
                    AuthIdentity.identifier == identifier,
                )
                .first()
            )

            if existing_identity is not None:
                if existing_identity.user_id != link_user.id:
                    raise ValueError(
                        "Bu email başka bir ErisChat hesabına bağlı."
                    )

                existing_identity.verified_at = datetime.now(timezone.utc)
                db.commit()
                user = link_user
            else:
                db.add(
                    AuthIdentity(
                        id=uuid4().hex,
                        user_id=link_user.id,
                        provider=payload.provider,
                        provider_subject=identifier,
                        identifier=identifier,
                        verified_at=datetime.now(timezone.utc),
                    )
                )

                # Email doğrulaması başarılı olduğundan User alanlarını da
                # güncel tutuyoruz. Mevcut Google email'i ezmiyoruz.
                if not link_user.google_email:
                    link_user.google_email = identifier

                db.commit()
                db.refresh(link_user)
                user = link_user

        else:
            existing_identity = (
                db.query(AuthIdentity)
                .filter(
                    AuthIdentity.provider == payload.provider,
                    AuthIdentity.identifier == identifier,
                )
                .first()
            )

            # Google-created accounts have a verified google_email but may not
            # yet have an email AuthIdentity. Once this address has passed our
            # email OTP, attach it to that same account instead of returning a
            # false "not registered" response or creating a duplicate account.
            google_email_user = None
            if payload.provider == "email" and existing_identity is None:
                google_email_user = (
                    db.query(User)
                    .filter(func.lower(User.google_email) == identifier)
                    .first()
                )
                if google_email_user is not None and not google_email_user.is_active:
                    raise HTTPException(status_code=403, detail="Hesap devre dışı.")

            if payload.purpose == "register":
                if existing_identity is not None or google_email_user is not None:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Bu email zaten kayıtlı. Google ile giriş yapabilir veya e-posta ile giriş yapabilirsiniz."
                            if google_email_user is not None
                            else "Bu email zaten kayıtlı. Giriş yapabilirsiniz."
                        ),
                    )
            elif existing_identity is None and google_email_user is None:
                raise HTTPException(
                    status_code=404,
                    detail="Bu email ile kayıt bulunamadı. Önce kayıt olun.",
                )

            if google_email_user is not None:
                db.add(
                    AuthIdentity(
                        id=uuid4().hex,
                        user_id=google_email_user.id,
                        provider="email",
                        provider_subject=identifier,
                        identifier=identifier,
                        verified_at=datetime.now(timezone.utc),
                    )
                )
                google_email_user.last_ip = ip
                google_email_user.device_info = device_info
                db.commit()
                db.refresh(google_email_user)
                user = google_email_user
            else:
                user = create_or_login_verified_identity(
                    db,
                    provider=payload.provider,
                    identifier=identifier,
                    ip=ip,
                    device_info=device_info,
                )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Bu kimlik başka bir hesapla zaten bağlı.",
        ) from exc

    return SessionOut(
        access_token=create_session(db, user),
        user=user,
    )


@app.post("/v1/welcome/claim", response_model=UserOut)
def claim_welcome_gift(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> User:
    if not user.profile_completed:
        raise HTTPException(status_code=400, detail="Önce profilini tamamlamalısın.")

    locked_user = (
        db.query(User)
        .filter(User.id == user.id)
        .with_for_update()
        .one()
    )

    if locked_user.welcome_gift_claimed:
        return locked_user

    gender = locked_user.gender if locked_user.gender in {"female", "male"} else None
    if not gender:
        raise HTTPException(status_code=400, detail="Geçerli bir cinsiyet seçilmemiş.")

    avatar_item = next(
        (
            item for item in catalog()
            if item.get("type") == "avatar"
            and item.get("gender") == gender
            and item.get("tier") == "standard"
        ),
        None,
    )

    if not avatar_item:
        raise HTTPException(status_code=500, detail="Standart avatar bulunamadı.")

    frame_key = next(item["asset_key"] for item in catalog() if item["type"] == "frame" and not item["vip"])

    locked_user.lidya = int(locked_user.lidya or 0) + 500
    locked_user.avatar_asset = avatar_item["asset_key"]
    locked_user.frame_asset = frame_key
    locked_user.welcome_gift_claimed = True

    db.add(
        UserCosmetic(
            user_id=locked_user.id,
            cosmetic_type="avatar",
            asset_key=avatar_item["asset_key"],
        )
    )
    db.add(
        UserCosmetic(
            user_id=locked_user.id,
            cosmetic_type="frame",
            asset_key=frame_key,
        )
    )

    db.commit()
    db.refresh(locked_user)
    return locked_user


@app.get("/v1/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> User:
    return user


@app.post("/v1/onboarding", response_model=UserOut)
def complete_onboarding(
    payload: OnboardingRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> User:
    if user.profile_completed:
        raise HTTPException(status_code=400, detail="Profil zaten tamamlanmış")

    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Kullanıcı adı boş olamaz")

    existing = (
        db.query(User)
        .filter(User.nickname == username, User.id != user.id)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Bu kullanıcı adı zaten kullanılıyor")

    user.first_name = payload.first_name.strip()
    user.last_name = payload.last_name.strip()
    user.birth_date = payload.birth_date
    user.gender = payload.gender
    user.nickname = username
    user.bio = payload.bio.strip()

    # Onboarding cosmetics: yalnızca standart ve cinsiyete uygun avatar/çerçeve.
    if payload.avatar_asset:
        avatar_key = payload.avatar_asset.replace("\\", "/").lstrip("./")
        avatar_item = next((item for item in catalog() if item["type"] == "avatar" and not item["vip"] and item["gender"] == payload.gender and item["asset_key"] == avatar_key), None)
        if avatar_item:
            user.avatar_asset = avatar_item["asset_key"]
        else:
            raise HTTPException(status_code=400, detail="Geçersiz avatar seçimi")

    if payload.frame_asset:
        frame_key = payload.frame_asset.replace("\\", "/").lstrip("./")
        frame_item = next((item for item in catalog() if item["type"] == "frame" and not item["vip"] and item["asset_key"] == frame_key), None)
        if frame_item:
            user.frame_asset = frame_item["asset_key"]
        else:
            raise HTTPException(status_code=400, detail="Geçersiz çerçeve seçimi")

    user.profile_completed = True
    welcome_conversation_id = f"welcome:{user.id}"
    welcome_conversation = db.get(Conversation, welcome_conversation_id)
    if welcome_conversation is None:
        welcome_conversation = Conversation(id=welcome_conversation_id, type="welcome")
        db.add(welcome_conversation)
        db.add(ConversationMember(conversation_id=welcome_conversation_id, user_id=user.id))
        db.flush()
        db.add(Message(conversation_id=welcome_conversation_id, sender_id=user.id, text=f"Selam {user.nickname} ErisChat'e hoşgeldin seni aramızda gördüğümüz için çok mutlu olduk. Umarım uygulamada keyifli vakit geçirirsin sana hoşgeldin hediyeleri veriyoruz uygulamada vakit geçirmen dileği ile keyifli vakitler."))


    db.commit()
    db.refresh(user)
    return user


@app.patch("/v1/me", response_model=UserOut)
def update_me(payload: UserUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)) -> User:
    if payload.nickname is not None:
        nickname = payload.nickname.strip()
        if not nickname:
            raise HTTPException(status_code=400, detail="İsim boş olamaz")
        other = db.query(User).filter(User.nickname == nickname, User.id != user.id).first()
        if other:
            raise HTTPException(status_code=409, detail="Bu kullanıcı adı zaten kullanılıyor")
        user.nickname = nickname
    for key in ("first_name", "last_name", "bio"):
        value = getattr(payload, key)
        if value is not None:
            setattr(user, key, value)
    if payload.avatar is not None:
        user.avatar = payload.avatar
    if payload.notifications_enabled is not None:
        user.notifications_enabled = payload.notifications_enabled
    db.commit()
    db.refresh(user)
    return user


@app.post("/v1/me/nickname", response_model=UserOut)
def change_nickname(payload: NicknameChange, db: Session = Depends(get_db), user: User = Depends(current_user)) -> UserOut:
    new_name = payload.nickname.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="İsim boş olamaz")
    if new_name == user.nickname:
        return user
    if user.lidya < 300:
        raise HTTPException(status_code=400, detail="İsim değiştirmek için 300 Lidya gerekli")
    user.nickname = new_name
    user.lidya -= 300
    from .vip_spending import record_spend
    record_spend(db,user.id,300,"nickname")
    db.commit()
    db.refresh(user)
    return user


@app.patch("/v1/me/notifications", response_model=UserOut)
def update_notifications(payload: UserUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)) -> UserOut:
    if payload.notifications_enabled is None:
        raise HTTPException(status_code=400, detail="notifications_enabled gerekli")
    user.notifications_enabled = payload.notifications_enabled
    db.commit()
    db.refresh(user)
    return user


@app.post("/v1/logout")
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict[str, bool]:
    return {"revoked": revoke_session(db, bearer_token(authorization))}


@app.post("/v1/conversations", response_model=ConversationOut, status_code=201)
def create_conversation(payload: ConversationCreate, db: Session = Depends(get_db), user: User = Depends(current_user)) -> ConversationOut:
    if payload.participant_id == user.id:
        raise HTTPException(status_code=400, detail="Kendinizle konuşma oluşturamazsınız")
    participant = UserRepository(db).get(payload.participant_id)
    if not participant or not participant.is_active:
        raise HTTPException(status_code=404, detail="Katılımcı bulunamadı")
    require_feature(db, user.id, [participant.id])
    repo = ConversationRepository(db)
    existing = repo.find_direct([user.id, participant.id])
    if existing:
        return existing
    conversation_id = "dm_" + "_".join(sorted((user.id, participant.id)))
    try:
        return repo.create_direct(conversation_id, [user.id, participant.id])
    except IntegrityError:
        db.rollback()
        existing = repo.get(conversation_id) or repo.find_direct([user.id, participant.id])
        if existing:
            return existing
        raise HTTPException(status_code=409, detail="Konuşma oluşturulurken çakışma oluştu")


@app.get("/v1/conversations", response_model=list[ConversationOut])
def list_conversations(limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0),
                       folder: str = Query(default="inbox"), x_eris_dm_vault: str | None = Header(default=None),
                       db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[ConversationOut]:
    if folder not in {"inbox", "archive", "locked"}:
        raise HTTPException(400, "Geçersiz mesaj klasörü")
    if folder == "locked" and not _session(db, user.id, x_eris_dm_vault):
        raise HTTPException(403, "Kilitli sohbet şifrenizi girin")
    # Older family records predate the shared inbox. Restore the conversation
    # membership from the authoritative family membership table on read.
    family_rows = db.execute(select(Family.chat_conversation_id, FamilyMember.user_id)
        .join(FamilyMember, FamilyMember.family_id == Family.id)
        .where(FamilyMember.user_id == user.id)).all()
    changed = False
    for conversation_id, member_id in family_rows:
        if not db.scalar(select(ConversationMember.id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == member_id)):
            db.add(ConversationMember(conversation_id=conversation_id, user_id=member_id))
            changed = True
    if changed:
        db.commit()
    return conversation_page(db, user.id, folder, limit, offset)


@app.get("/v1/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: str, x_eris_dm_vault: str | None = Header(default=None),
                     db: Session = Depends(get_db), user: User = Depends(current_user)) -> ConversationOut:
    repo = ConversationRepository(db)
    conversation = repo.get(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    if not repo.is_member(conversation_id, user.id):
        if repo.get(conversation_id).type == "welcome":
            raise HTTPException(status_code=400, detail="Bu konuşmaya yanıt verilemez")
        raise HTTPException(status_code=403, detail="Bu konuşmaya erişiminiz yok")
    require_unlocked(db, user.id, conversation_id, x_eris_dm_vault)
    family_name = db.scalar(select(Family.name).where(Family.chat_conversation_id == conversation_id))
    member_details = []
    for member in conversation.members:
        member_user = db.get(User, member.user_id)
        member_details.append({"user_id": member.user_id,
            "nickname": member_user.nickname if member_user else None,
            "avatar": member_user.avatar if member_user else None,
            "avatar_asset": member_user.avatar_asset if member_user else None,
            "frame_asset": member_user.frame_asset if member_user else None})
    return {"id": conversation.id, "type": "family" if family_name else conversation.type,
        "created_at": conversation.created_at, "members": member_details,
        "name": (family_name + " aile sohbeti") if family_name else ("ErisChat" if conversation.type == "welcome" else None)}


@app.post("/v1/messages/{conversation_id}", response_model=MessageOut)
@database_task
async def create_message(conversation_id: str, payload: MessageCreate, x_eris_dm_vault: str | None = Header(default=None), db: Session = Depends(get_db), user: User = Depends(current_user)) -> MessageOut:
    repo = ConversationRepository(db)
    if not repo.get(conversation_id):
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    if not repo.is_member(conversation_id, user.id):
        if repo.get(conversation_id).type == "welcome":
            raise HTTPException(status_code=400, detail="Bu konuşmaya yanıt verilemez")
        raise HTTPException(status_code=403, detail="Bu konuşmaya mesaj gönderemezsiniz")
    require_unlocked(db, user.id, conversation_id, x_eris_dm_vault)
    require_feature(db, user.id, [member_id for member_id in repo.members(conversation_id) if member_id != user.id])
    is_family_conversation = db.scalar(select(Family.id).where(Family.chat_conversation_id == conversation_id)) is not None
    if not is_family_conversation:
        recipient_ids = [member_id for member_id in repo.members(conversation_id) if member_id != user.id]
        if len(recipient_ids) == 1:
            target_id = recipient_ids[0]
            if db.scalar(select(UserBlock.id).where(UserBlock.blocker_id == target_id, UserBlock.blocked_id == user.id)):
                raise HTTPException(status_code=403, detail="Bu kullanıcı tarafından engellendiniz.")
            if db.scalar(select(UserBlock.id).where(UserBlock.blocker_id == user.id, UserBlock.blocked_id == target_id)):
                raise HTTPException(status_code=403, detail="Bu kullanıcıyı engellediniz.")
        for recipient_id in recipient_ids:
            restriction = db.get(DirectMessageRestriction, recipient_id)
            unlocked = db.scalar(select(DirectMessageUnlock.id).where(DirectMessageUnlock.owner_id == recipient_id,
                DirectMessageUnlock.sender_id == user.id))
            if restriction and restriction.enabled and not unlocked:
                gift_price = GIFT_CATALOG.get(restriction.gift_key, 0)
                raise HTTPException(status_code=402, detail=f"Bu kullanıcı mesajları hediye ile kısıtlamış. Devam etmek için {restriction.gift_key} ({gift_price} Lidya) göndermelisin.")
    try:
        message = MessageService(MessageRepository(db)).create(conversation_id, user.id, payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    event = {
        "type": "dm_message",
        "conversation_id": conversation_id,
        "message_id": message.id,
        "sender_id": user.id,
        "sender_nickname": user.nickname,
        "text": message.text,
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }
    for member_id in repo.members(conversation_id):
        if member_id != user.id:
            db.add(Notification(user_id=member_id, kind="dm_message", title=user.nickname,
                body="Kilitli sohbette yeni mesaj" if (_folder(db, member_id, conversation_id) and _folder(db, member_id, conversation_id).locked) else payload.text[:180]))
        await _send_dm_event(db, member_id, event)
    db.commit()
    return _message_out(db, message, user.id)


@app.get("/v1/messages/{conversation_id}", response_model=list[MessageOut])
@database_task
async def list_messages(conversation_id: str, limit: int = Query(default=100, ge=1, le=200), offset: int = Query(default=0, ge=0), x_eris_dm_vault: str | None = Header(default=None), db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[MessageOut]:
    repo = ConversationRepository(db)
    if not repo.get(conversation_id):
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    if not repo.is_member(conversation_id, user.id):
        if repo.get(conversation_id).type == "welcome":
            raise HTTPException(status_code=400, detail="Bu konuşmaya yanıt verilemez")
        raise HTTPException(status_code=403, detail="Bu konuşmaya erişim yok")
    require_unlocked(db, user.id, conversation_id, x_eris_dm_vault)
    state = db.scalar(select(ConversationReadState).where(ConversationReadState.conversation_id == conversation_id, ConversationReadState.user_id == user.id))
    messages = MessageService(MessageRepository(db)).list(conversation_id, limit=limit, offset=offset)
    latest_incoming = max((m.id for m in messages if m.sender_id != user.id), default=0)
    if latest_incoming and (state is None or latest_incoming > state.last_read_message_id):
        if state is None:
            state = ConversationReadState(conversation_id=conversation_id, user_id=user.id, last_read_message_id=latest_incoming)
            db.add(state)
        else:
            state.last_read_message_id = max(state.last_read_message_id, latest_incoming)
        db.commit()
        for member_id in repo.members(conversation_id):
            if member_id != user.id:
                await manager.send_user(member_id, {"type":"dm_read", "conversation_id":conversation_id,
                    "reader_id":user.id, "read_up_to":latest_incoming})
    context = message_context(db, messages, user.id)
    return [_message_out(db, message, user.id, context) for message in messages if message.id not in context['hidden']]


def _message_out(db: Session, message: Message, viewer_id: str, context=None) -> dict:
    context = context if context is not None else message_context(db, [message], viewer_id)
    pinned = message.id in context['pinned']
    gift = context['gifts'].get(message.id)
    media = context['media'].get(message.id)
    return {"id": message.id, "conversation_id": message.conversation_id, "sender_id": message.sender_id,
        "text": message.text, "created_at": message.created_at,
        "is_read": message.sender_id == viewer_id and bool(context["read"] >= message.id),
        "is_pinned": pinned, "gift_key": gift.gift_key if gift else None,
        "gift_id": GIFT_META.get(gift.gift_key, {}).get("id") if gift else None,
        "gift_image_url": GIFT_META[gift.gift_key]["image_url"] if gift and gift.gift_key in GIFT_META else None,
        "gift_price": gift.unit_price if gift else None,
        "media_type": media.media_type if media else None,
        "media_url": f"/messages/{message.conversation_id}/{message.id}/media" if media else None,
        "temporary": bool(media and media.temporary), "view_seconds": media.view_seconds if media else None,
        "expires_at": media.expires_at if media else None}


@app.post("/v1/messages/{conversation_id}/media", status_code=201, response_model=MessageOut)
@database_task
async def send_message_media(conversation_id: str, file: UploadFile = File(...), media_type: str = Form(...),
    view_seconds: int = Form(default=0), x_eris_dm_vault: str | None = Header(default=None), db: Session = Depends(get_db), user: User = Depends(current_user)) -> MessageOut:
    if not ConversationRepository(db).is_member(conversation_id, user.id):
        raise HTTPException(status_code=403, detail="Bu konuşmaya erişiminiz yok")
    require_unlocked(db, user.id, conversation_id, x_eris_dm_vault)
    require_feature(db, user.id, [uid for uid in ConversationRepository(db).members(conversation_id) if uid != user.id])
    conversation = db.get(Conversation, conversation_id)
    if conversation and not db.scalar(select(Family.id).where(Family.chat_conversation_id == conversation_id)):
        recipient_ids = list(db.scalars(select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id != user.id,
        )))
        if len(recipient_ids) == 1:
            target_id = recipient_ids[0]
            if db.scalar(select(UserBlock.id).where(UserBlock.blocker_id == target_id, UserBlock.blocked_id == user.id)):
                raise HTTPException(status_code=403, detail="Bu kullanıcı tarafından engellendiniz.")
            if db.scalar(select(UserBlock.id).where(UserBlock.blocker_id == user.id, UserBlock.blocked_id == target_id)):
                raise HTTPException(status_code=403, detail="Bu kullanıcıyı engellediniz.")
    if not conversation or conversation.type == "welcome": raise HTTPException(status_code=400, detail="Bu konuşmaya medya gönderilemez")
    if media_type not in {"image", "voice"}: raise HTTPException(status_code=400, detail="Geçersiz medya türü")
    if media_type == "image":
        if file.content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
            raise HTTPException(status_code=415, detail="JPG, PNG, WEBP veya GIF fotoğrafı seçin")
        if view_seconds not in {0, 10, 20, 30}: raise HTTPException(status_code=400, detail="Fotoğraf süresi 10, 20 veya 30 saniye olmalı")
    else:
        if (file.content_type or "").split(";", 1)[0].strip().lower() not in {"audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav"}:
            raise HTTPException(status_code=415, detail="Desteklenmeyen ses biçimi")
        if view_seconds != 0: raise HTTPException(status_code=400, detail="Ses kaydı süreli olamaz")
    data = await file.read(12 * 1024 * 1024 + 1)
    if not data or len(data) > 12 * 1024 * 1024: raise HTTPException(status_code=413, detail="Medya en fazla 12 MB olabilir")
    if media_type == "image":
        valid = data.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"GIF87a", b"GIF89a")) or (data.startswith(b"RIFF") and data[8:12] == b"WEBP")
        if not valid: raise HTTPException(status_code=415, detail="Fotoğraf dosyası okunamadı")
    elif not (data.startswith(b"OggS") or data.startswith(b"RIFF") or data.startswith(b"ID3") or data[0:1] == b"\x1a" or (len(data) > 8 and data[4:8] == b"ftyp")):
        raise HTTPException(status_code=415, detail="Ses dosyası okunamadı")
    temporary = media_type == "image" and view_seconds > 0
    message = Message(conversation_id=conversation_id, sender_id=user.id, text="[Fotoğraf]" if media_type == "image" else "[Sesli mesaj]")
    db.add(message); db.flush()
    mime_type = (file.content_type or "application/octet-stream").split(";", 1)[0].strip().lower()
    db.add(MessageMedia(message_id=message.id, media_type=media_type, mime_type=mime_type,
        data=data, temporary=temporary, view_seconds=view_seconds if temporary else None))
    for member_id in ConversationRepository(db).members(conversation_id):
        if member_id != user.id: db.add(Notification(user_id=member_id, kind="dm_message", title=user.nickname,
            body="Sana süreli fotoğraf gönderdi." if temporary else ("Sana bir fotoğraf gönderdi." if media_type == "image" else "Sana sesli mesaj gönderdi.")))
    db.commit(); db.refresh(message)
    event = {"type":"dm_message", "conversation_id":conversation_id, "message_id":message.id,
        "sender_id":user.id, "sender_nickname":user.nickname, "text":message.text,
        "media_type":media_type, "temporary":temporary, "view_seconds":view_seconds if temporary else None,
        "media_url":f"/messages/{conversation_id}/{message.id}/media", "created_at":message.created_at.isoformat() if message.created_at else None}
    for member_id in ConversationRepository(db).members(conversation_id): await _send_dm_event(db, member_id, event)
    return _message_out(db, message, user.id)


def _blur_temporary_photo(data: bytes) -> bytes:
    with Image.open(BytesIO(data)) as source:
        if source.width * source.height > 24_000_000:
            raise ValueError("Fotoğraf boyutu önizleme için fazla büyük")
        source.seek(0)
        source.thumbnail((96, 96))
        frame = source.convert("RGB").filter(ImageFilter.GaussianBlur(radius=12))
        output = BytesIO()
        frame.save(output, format="JPEG", quality=48, optimize=True)
        return output.getvalue()


def _temporary_photo_expired_for_viewer(media, message, user, now: datetime | None = None) -> bool:
    now = now or datetime.now(timezone.utc)
    return bool(media.temporary and media.expires_at and media.expires_at <= now and user.id != message.sender_id)


@app.get("/v1/messages/{conversation_id}/{message_id}/media")
def get_message_media(conversation_id: str, message_id: int, preview: bool = Query(default=False), x_eris_dm_vault: str | None = Header(default=None), db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not ConversationRepository(db).is_member(conversation_id, user.id): raise HTTPException(status_code=403, detail="Bu konuşmaya erişiminiz yok")
    require_unlocked(db, user.id, conversation_id, x_eris_dm_vault)
    if db.scalar(select(MessageHidden.id).where(MessageHidden.message_id == message_id, MessageHidden.user_id == user.id)):
        raise HTTPException(404, "Medya bulunamadı")
    media = db.get(MessageMedia, message_id)
    message = db.get(Message, message_id)
    if not media or not message or message.conversation_id != conversation_id: raise HTTPException(status_code=404, detail="Medya bulunamadı")
    if _temporary_photo_expired_for_viewer(media, message, user):
        raise HTTPException(status_code=410, detail="Süreli fotoğrafın görüntüleme süresi doldu")
    if media.data is None: raise HTTPException(status_code=410, detail="Fotoğraf artık kullanılamıyor")
    if preview and media.temporary:
        if media.media_type != "image": raise HTTPException(status_code=400, detail="Önizleme yalnızca fotoğraf içindir")
        try:
            blurred = _blur_temporary_photo(media.data)
        except Exception as exc:
            logger.warning("Temporary photo preview failed for message %s: %s", message_id, exc)
            raise HTTPException(status_code=415, detail="Fotoğraf önizlemesi oluşturulamadı") from exc
        return Response(content=blurred, media_type="image/jpeg",
            headers={"Cache-Control":"private, no-store, max-age=0", "Pragma":"no-cache",
                "X-Content-Type-Options":"nosniff", "X-Erischat-Preview":"blurred"})
    countdown = 0
    if media.temporary and user.id != message.sender_id:
        now = datetime.now(timezone.utc)
        if media.viewed_at is None:
            media.viewed_at = now
            media.expires_at = now + timedelta(seconds=media.view_seconds or 10)
            db.commit()
        countdown = max(0, int((media.expires_at - now).total_seconds()))
    return Response(content=media.data, media_type=media.mime_type,
        headers={"Cache-Control":"private, no-store, max-age=0", "Pragma":"no-cache",
            "X-Content-Type-Options":"nosniff", "X-Erischat-Expires-In":str(countdown)})


async def _read_social_upload(file: UploadFile, video_limit: int):
    mime = (file.content_type or "").split(";", 1)[0].strip().lower()
    images = {
        "image/jpeg": (b"\xff\xd8\xff",),
        "image/png": (b"\x89PNG\r\n\x1a\n",),
        "image/gif": (b"GIF87a", b"GIF89a"),
        "image/webp": (b"RIFF",),
    }
    if mime in images:
        limit = 10 * 1024 * 1024
    elif mime in {"video/mp4", "video/webm"}:
        limit = video_limit
    else:
        raise HTTPException(status_code=415, detail="JPG, PNG, WEBP, GIF, MP4 veya WEBM seçin")
    data = await file.read(limit + 1)
    if not data or len(data) > limit:
        raise HTTPException(status_code=413, detail=f"Medya dosyası en fazla {limit // (1024 * 1024)} MB olabilir")
    if mime in images:
        valid = any(data.startswith(prefix) for prefix in images[mime])
        if mime == "image/webp":
            valid = valid and data[8:12] == b"WEBP"
    elif mime == "video/mp4":
        valid = b"ftyp" in data[:16]
    else:
        valid = data.startswith(b"\x1a\x45\xdf\xa3")
    if not valid:
        raise HTTPException(status_code=415, detail="Medya dosyası okunamadı")
    return mime, data


@app.get("/v1/users/{user_id}/posts")
def public_profile_posts(user_id: str, limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0), db: Session = Depends(get_db),
    user: User = Depends(current_user)):
    target = db.get(User, user_id) or db.scalar(select(User).where(User.public_id == user_id))
    if not target or not target.is_active:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if active_ban(db, target.id): return []
    is_owner = target.id == user.id
    if not is_owner and db.scalar(select(UserBlock.id).where(or_(
        and_(UserBlock.blocker_id == user.id, UserBlock.blocked_id == target.id),
        and_(UserBlock.blocker_id == target.id, UserBlock.blocked_id == user.id)))):
        raise HTTPException(status_code=404, detail="Gönderiler bulunamadı")
    follows = bool(db.scalar(select(UserFollow.id).where(
        UserFollow.follower_id == user.id, UserFollow.following_id == target.id
    )))
    query = select(SocialPost, SocialPost.image_bytes.is_not(None).label('has_image')).where(SocialPost.user_id == target.id)
    if not is_owner:
        query = query.where(SocialPost.is_hidden.is_(False))
        query = query.where(SocialPost.audience.in_(["public", "followers"]) if follows
                            else SocialPost.audience == "public")
    rows = list(db.execute(query.order_by(
        SocialPost.is_pinned.desc(), SocialPost.created_at.desc(), SocialPost.id.desc()
    ).offset(offset).limit(limit)))
    return [{
        "id": post.id, "user_id": target.id, "nickname": target.nickname,
        "avatar": target.avatar, "avatar_asset": target.avatar_asset,
        "caption": post.caption, "created_at": post.created_at,
        "updated_at": post.updated_at, "mime_type": post.mime_type,
        "has_image": has_image,
        "media_url": f"/posts/{post.id}/media" if has_image else None,
        "is_mine": is_owner, "is_hidden": bool(getattr(post, "is_hidden", False)),
        "is_pinned": bool(post.is_pinned),
    } for post, has_image in rows]


@app.get("/v1/posts/feed")
def list_social_feed(mode: str = Query(default="for-you", pattern="^(for-you|following|recent)$"),
    limit: int = Query(default=30, ge=1, le=100), offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db), user: User = Depends(current_user)):
    following = set(db.scalars(select(UserFollow.following_id).where(UserFollow.follower_id == user.id)))
    visible_ids = following | {user.id}
    blocked = set(db.scalars(select(UserBlock.blocked_id).where(UserBlock.blocker_id == user.id)))
    blocked |= set(db.scalars(select(UserBlock.blocker_id).where(UserBlock.blocked_id == user.id)))
    query = select(SocialPost, SocialPost.image_bytes.is_not(None).label('has_image')).join(User, User.id == SocialPost.user_id).where(
        User.is_active.is_(True), SocialPost.is_hidden.is_(False))
    if blocked:
        query = query.where(~SocialPost.user_id.in_(blocked))
    if mode == "following":
        query = query.where(SocialPost.user_id.in_(visible_ids))
    else:
        query = query.where(or_(SocialPost.audience == "public",
            and_(SocialPost.audience == "followers", SocialPost.user_id.in_(visible_ids))))
    rows = list(db.execute(query.order_by(SocialPost.created_at.desc(), SocialPost.id.desc())
        .offset(offset).limit(limit)))
    authors = {u.id:u for u in db.scalars(select(User).where(User.id.in_({p.user_id for p, _ in rows})))}
    result = []
    for post, has_image in rows:
        author = authors.get(post.user_id)
        if author:
            result.append({"id": post.id, "user_id": author.id, "nickname": author.nickname,
                "avatar": author.avatar, "avatar_asset": author.avatar_asset, "caption": post.caption,
                "created_at": post.created_at, "updated_at": post.updated_at, "has_image": has_image,
                "mime_type": post.mime_type, "media_kind": "video" if (post.mime_type or "").startswith("video/") else "image",
                "media_url": f"/posts/{post.id}/media" if has_image else None,
                "audience": post.audience, "is_hidden": False, "is_mine": post.user_id == user.id})
            result[-1]["is_pinned"] = bool(post.is_pinned)
    return result


@app.get("/v1/me/posts")
def list_my_social_posts(limit: int = Query(default=100, ge=1, le=200), offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = list(db.execute(select(SocialPost, SocialPost.image_bytes.is_not(None).label('has_image')).where(SocialPost.user_id == user.id)
        .order_by(SocialPost.is_pinned.desc(), SocialPost.created_at.desc(), SocialPost.id.desc()).offset(offset).limit(limit)))
    return [{"id": p.id, "user_id": user.id, "nickname": user.nickname, "avatar": user.avatar,
        "avatar_asset": user.avatar_asset, "caption": p.caption, "created_at": p.created_at,
        "updated_at": p.updated_at, "has_image": has_image, "mime_type": p.mime_type,
        "media_kind": "video" if (p.mime_type or "").startswith("video/") else "image",
        "media_url": f"/posts/{p.id}/media" if has_image else None,
        "audience": p.audience, "is_hidden": p.is_hidden, "is_pinned": bool(p.is_pinned), "is_mine": True} for p, has_image in rows]


@app.post("/v1/posts", status_code=201)
@database_task
async def create_social_post(caption: str = Form(default=""), file: UploadFile | None = File(default=None),
    audience: str = Form(default="public"), db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_chat_write(db,user.id)
    caption, audience = caption.strip(), audience.strip().lower()
    if audience not in {"public", "followers"}:
        raise HTTPException(status_code=400, detail="Paylaşım hedef kitlesi geçersiz")
    if len(caption) > 2000: raise HTTPException(status_code=400, detail="Gönderi metni en fazla 2000 karakter olabilir")
    if not caption and file is None: raise HTTPException(status_code=400, detail="Metin veya medya ekleyin")
    mime, data = await _read_social_upload(file, 80 * 1024 * 1024) if file else (None, None)
    post = SocialPost(user_id=user.id, caption=caption, mime_type=mime, image_bytes=data, audience=audience)
    db.add(post); db.commit(); db.refresh(post)
    return {"id": post.id, "user_id": user.id, "nickname": user.nickname, "avatar": user.avatar,
        "avatar_asset": user.avatar_asset, "caption": post.caption, "created_at": post.created_at,
        "updated_at": post.updated_at, "has_image": data is not None, "mime_type": mime,
        "media_kind": "video" if (mime or "").startswith("video/") else "image",
        "media_url": f"/posts/{post.id}/media" if data is not None else None,
        "audience": audience, "is_hidden": False, "is_mine": True}


@app.patch("/v1/posts/{post_id}")
@database_task
async def update_social_post(post_id: int, caption: str | None = Form(default=None),
    file: UploadFile | None = File(default=None), remove_image: bool = Form(default=False),
    audience: str | None = Form(default=None), is_hidden: bool | None = Form(default=None),
    db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_chat_write(db,user.id)
    post = db.get(SocialPost, post_id)
    if not post: raise HTTPException(status_code=404, detail="Gönderi bulunamadı")
    if post.user_id != user.id: raise HTTPException(status_code=403, detail="Yalnızca kendi gönderini düzenleyebilirsin")
    if caption is not None:
        caption = caption.strip()
        if len(caption) > 2000: raise HTTPException(status_code=400, detail="Metin en fazla 2000 karakter olabilir")
        post.caption = caption
    if audience is not None:
        if audience not in {"public", "followers"}: raise HTTPException(status_code=400, detail="Hedef kitle geçersiz")
        post.audience = audience
    if is_hidden is not None: post.is_hidden = is_hidden
    if remove_image: post.image_bytes = None; post.mime_type = None
    if file is not None: post.mime_type, post.image_bytes = await _read_social_upload(file, 80 * 1024 * 1024)
    if not post.caption and post.image_bytes is None:
        raise HTTPException(status_code=400, detail="Gönderide metin veya medya kalmalı")
    db.commit(); db.refresh(post)
    return {"id": post.id, "user_id": user.id, "nickname": user.nickname, "avatar": user.avatar,
        "avatar_asset": user.avatar_asset, "caption": post.caption, "created_at": post.created_at,
        "updated_at": post.updated_at, "has_image": post.image_bytes is not None, "mime_type": post.mime_type,
        "media_kind": "video" if (post.mime_type or "").startswith("video/") else "image",
        "media_url": f"/posts/{post.id}/media" if post.image_bytes is not None else None,
        "audience": post.audience, "is_hidden": post.is_hidden, "is_mine": True}


@app.delete("/v1/posts/{post_id}")
def delete_social_post(post_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = db.get(SocialPost, post_id)
    if not post: raise HTTPException(status_code=404, detail="Gönderi bulunamadı")
    if post.user_id != user.id: raise HTTPException(status_code=403, detail="Yalnızca kendi gönderini silebilirsin")
    db.delete(post); db.commit()
    return {"deleted": True, "post_id": post_id}


@app.put("/v1/posts/{post_id}/pin")
def pin_social_post(post_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    # Serialize competing pin requests for the same profile.
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    post = db.get(SocialPost, post_id)
    if not post: raise HTTPException(status_code=404, detail="Gönderi bulunamadı")
    if post.user_id != user.id: raise HTTPException(status_code=403, detail="Yalnızca kendi gönderini sabitleyebilirsin")
    db.execute(update(SocialPost).where(SocialPost.user_id == user.id).values(is_pinned=False))
    post.is_pinned = True
    db.commit()
    return {"id": post.id, "is_pinned": True}


@app.delete("/v1/posts/{post_id}/pin")
def unpin_social_post(post_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = db.get(SocialPost, post_id)
    if not post: raise HTTPException(status_code=404, detail="Gönderi bulunamadı")
    if post.user_id != user.id: raise HTTPException(status_code=403, detail="Yalnızca kendi gönderinin sabitlemesini kaldırabilirsin")
    post.is_pinned = False
    db.commit()
    return {"id": post.id, "is_pinned": False}


@app.get("/v1/posts/{post_id}/media")
def get_social_post_media(post_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = db.get(SocialPost, post_id)
    if not post or post.image_bytes is None or not post.mime_type:
        raise HTTPException(status_code=404, detail="Gönderi medyası bulunamadı")
    if post.user_id != user.id:
        blocked = db.scalar(select(UserBlock.id).where(or_(
            and_(UserBlock.blocker_id == user.id, UserBlock.blocked_id == post.user_id),
            and_(UserBlock.blocker_id == post.user_id, UserBlock.blocked_id == user.id))))
        follows = db.scalar(select(UserFollow.id).where(
            UserFollow.follower_id == user.id, UserFollow.following_id == post.user_id))
        if blocked or post.is_hidden or (post.audience == "followers" and not follows):
            raise HTTPException(status_code=404, detail="Gönderi medyası bulunamadı")
    return Response(content=post.image_bytes, media_type=post.mime_type,
        headers={"Cache-Control":"private, no-store, max-age=0", "Pragma":"no-cache", "X-Content-Type-Options":"nosniff"})




class SocialCommentInput(BaseModel):
    body: str = Field(min_length=1, max_length=1000)
    parent_id: int | None = None


def _social_access(db: Session, post_id: int, viewer: User) -> SocialPost:
    post = db.get(SocialPost, post_id)
    author = db.get(User, post.user_id) if post else None
    if not post or not author or not author.is_active or active_ban(db, author.id):
        raise HTTPException(status_code=404, detail="Gönderi bulunamadı")
    if post.user_id != viewer.id:
        blocked = db.scalar(select(UserBlock.id).where(or_(
            and_(UserBlock.blocker_id == viewer.id, UserBlock.blocked_id == post.user_id),
            and_(UserBlock.blocker_id == post.user_id, UserBlock.blocked_id == viewer.id))))
        follows = db.scalar(select(UserFollow.id).where(
            UserFollow.follower_id == viewer.id, UserFollow.following_id == post.user_id))
        if blocked or post.is_hidden or (post.audience == "followers" and not follows):
            raise HTTPException(status_code=404, detail="Gönderi bulunamadı")
    return post


def _social_counts(db: Session, post_id: int, viewer_id: str) -> dict:
    return {
        "like_count": db.scalar(select(func.count()).select_from(SocialPostLike).where(
            SocialPostLike.post_id == post_id)) or 0,
        "comment_count": db.scalar(select(func.count()).select_from(SocialPostComment).where(
            SocialPostComment.post_id == post_id)) or 0,
        "liked_by_me": bool(db.get(SocialPostLike, (post_id, viewer_id))),
    }


@app.get("/v1/posts/{post_id}/engagement")
def social_post_engagement(post_id: int, db: Session = Depends(get_db),
    user: User = Depends(current_user)):
    _social_access(db, post_id, user)
    return _social_counts(db, post_id, user.id)


@app.post("/v1/posts/{post_id}/like")
def like_social_post(post_id: int, db: Session = Depends(get_db),
    user: User = Depends(current_user)):
    _social_access(db, post_id, user)
    if not db.get(SocialPostLike, (post_id, user.id)):
        db.add(SocialPostLike(post_id=post_id, user_id=user.id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    return _social_counts(db, post_id, user.id)


@app.delete("/v1/posts/{post_id}/like")
def unlike_social_post(post_id: int, db: Session = Depends(get_db),
    user: User = Depends(current_user)):
    _social_access(db, post_id, user)
    db.execute(delete(SocialPostLike).where(
        SocialPostLike.post_id == post_id, SocialPostLike.user_id == user.id))
    db.commit()
    return _social_counts(db, post_id, user.id)


def _social_comment_row(db: Session, item: SocialPostComment, viewer: User) -> dict:
    author = db.get(User, item.user_id)
    return {
        "id": item.id, "post_id": item.post_id, "parent_id": item.parent_id,
        "user_id": item.user_id, "nickname": author.nickname if author else "Kullanıcı",
        "avatar": author.avatar if author else None,
        "avatar_asset": author.avatar_asset if author else None,
        "gender": author.gender if author else None,
        "body": item.body, "created_at": item.created_at,
        "is_pinned": bool(item.is_pinned),
        "is_mine": item.user_id == viewer.id,
        "like_count": db.scalar(select(func.count()).select_from(SocialPostCommentLike).where(
            SocialPostCommentLike.comment_id == item.id)) or 0,
        "liked_by_me": bool(db.get(SocialPostCommentLike, (item.id, viewer.id))),
    }


@app.get("/v1/posts/{post_id}/comments")
def list_social_comments(post_id: int, limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db), user: User = Depends(current_user)):
    _social_access(db, post_id, user)
    items = db.scalars(select(SocialPostComment).where(
        SocialPostComment.post_id == post_id).order_by(
        SocialPostComment.is_pinned.desc(), SocialPostComment.created_at.asc(), SocialPostComment.id.asc()).limit(limit))
    return [_social_comment_row(db, item, user) for item in items]


@app.post("/v1/posts/{post_id}/comments", status_code=201)
def create_social_comment(post_id: int, payload: SocialCommentInput,
    db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_chat_write(db,user.id)
    account_ban=active_ban(db,user.id)
    if account_ban:
        from .moderation import ban_until
        raise HTTPException(status_code=403,detail=ban_until(account_ban))
    _social_access(db, post_id, user)
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Yorum boş olamaz")
    if payload.parent_id is not None:
        parent = db.get(SocialPostComment, payload.parent_id)
        if not parent or parent.post_id != post_id:
            raise HTTPException(status_code=404, detail="Yanıtlanacak yorum bulunamadı")
        parent_id = parent.parent_id or parent.id
    else:
        parent_id = None
    item = SocialPostComment(post_id=post_id, user_id=user.id, parent_id=parent_id, body=body)
    db.add(item); db.commit(); db.refresh(item)
    return _social_comment_row(db, item, user)


@app.patch("/v1/posts/{post_id}/comments/{comment_id}")
def edit_social_comment(post_id: int, comment_id: int, payload: SocialCommentInput,
    db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_chat_write(db,user.id)
    _social_access(db, post_id, user)
    item = db.get(SocialPostComment, comment_id)
    if not item or item.post_id != post_id: raise HTTPException(status_code=404, detail="Yorum bulunamadı")
    if item.user_id != user.id: raise HTTPException(status_code=403, detail="Yalnızca kendi yorumunu düzenleyebilirsin")
    body = payload.body.strip()
    if not body: raise HTTPException(status_code=400, detail="Yorum boş olamaz")
    item.body = body
    db.commit(); db.refresh(item)
    return _social_comment_row(db, item, user)


@app.put("/v1/posts/{post_id}/comments/{comment_id}/pin")
def pin_social_comment(post_id: int, comment_id: int,
    db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = _social_access(db, post_id, user)
    if post.user_id != user.id:
        raise HTTPException(status_code=403, detail="Yalnızca kendi gönderindeki yorumu sabitleyebilirsin")
    db.scalar(select(SocialPost).where(SocialPost.id == post_id).with_for_update())
    item = db.get(SocialPostComment, comment_id)
    if not item or item.post_id != post_id:
        raise HTTPException(status_code=404, detail="Yorum bulunamadı")
    db.execute(update(SocialPostComment).where(SocialPostComment.post_id == post_id).values(is_pinned=False))
    item.is_pinned = True
    db.commit()
    return {"id": comment_id, "is_pinned": True}


@app.delete("/v1/posts/{post_id}/comments/{comment_id}/pin")
def unpin_social_comment(post_id: int, comment_id: int,
    db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = _social_access(db, post_id, user)
    if post.user_id != user.id:
        raise HTTPException(status_code=403, detail="Yalnızca kendi gönderindeki sabitlemeyi kaldırabilirsin")
    item = db.get(SocialPostComment, comment_id)
    if not item or item.post_id != post_id:
        raise HTTPException(status_code=404, detail="Yorum bulunamadı")
    item.is_pinned = False
    db.commit()
    return {"id": comment_id, "is_pinned": False}


@app.post("/v1/posts/{post_id}/comments/{comment_id}/like")
def like_social_comment(post_id: int, comment_id: int, db: Session = Depends(get_db),
    user: User = Depends(current_user)):
    _social_access(db, post_id, user)
    item = db.get(SocialPostComment, comment_id)
    if not item or item.post_id != post_id:
        raise HTTPException(status_code=404, detail="Yorum bulunamadı")
    if not db.get(SocialPostCommentLike, (comment_id, user.id)):
        db.add(SocialPostCommentLike(comment_id=comment_id, user_id=user.id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    return _social_comment_row(db, item, user)


@app.delete("/v1/posts/{post_id}/comments/{comment_id}/like")
def unlike_social_comment(post_id: int, comment_id: int, db: Session = Depends(get_db),
    user: User = Depends(current_user)):
    _social_access(db, post_id, user)
    item = db.get(SocialPostComment, comment_id)
    if not item or item.post_id != post_id:
        raise HTTPException(status_code=404, detail="Yorum bulunamadı")
    db.execute(delete(SocialPostCommentLike).where(
        SocialPostCommentLike.comment_id == comment_id,
        SocialPostCommentLike.user_id == user.id))
    db.commit()
    return _social_comment_row(db, item, user)



@app.delete("/v1/posts/{post_id}/comments/{comment_id}")
def delete_social_comment(post_id: int, comment_id: int,
    db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = _social_access(db, post_id, user)
    item = db.get(SocialPostComment, comment_id)
    if not item or item.post_id != post_id:
        raise HTTPException(status_code=404, detail="Yorum bulunamadı")
    if post.user_id != user.id and item.user_id != user.id:
        raise HTTPException(status_code=403, detail="Yorumu silme yetkin yok")
    db.delete(item); db.commit()
    return {"deleted": True, **_social_counts(db, post_id, user.id)}


@app.get("/v1/stories")
def list_stories(limit: int = Query(default=100, ge=1, le=200), db: Session = Depends(get_db), user: User = Depends(current_user)):
    now = datetime.now(timezone.utc)
    db.execute(delete(SocialStory).where(SocialStory.expires_at <= now)); db.commit()
    following = set(db.scalars(select(UserFollow.following_id).where(UserFollow.follower_id == user.id)))
    visible_ids = following | {user.id}
    blocked = set(db.scalars(select(UserBlock.blocked_id).where(UserBlock.blocker_id == user.id)))
    blocked |= set(db.scalars(select(UserBlock.blocker_id).where(UserBlock.blocked_id == user.id)))
    rows = list(db.scalars(select(SocialStory).where(SocialStory.user_id.in_(visible_ids),
        SocialStory.expires_at > now).order_by(SocialStory.created_at.desc()).limit(limit)))
    ids = [r.id for r in rows]
    authors = {r.id:r for r in db.scalars(select(User).where(User.id.in_({r.user_id for r in rows})))}
    viewed_ids = set(db.scalars(select(SocialStoryView.story_id).where(SocialStoryView.story_id.in_(ids), SocialStoryView.viewer_id == user.id)))
    views = dict(db.execute(select(SocialStoryView.story_id, func.count()).where(SocialStoryView.story_id.in_(ids)).group_by(SocialStoryView.story_id)).all())
    likes = dict(db.execute(select(SocialStoryLike.story_id, func.count()).where(SocialStoryLike.story_id.in_(ids)).group_by(SocialStoryLike.story_id)).all())
    liked_ids = set(db.scalars(select(SocialStoryLike.story_id).where(SocialStoryLike.story_id.in_(ids), SocialStoryLike.user_id == user.id)))
    result = []
    for story in rows:
        author = authors.get(story.user_id)
        if not author or not author.is_active or author.id in blocked: continue
        viewed = story.user_id != user.id and story.id in viewed_ids
        count = int(views.get(story.id,0))
        result.append({"id": story.id, "user_id": author.id, "nickname": author.nickname,
            "avatar": author.avatar, "avatar_asset": author.avatar_asset, "caption": story.caption,
            "created_at": story.created_at, "expires_at": story.expires_at, "viewed": viewed,
            "view_count": count, "like_count": int(likes.get(story.id,0)),
            "liked": story.id in liked_ids, "mime_type": story.mime_type,
            "media_kind": "video" if story.mime_type.startswith("video/") else "image",
            "media_url": f"/stories/{story.id}/media", "is_mine": story.user_id == user.id})
    return result


@app.post("/v1/stories", status_code=201)
@database_task
async def create_story(file: UploadFile = File(...), caption: str = Form(default=""),
    db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_chat_write(db,user.id)
    mime, data = await _read_social_upload(file, 50 * 1024 * 1024)
    story = SocialStory(user_id=user.id, caption=caption.strip()[:300], mime_type=mime,
        image_bytes=data, expires_at=datetime.now(timezone.utc) + timedelta(hours=24))
    db.add(story); db.commit(); db.refresh(story)
    return {"id": story.id, "user_id": user.id, "caption": story.caption, "created_at": story.created_at,
        "expires_at": story.expires_at, "mime_type": mime,
        "media_kind": "video" if mime.startswith("video/") else "image",
        "media_url": f"/stories/{story.id}/media", "view_count": 0, "viewed": False, "is_mine": True}


@app.get("/v1/stories/{story_id}/media")
def get_story_media(story_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    story = db.get(SocialStory, story_id)
    if not story or story.expires_at <= datetime.now(timezone.utc) or story.image_bytes is None:
        raise HTTPException(status_code=410, detail="Story süresi dolmuş veya kaldırılmış")
    if story.user_id != user.id:
        blocked = db.scalar(select(UserBlock.id).where(or_(
            and_(UserBlock.blocker_id == user.id, UserBlock.blocked_id == story.user_id),
            and_(UserBlock.blocker_id == story.user_id, UserBlock.blocked_id == user.id))))
        follows = db.scalar(select(UserFollow.id).where(
            UserFollow.follower_id == user.id, UserFollow.following_id == story.user_id))
        if blocked or not follows: raise HTTPException(status_code=404, detail="Story bulunamadı")
        if not db.scalar(select(SocialStoryView.id).where(
            SocialStoryView.story_id == story.id, SocialStoryView.viewer_id == user.id)):
            db.add(SocialStoryView(story_id=story.id, viewer_id=user.id)); db.commit()
    return Response(content=story.image_bytes, media_type=story.mime_type,
        headers={"Cache-Control":"private, no-store, max-age=0", "Pragma":"no-cache", "X-Content-Type-Options":"nosniff"})


@app.delete("/v1/stories/{story_id}")
def delete_story(story_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    story = db.get(SocialStory, story_id)
    if not story: raise HTTPException(status_code=404, detail="Story bulunamadı")
    if story.user_id != user.id: raise HTTPException(status_code=403, detail="Yalnızca kendi story'ni silebilirsin")
    db.delete(story); db.commit()
    return {"deleted": True, "story_id": story_id}


def _visible_story(db: Session, story_id: int, viewer: User) -> SocialStory:
    story = db.get(SocialStory, story_id)
    if not story or story.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="Story bulunamadı")
    if story.user_id != viewer.id:
        blocked = db.scalar(select(UserBlock.id).where(or_(
            and_(UserBlock.blocker_id == viewer.id, UserBlock.blocked_id == story.user_id),
            and_(UserBlock.blocker_id == story.user_id, UserBlock.blocked_id == viewer.id))))
        follows = db.scalar(select(UserFollow.id).where(UserFollow.follower_id == viewer.id,
            UserFollow.following_id == story.user_id))
        if blocked or not follows: raise HTTPException(status_code=404, detail="Story bulunamadı")
    return story


@app.post("/v1/stories/{story_id}/like")
def toggle_story_like(story_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    story = _visible_story(db, story_id, user)
    like = db.get(SocialStoryLike, (story.id, user.id))
    if like: db.delete(like)
    else:
        db.add(SocialStoryLike(story_id=story.id, user_id=user.id))
        if story.user_id != user.id:
            db.add(Notification(user_id=story.user_id, kind="story_like", title=user.nickname,
                body="Story'ni beğendi."))
    db.commit()
    return {"liked": not bool(like), "like_count": int(db.scalar(select(func.count()).select_from(SocialStoryLike).where(SocialStoryLike.story_id == story.id)) or 0)}


@app.post("/v1/stories/{story_id}/reply", response_model=MessageOut)
@database_task
async def reply_to_story(story_id: int, text: str = Form(...), snapshot: UploadFile | None = File(default=None),
    db: Session = Depends(get_db), user: User = Depends(current_user)):
    story = _visible_story(db, story_id, user)
    require_feature(db, user.id, [story.user_id])
    text = text.strip()
    if not text or len(text) > 1000: raise HTTPException(status_code=400, detail="Yorum 1-1000 karakter olmalı")
    if story.user_id == user.id: raise HTTPException(status_code=400, detail="Kendi story'ne yorum gönderemezsin")
    conversation = ConversationRepository(db).find_direct([user.id, story.user_id])
    if not conversation:
        conversation_id = "dm_" + "_".join(sorted((user.id, story.user_id)))
        try: conversation = ConversationRepository(db).create_direct(conversation_id, [user.id, story.user_id])
        except IntegrityError:
            db.rollback()
            conversation = ConversationRepository(db).find_direct([user.id, story.user_id])
            if not conversation: raise HTTPException(status_code=409, detail="Konuşma açılamadı")
    image = story.image_bytes if story.mime_type.startswith("image/") else None
    mime = story.mime_type if image else "image/jpeg"
    if snapshot:
        if snapshot.content_type != "image/jpeg": raise HTTPException(status_code=415, detail="Story önizlemesi JPEG olmalı")
        image = await snapshot.read(1_500_001)
        if len(image) > 1_500_000 or not image.startswith(b"\xff\xd8\xff"):
            raise HTTPException(status_code=413, detail="Story önizlemesi geçersiz")
        mime = "image/jpeg"
    if image and len(image) > 1_500_000:
        try:
            with Image.open(BytesIO(image)) as source:
                source.thumbnail((640, 640))
                output = BytesIO(); source.convert("RGB").save(output, format="JPEG", quality=78)
                image, mime = output.getvalue(), "image/jpeg"
        except Exception: image = None
    message = Message(conversation_id=conversation.id, sender_id=user.id, text=f"[Story yanıtı #{story.id}] {text}")
    db.add(message); db.flush()
    if image: db.add(MessageMedia(message_id=message.id, media_type="image", mime_type=mime, data=image))
    locked_story_folder = _folder(db, story.user_id, conversation.id)
    db.add(Notification(user_id=story.user_id, kind="dm_message", title=user.nickname,
        body="Kilitli sohbette yeni mesaj" if locked_story_folder and locked_story_folder.locked else "Story'ne yorum yaptı: " + text[:100]))
    db.commit(); db.refresh(message)
    event = {"type":"dm_message", "conversation_id":conversation.id, "message_id":message.id,
        "sender_id":user.id, "sender_nickname":user.nickname, "text":message.text,
        "media_type":"image" if image else None,
        "media_url":f"/messages/{conversation.id}/{message.id}/media" if image else None,
        "created_at":message.created_at.isoformat() if message.created_at else None}
    await _send_dm_event(db, story.user_id, event); await _send_dm_event(db, user.id, event)
    return _message_out(db, message, user.id)


@app.post("/v1/messages/{conversation_id}/delete")
def hide_messages(conversation_id: str, payload: dict, x_eris_dm_vault: str | None = Header(default=None), db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not ConversationRepository(db).is_member(conversation_id, user.id):
        raise HTTPException(status_code=403, detail="Bu konuşmaya erişiminiz yok")
    require_unlocked(db, user.id, conversation_id, x_eris_dm_vault)
    all_messages = payload.get("all") is True
    ids = list(dict.fromkeys(int(value) for value in (payload.get("message_ids") or []) if str(value).isdigit()))
    if not all_messages and (not ids or len(ids) > 100):
        raise HTTPException(status_code=400, detail="1 ile 100 arasında mesaj seçin")
    if all_messages:
        ids = list(db.scalars(select(Message.id).where(Message.conversation_id == conversation_id)))
    if not ids:
        return {"deleted": 0, "scope": "me"}
    rows = list(db.scalars(select(Message).where(Message.id.in_(ids), Message.conversation_id == conversation_id)))
    for row in rows:
        if not db.scalar(select(MessageHidden.id).where(MessageHidden.message_id == row.id, MessageHidden.user_id == user.id)):
            db.add(MessageHidden(message_id=row.id, user_id=user.id))
    db.commit()
    return {"deleted": len(rows), "scope": "me"}


@app.post("/v1/conversations/{conversation_id}/pins/{message_id}")
def pin_message(conversation_id: str, message_id: int, x_eris_dm_vault: str | None = Header(default=None), db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not ConversationRepository(db).is_member(conversation_id, user.id): raise HTTPException(status_code=403, detail="Bu konuşmaya erişiminiz yok")
    require_unlocked(db, user.id, conversation_id, x_eris_dm_vault)
    message = db.get(Message, message_id)
    if not message or message.conversation_id != conversation_id: raise HTTPException(status_code=404, detail="Mesaj bulunamadı")
    if db.scalar(select(PinnedMessage.id).where(PinnedMessage.conversation_id == conversation_id, PinnedMessage.message_id == message_id)):
        return {"pinned": True}
    count = int(db.scalar(select(func.count(PinnedMessage.id)).where(PinnedMessage.conversation_id == conversation_id)) or 0)
    if count >= 5: raise HTTPException(status_code=409, detail="Bir konuşmada en fazla 5 mesaj sabitlenebilir")
    db.add(PinnedMessage(conversation_id=conversation_id, message_id=message_id, pinned_by=user.id)); db.commit()
    return {"pinned": True}


@app.delete("/v1/conversations/{conversation_id}/pins/{message_id}")
def unpin_message(conversation_id: str, message_id: int, x_eris_dm_vault: str | None = Header(default=None), db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not ConversationRepository(db).is_member(conversation_id, user.id): raise HTTPException(status_code=403, detail="Bu konuşmaya erişiminiz yok")
    require_unlocked(db, user.id, conversation_id, x_eris_dm_vault)
    row = db.scalar(select(PinnedMessage).where(PinnedMessage.conversation_id == conversation_id, PinnedMessage.message_id == message_id))
    if row: db.delete(row); db.commit()
    return {"pinned": False}


@app.get("/v1/me/message-restriction")
def get_message_restriction(db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(DirectMessageRestriction, user.id)
    return {"enabled": bool(row and row.enabled), "gift_key": row.gift_key if row else next(iter(GIFT_CATALOG)),
        "gift_price": GIFT_CATALOG.get(row.gift_key, 0) if row else GIFT_CATALOG[next(iter(GIFT_CATALOG))]}


@app.put("/v1/me/message-restriction")
def set_message_restriction(payload: dict, db: Session = Depends(get_db), user: User = Depends(current_user)):
    gift_key = str(payload.get("gift_key") or "")
    if gift_key not in GIFT_CATALOG: raise HTTPException(status_code=400, detail="Katalogda olmayan hediye")
    row = db.get(DirectMessageRestriction, user.id)
    if row is None:
        row = DirectMessageRestriction(owner_id=user.id, enabled=bool(payload.get("enabled")), gift_key=gift_key); db.add(row)
    else:
        row.enabled = bool(payload.get("enabled")); row.gift_key = gift_key
    db.commit()
    return {"enabled": row.enabled, "gift_key": row.gift_key, "gift_price": GIFT_CATALOG[row.gift_key]}


@app.get("/v1/users/{user_id}/message-restriction")
def public_message_restriction(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    target = db.get(User, user_id)
    if not target: raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    row = db.get(DirectMessageRestriction, target.id)
    return {"enabled": bool(row and row.enabled), "gift_key": row.gift_key if row else None,
        "gift_price": GIFT_CATALOG.get(row.gift_key, 0) if row else 0,
        "unlocked": bool(db.scalar(select(DirectMessageUnlock.id).where(DirectMessageUnlock.owner_id == target.id, DirectMessageUnlock.sender_id == user.id)))}


@app.get("/v1/users/{user_id}/fan-leaderboard")
def personal_fan_leaderboard(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not db.get(User, user_id): raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if active_ban(db,user_id): return []
    return fan_leaderboard(db, user_id)


@app.get("/v1/users/{user_id}/received-gifts")
def received_gifts(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not db.get(User,user_id): raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if active_ban(db,user_id): return []
    counts = {}
    for key, quantity in db.execute(select(RoomGiftEvent.gift_key, func.sum(RoomGiftEvent.quantity))
            .where(RoomGiftEvent.recipient_id == user_id).group_by(RoomGiftEvent.gift_key)):
        counts[key] = int(quantity or 0)
    for gift, message in db.execute(select(DirectMessageGift, Message)
            .join(Message, Message.id == DirectMessageGift.message_id)
            .where(DirectMessageGift.recipient_id == user_id)):
        match = re.search(r"×(\d+)$", message.text or "")
        counts[gift.gift_key] = counts.get(gift.gift_key,0) + (int(match.group(1)) if match else 1)
    return [{"gift_key":key,"count":count,"image_url":GIFT_META.get(key,{}).get("image_url")}
            for key,count in sorted(counts.items(),key=lambda row:(-row[1],row[0]))]


@app.get("/v1/message-gifts")
def message_gifts():
    return [{"gift_key": key, "unit_price": price, **gift_visual(key)} for key, price in GIFT_CATALOG.items()]


@app.post("/v1/messages/{conversation_id}/gifts")
@database_task
async def send_direct_gift(conversation_id: str, payload: dict, x_eris_dm_vault: str | None = Header(default=None), db: Session = Depends(get_db), user: User = Depends(current_user)):
    repo = ConversationRepository(db)
    if not repo.is_member(conversation_id, user.id): raise HTTPException(status_code=403, detail="Bu konuşmaya erişiminiz yok")
    require_unlocked(db, user.id, conversation_id, x_eris_dm_vault)
    recipients = [member_id for member_id in repo.members(conversation_id) if member_id != user.id]
    if len(recipients) != 1 or db.scalar(select(Family.id).where(Family.chat_conversation_id == conversation_id)):
        raise HTTPException(status_code=400, detail="Bu hediye DM konuşmalarında kullanılabilir")
    recipient_id = recipients[0]; require_feature(db, user.id, [recipient_id])
    gift_key = str(payload.get("gift_key") or ""); price = GIFT_CATALOG.get(gift_key)
    quantity = payload.get("quantity", 1)
    if type(quantity) is not int or quantity not in (1, 3, 5, 9, 49, 99):
        raise HTTPException(status_code=400, detail="Geçersiz hediye adedi")
    if price is None: raise HTTPException(status_code=400, detail="Katalogda olmayan hediye")
    restriction = db.get(DirectMessageRestriction, recipient_id)
    unlock = db.scalar(select(DirectMessageUnlock).where(DirectMessageUnlock.owner_id == recipient_id, DirectMessageUnlock.sender_id == user.id))
    if restriction and restriction.enabled and not unlock and gift_key != restriction.gift_key:
        raise HTTPException(status_code=402, detail=f"Bu kullanıcı için {restriction.gift_key} hediyesi gerekli")
    total_price = price * quantity
    receiver_amount = total_price * 70 // 100
    relationship_routes.lock_users(db, [user.id, recipient_id])
    charged = db.execute(update(User).where(User.id == user.id, User.lidya >= total_price).values(lidya=User.lidya - total_price))
    if charged.rowcount != 1: db.rollback(); raise HTTPException(status_code=400, detail="Yetersiz Lidya")
    db.execute(update(User).where(User.id == recipient_id).values(lidya=User.lidya + receiver_amount))
    message = Message(conversation_id=conversation_id, sender_id=user.id, text="🎁 " + gift_key + (" ×" + str(quantity) if quantity > 1 else "")); db.add(message); db.flush()
    db.add(DirectMessageGift(message_id=message.id, sender_id=user.id, recipient_id=recipient_id, gift_key=gift_key, unit_price=total_price, recipient_amount=receiver_amount))
    if restriction and restriction.enabled and not unlock:
        db.add(DirectMessageUnlock(owner_id=recipient_id, sender_id=user.id, gift_key=gift_key))
    locked_gift_folder = _folder(db, recipient_id, conversation_id)
    db.add(Notification(user_id=recipient_id, kind="dm_gift", title="Yeni hediye",
        body="Kilitli sohbette yeni hediye" if locked_gift_folder and locked_gift_folder.locked else user.nickname + " sana " + gift_key + " gönderdi."))
    from .vip_spending import record_spend
    record_spend(db,user.id,total_price,"dm_gift",str(message.id))
    db.commit(); db.refresh(message)
    event = {"type":"dm_message", "conversation_id":conversation_id, "message_id":message.id, "sender_id":user.id,
        "sender_nickname":user.nickname, "text":message.text, "gift_key":gift_key, "gift_id":GIFT_META[gift_key]["id"], "gift_image_url":GIFT_META[gift_key]["image_url"], "gift_price":total_price,"quantity":quantity,
        "created_at":message.created_at.isoformat() if message.created_at else None}
    for member_id in repo.members(conversation_id): await _send_dm_event(db, member_id, event)
    return _message_out(db, message, user.id)


@live_socket
async def _bounded_send(websocket, payload):
    await asyncio.wait_for(websocket.send_json(payload), timeout=3)


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[str, set[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket, subprotocol: str | None = None) -> None:
        await websocket.accept(subprotocol=subprotocol)
        self.connections.setdefault(user_id, set()).add(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        sockets = self.connections.get(user_id)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self.connections.pop(user_id, None)

    @live_socket
    async def send_user(self, user_id: str, payload: dict) -> None:
        sockets = list(self.connections.get(user_id, set()))
        results = await asyncio.gather(*(_bounded_send(ws, payload) for ws in sockets), return_exceptions=True)
        for ws, result in zip(sockets, results):
            if isinstance(result, BaseException):
                self.disconnect(user_id, ws)



manager = ConnectionManager()


async def _send_dm_event(db: Session, user_id: str, event: dict) -> None:
    folder = _folder(db, user_id, str(event.get("conversation_id") or ""))
    if folder and folder.locked:
        # The socket has no vault credential. Deliver only an opaque change signal.
        await manager.send_user(user_id, {"type": "dm_message", "conversation_id": event["conversation_id"],
                                           "locked": True})
    else:
        await manager.send_user(user_id, event)


def websocket_session_active(token: str) -> bool:
    with Session(engine) as db:
        user = get_user_from_token(db, token)
        return bool(user and user.is_active and not active_ban(db,user.id) and not support_workflow.remaining_restriction(db, user.id) and not ban_workflow.restriction(db,user.id))


def websocket_token(websocket: WebSocket) -> str | None:
    # Browser WebSocket APIs cannot set Authorization; keep credentials out of URLs/logs.
    for protocol in websocket.scope.get("subprotocols", []):
        if protocol.startswith("token."):
            return protocol[6:]
    return None


discovery_live.register_auth(current_user, engine, websocket_token, get_user_from_token, websocket_session_active)
app.include_router(discovery_live.router)


def _load_room_socket(token, room_id):
    with Session(engine) as db:
        user = get_user_from_token(db, token)
        if not user or not user.is_active or active_ban(db,user.id) or support_workflow.remaining_restriction(db, user.id) or ban_workflow.restriction(db,user.id):
            raise HTTPException(403, "geçersiz oturum")
        room = db.get(Room, room_id) or db.query(Room).filter(Room.public_id == room_id).first()
        internal_room_id = room.id if room else room_id
        member = db.query(RoomMember).filter(RoomMember.room_id == internal_room_id, RoomMember.user_id == user.id).first()
        banned = db.query(RoomBan).filter(RoomBan.room_id == internal_room_id, RoomBan.user_id == user.id).first() or active_room_user_ban(db,internal_room_id,user.id)
        owner_blocked = bool(room and db.scalar(select(UserBlock.id).where(
            UserBlock.blocker_id == room.owner_id, UserBlock.blocked_id == user.id
        )))
        if not room or not member or banned or owner_blocked:
            raise HTTPException(403, "oda üyeliği gerekli")
        history = (db.query(RoomChatMessage).filter(RoomChatMessage.room_id == internal_room_id).order_by(RoomChatMessage.id.desc()).limit(50).all())
        history.reverse()
        history_users = {row.id: row for row in db.query(User.id, User.nickname, User.avatar, User.avatar_asset, User.frame_asset).filter(User.id.in_({m.user_id for m in history})).all()} if history else {}
        history_ids = {m.user_id for m in history}
        fan_totals = gift_totals(db, history_ids)
        system_ids=set(db.scalars(select(seat_workflow.RoomSystemEntry.message_id).where(seat_workflow.RoomSystemEntry.message_id.in_([m.id for m in history]))))
        reward_bubbles={uid:relationship_routes.rewards.selected(db,uid,'bubble') for uid in history_ids}
        entrance_asset=relationship_routes.rewards.selected(db,user.id,'entrance')
        entrance_house=relationship_routes.my_couple(db,user.id)
        entrance_payload={'type':'room_entrance','user_id':user.id,'nickname':user.nickname,'avatar':user.avatar,'avatar_asset':user.avatar_asset,'entrance_asset':entrance_asset,'ring_asset':relationship_routes.ring_asset(entrance_house.ring) if entrance_house and entrance_house.ring else None}
        history_payload = [{"type":"room_chat","bubble_asset":reward_bubbles.get(m.user_id),"system":m.id in system_ids,"id":m.id,"room_id":room_id,"user_id":m.user_id,"nickname":history_users[m.user_id].nickname if m.user_id in history_users else "Kullanıcı","avatar":history_users[m.user_id].avatar if m.user_id in history_users else None,"avatar_asset":history_users[m.user_id].avatar_asset if m.user_id in history_users else None,"frame_asset":history_users[m.user_id].frame_asset if m.user_id in history_users else None,"fan_level":level_for_total(fan_totals.get(m.user_id, 0)),"text":m.text,"created_at":m.created_at.isoformat() if m.created_at else None} for m in history]
    return user, room, member, internal_room_id, history_payload, entrance_asset, entrance_payload


def _room_socket_access(internal_room_id, room_id, user_id):
    with Session(engine) as db:
        room = db.get(Room, internal_room_id) or db.query(Room).filter(Room.public_id == room_id).first()
        member = db.query(RoomMember).filter(RoomMember.room_id == internal_room_id, RoomMember.user_id == user_id).first()
        banned = db.query(RoomBan).filter(RoomBan.room_id == internal_room_id, RoomBan.user_id == user_id).first() or active_room_user_ban(db,internal_room_id,user_id)
        owner_blocked = bool(room and db.scalar(select(UserBlock.id).where(
            UserBlock.blocker_id == room.owner_id, UserBlock.blocked_id == user_id
        )))
        if not room or not member or banned or owner_blocked:
                raise HTTPException(403, "oda erişiminiz yok")
    return room, member


def _room_socket_music(internal_room_id, user, music_id, action, position):
    with Session(engine) as db:
        room = db.get(Room, internal_room_id)
        member = db.query(RoomMember).filter(RoomMember.room_id == internal_room_id, RoomMember.user_id == user.id).first()
        if not room or not member:
            return None
        seated = db.scalar(select(RoomSeat.id).where(
            RoomSeat.room_id == internal_room_id, RoomSeat.user_id == user.id, RoomSeat.muted.is_(False)))
        if action in {"play", "seek"} and not seated:
            return None
        music = db.query(RoomMusic).filter(RoomMusic.id == music_id, RoomMusic.room_id == internal_room_id).first()
        if not music:
            return None

        # Müzik sahibi kendi parçasını kontrol edebilir;
        # oda sahibi veya aktif moderatör ise oda müziğini yönetebilir.
        is_owner = room.owner_id == user.id
        is_moderator = bool(
            db.query(RoomModerator.id)
            .filter(
                RoomModerator.room_id == room.id,
                RoomModerator.user_id == user.id,
            )
            .first()
        )
        if music.user_id != user.id and not is_owner and not is_moderator:
            return None
        now = datetime.now(timezone.utc)
        if action == "seek":
            music.position_seconds = position
            if music.is_playing: music.started_at = now
        elif action == "play":
            music.is_playing = True; music.started_at = now
        elif action == "pause":
            if music.is_playing and music.started_at: music.position_seconds += max(0, int((now-music.started_at).total_seconds()))
            music.is_playing = False; music.started_at = None
        else:
            music.is_playing = False; music.position_seconds = 0; music.started_at = None
        db.commit()
        payload = {"type":"music_sync","music_id":music.id,"action":action,"position_seconds":music.position_seconds,"is_playing":music.is_playing,"started_at":music.started_at.isoformat() if music.started_at else None,"from_user_id":user.id}
    return payload


def _room_socket_chat(internal_room_id, room_id, user, text_value):
    with Session(engine) as db:
        room = db.get(Room, internal_room_id) or db.query(Room).filter(Room.public_id == room_id).first()
        member = db.query(RoomMember).filter(RoomMember.room_id == internal_room_id, RoomMember.user_id == user.id).first()
        banned = db.query(RoomBan).filter(RoomBan.room_id == internal_room_id, RoomBan.user_id == user.id).first() or active_room_user_ban(db,internal_room_id,user.id)
        if not room or not member or banned:
            return {"close": True}
        admin_row=db.get(AdminRole,user.id)
        if admin_row and admin_row.ghost_mode:
            return {"error": {"type":"room_chat_error","code":"ghost_mode","message":"Chat’e yazabilmek için önce Ghost Mode’u kapatın."}}
        restriction = active_ban(db, user.id) or active_ban(db, user.id, chat=True)
        if restriction:
            from .moderation import ban_until
            return {"error": {"type":"room_chat_error",**chat_ban_detail(db,restriction)} if isinstance(restriction,ChatBan) else {"type":"room_chat_error","code":"admin_ban","message":ban_until(restriction)}}
        if not room.chat_enabled:
            return {"error": {"type":"room_chat_error","code":"chat_disabled","message":"Oda sohbeti kapalı."}}
        chat_muted = db.scalar(select(RoomChatMute.id).where(
            RoomChatMute.room_id == internal_room_id, RoomChatMute.user_id == user.id))
        if chat_muted:
            return {"error": {"type":"room_chat_error","code":"chat_muted","message":"Oda sohbetinde susturuldunuz."}}
        msg = RoomChatMessage(room_id=internal_room_id, user_id=user.id, text=text_value)
        db.add(msg)
        db.commit()
        db.refresh(msg)
        fan_total = gift_totals(db, {user.id})[user.id]
        payload = {"type":"room_chat","bubble_asset":relationship_routes.rewards.selected(db,user.id,"bubble"),"fan_level":level_for_total(fan_total),"id":msg.id,"room_id":room_id,"user_id":user.id,"nickname":user.nickname,"avatar":user.avatar,"avatar_asset":user.avatar_asset,"frame_asset":user.frame_asset,"text":msg.text,"created_at":msg.created_at.isoformat() if msg.created_at else None}
    return {"payload": payload}


def _room_socket_can_signal(room_id, user_id, kind):
    with Session(engine) as db:
        admin = db.get(AdminRole, user_id)
        if admin and admin.ghost_mode:
            return False
        return kind == "rtc_leave" or bool(db.scalar(select(RoomSeat.id).where(
            RoomSeat.room_id == room_id, RoomSeat.user_id == user_id, RoomSeat.muted.is_(False))))


def _socket_user_id(token):
    with Session(engine) as db:
        user = get_user_from_token(db, token)
        return user.id if user else None


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    bind_live_loop()
    token = websocket_token(websocket)
    if not token:
        await websocket.close(code=1008, reason="token gerekli")
        return
    if not await run_in_threadpool(websocket_session_active, token):
        await websocket.close(code=1008, reason="geçersiz oturum")
        return
    user_id = await run_in_threadpool(_socket_user_id, token)
    if not user_id:
        await websocket.close(code=1008, reason="geçersiz oturum")
        return
    await manager.connect(user_id, websocket, subprotocol="erischat")
    try:
        while True:
            data = await websocket.receive_json()
            if not await run_in_threadpool(websocket_session_active, token):
                manager.disconnect(user_id, websocket)
                room_socket_users.pop(websocket, None)
                await websocket.close(code=1008, reason="oturum sona erdi")
                return
            if isinstance(data, dict) and data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception:
        manager.disconnect(user_id, websocket)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass


room_chat_connections: dict[str, set[WebSocket]] = {}
room_rtc_users: dict[str, dict[WebSocket, str]] = {}
room_socket_users: dict[WebSocket, tuple[str, str]] = {}


@live_socket
async def disconnect_room_ban_user(user_id: str, room_id: str) -> None:
    for ws,(socket_room,socket_user) in list(room_socket_users.items()):
        if socket_user!=user_id or socket_room!=room_id:continue
        visible=room_rtc_users.get(room_id,{}).pop(ws,None)
        room_socket_users.pop(ws,None);room_chat_connections.get(room_id,set()).discard(ws)
        if visible:
            for peer in list(room_rtc_users.get(room_id,{})):
                try:await peer.send_json({"type":"rtc_peer_left","user_id":user_id})
                except Exception:pass
        try:
            await ws.send_json({"type":"room_user_banned","room_id":room_id,"message":"Yönetim tarafından bu odadan yasaklandınız."})
            await ws.close(code=1008,reason="Oda yasağı")
        except Exception:pass


@live_socket
async def disconnect_ban_user(user_id: str) -> None:
    await disconnect_support_agent(user_id, notify=False)
    for ws in list(manager.connections.get(user_id, set())):
        manager.disconnect(user_id,ws)
        try: await ws.close(code=1008,reason="Yönetim işlemi nedeniyle erişim kısıtlandı")
        except Exception: pass


@live_socket
async def disconnect_support_agent(user_id: str, notify: bool = True) -> None:
    for ws, (room_id, socket_user_id) in list(room_socket_users.items()):
        if socket_user_id != user_id:
            continue
        visible = room_rtc_users.get(room_id, {}).pop(ws, None)
        room_socket_users.pop(ws, None)
        room_chat_connections.get(room_id, set()).discard(ws)
        if visible:
            for peer in list(room_rtc_users.get(room_id, {})):
                try:
                    await peer.send_json({"type": "rtc_peer_left", "user_id": user_id})
                except Exception:
                    pass
        try:
            if notify: await ws.send_json({"type": "support_restricted", "remaining_seconds": 180})
            await ws.close(code=1008)
        except Exception:
            pass


@live_socket
async def transition_room_ghost(user_id: str, enabled: bool) -> None:
    # Remove public RTC presence before reconnecting all tabs under the new rules.
    for ws, (room_id, socket_user_id) in list(room_socket_users.items()):
        if socket_user_id != user_id:
            continue
        visible = room_rtc_users.get(room_id, {}).pop(ws, None)
        room_chat_connections.get(room_id, set()).discard(ws)
        room_socket_users.pop(ws, None)
        if visible:
            for peer in list(room_rtc_users.get(room_id, {})):
                try:
                    await peer.send_json({"type": "rtc_peer_left", "user_id": user_id})
                except Exception:
                    pass
        try:
            await ws.send_json({"type": "ghost_mode_changed", "enabled": enabled})
            await ws.close(code=1000)
        except Exception:
            pass


async def _send_room_sockets(sockets, payload):
    results = await asyncio.gather(*(_bounded_send(ws, payload) for ws in sockets), return_exceptions=True)
    for ws, result in zip(sockets, results):
        if isinstance(result, BaseException):
            membership = room_socket_users.pop(ws, None)
            if membership:
                rid, _ = membership
                room_chat_connections.get(rid, set()).discard(ws)
                room_rtc_users.get(rid, {}).pop(ws, None)


@live_socket
async def _broadcast_room_event(room_id: str, payload: dict) -> None:
    await _send_room_sockets(list(room_chat_connections.get(room_id, set())), payload)


@live_socket
async def _broadcast_global_gift_announcement(payload: dict) -> None:
    sockets = list({ws for connections in room_chat_connections.values() for ws in connections})
    await _send_room_sockets(sockets, {"type":"gift_announcement", **payload})


@live_socket
async def _broadcast_room_chat(room_id: str, payload: dict) -> None:
    await _broadcast_room_event(room_id, payload)


@app.websocket("/ws/rooms/{room_id}")
async def room_websocket_endpoint(room_id: str, websocket: WebSocket) -> None:
    bind_live_loop()
    token = websocket_token(websocket)
    if not token:
        await websocket.close(code=1008, reason="token gerekli")
        return
    try:
        user, room, member, internal_room_id, history_payload, entrance_asset, entrance_payload = await run_in_threadpool(_load_room_socket, token, room_id)
    except HTTPException as exc:
        await websocket.close(code=1008, reason=str(exc.detail))
        return
    await websocket.accept(subprotocol="erischat")
    try:
        already_connected=any(room_uid==(internal_room_id,str(user.id)) for room_uid in room_socket_users.values())
        room_socket_users[websocket] = (internal_room_id, str(user.id))
        room_chat_connections.setdefault(internal_room_id, set()).add(websocket)
        if not member.ghost and not already_connected:
            if entrance_asset:await _broadcast_room_chat(internal_room_id,entrance_payload)
            await _broadcast_room_chat(internal_room_id,{'type':'room_chat','system':True,'user_id':user.id,'nickname':'ErisChat','text':user.nickname+' odaya geldi','created_at':datetime.now(timezone.utc).isoformat()})
        existing_peers = list(set(room_rtc_users.get(internal_room_id, {}).values()) - {user.id})
        if not member.ghost:
            room_rtc_users.setdefault(internal_room_id, {})[websocket] = user.id
        await websocket.send_json({"type":"room_history","messages":history_payload})
        await websocket.send_json({"type":"rtc_ready","user_id":str(user.id),"room_id":internal_room_id,"peers":existing_peers})
        for peer_ws in (list(room_rtc_users.get(internal_room_id, {})) if not member.ghost else []):
            if peer_ws is not websocket:
                try: await peer_ws.send_json({"type":"rtc_peer_joined","user_id":str(user.id)})
                except Exception: pass
        while True:
            data = await websocket.receive_json()
            if not await run_in_threadpool(websocket_session_active, token):
                room_chat_connections.get(internal_room_id, set()).discard(websocket)
                room_rtc_users.get(internal_room_id, {}).pop(websocket, None)
                room_socket_users.pop(websocket, None)
                await websocket.close(code=1008, reason="oturum sona erdi")
                return
            try:
                room, member = await run_in_threadpool(_room_socket_access, internal_room_id, room_id, user.id)
            except HTTPException:
                await websocket.close(code=1008, reason="oda erişiminiz yok")
                break
            if member.ghost and websocket in room_rtc_users.get(internal_room_id, {}):
                room_rtc_users[internal_room_id].pop(websocket,None)
                for peer_ws in list(room_rtc_users.get(internal_room_id, {})):
                    try: await peer_ws.send_json({"type":"rtc_peer_left","user_id":str(user.id)})
                    except Exception: pass
            if not isinstance(data, dict):
                continue
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if member.ghost:
                await websocket.send_json({"type": "room_chat_error", "code": "ghost_mode", "message": "Bu işlem için önce Ghost Mode’u kapatın."})
                continue
            if data.get("type") in {"rtc_offer", "rtc_answer", "rtc_ice", "rtc_leave"}:
                target = str(data.get("to_user_id") or "").strip()
                sender_user_id = str(user.id)
                if not target or target == sender_user_id:
                    continue
                if not await run_in_threadpool(_room_socket_can_signal, internal_room_id, user.id, data["type"]):
                    continue
                payload = {"type": data["type"], "from_user_id": sender_user_id, "to_user_id": target, "payload": data.get("payload")}
                for peer_ws, peer_user in list(room_rtc_users.get(internal_room_id, {}).items()):
                    if str(peer_user) == target:
                        try:
                            await peer_ws.send_json(payload)
                        except Exception:
                            room_chat_connections.get(internal_room_id, set()).discard(peer_ws)
                            room_rtc_users.get(internal_room_id, {}).pop(peer_ws, None)
                continue
            if data.get("type") == "music_sync":
                music_id = data.get("music_id")
                action = data.get("action")
                position = max(0, min(86400, int(data.get("position_seconds") or 0)))
                if not isinstance(music_id, int) or action not in {"play","pause","stop","seek"}:
                    continue
                payload = await run_in_threadpool(_room_socket_music, internal_room_id, user, music_id, action, position)
                if payload is None:
                    continue
                await _broadcast_room_event(internal_room_id, payload)
                continue
            if data.get("type") == "room_chat" and not room.chat_enabled:
                await websocket.send_json({"type":"room_chat_error","code":"chat_disabled","message":"Sohbet kapalı."})
                continue
            if data.get("type") != "room_chat":
                continue
            text_value = str(data.get("text") or "").strip()
            if not text_value or len(text_value) > 500:
                continue
            result = await run_in_threadpool(_room_socket_chat, internal_room_id, room_id, user, text_value)
            if result.get("close"):
                await websocket.close(code=1008, reason="oda erişiminiz yok")
                break
            if result.get("error"):
                await websocket.send_json(result["error"])
                continue
            payload = result["payload"]
            await _broadcast_room_chat(internal_room_id, payload)
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        visible = room_rtc_users.get(internal_room_id, {}).pop(websocket, None)
        room_socket_users.pop(websocket, None)
        connections = room_chat_connections.get(internal_room_id, set())
        connections.discard(websocket)
        peers = room_rtc_users.get(internal_room_id, {})
        if visible and visible not in peers.values():
            await asyncio.gather(*(_bounded_send(ws, {"type":"rtc_peer_left", "user_id":str(visible)}) for ws in list(peers)), return_exceptions=True)
        if not connections:
            room_chat_connections.pop(internal_room_id, None)
        if not peers:
            room_rtc_users.pop(internal_room_id, None)



static_dir = Path(__file__).resolve().parents[2] / "frontend"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="frontend")
