from __future__ import annotations

from pathlib import Path
from uuid import uuid4
import logging

from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from .auth import create_anonymous_user
from .cosmetic_routes import router as cosmetic_router
from .config import settings
from .db import Base, engine, get_db
from .models import Conversation, User
from .repositories import ConversationRepository, MessageRepository, UserRepository
from .room_models import Room, RoomBan, RoomGiftEvent, RoomMember, RoomModerator, RoomMusic, RoomSeat, RoomChatMessage
from .room_routes import register_room_auth, router as room_router
from .platform_models import Family, FamilyDonation, FamilyMember, FanProfile, GameBet, GameRound, DiscoveryPreference, Report, RoomAnnouncement, UserLocation, UserPrivacy, VipStatus
from .platform_routes import register_platform_auth, router as platform_router
from .support_models import SupportTicket
from .support_routes import register_support_auth, router as support_router
from .schemas import ConversationCreate, ConversationOut, MessageCreate, MessageOut, NicknameChange, SessionOut, UserCreate, UserOut, UserUpdate
from .services import MessageService
from .session import cleanup_expired_sessions, create_session, get_user_from_token, revoke_session

logger = logging.getLogger("erischat.api")
app = FastAPI(title="ErisChat API", version="1.0.0")
app.include_router(cosmetic_router)

origins = [item.strip() for item in settings.cors_origins.split(",") if item.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins or ["*"], allow_credentials=bool(origins and "*" not in origins), allow_methods=["*"], allow_headers=["*"])


def ensure_user_settings_columns() -> None:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS lidya INTEGER NOT NULL DEFAULT 10000000"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(16) NOT NULL DEFAULT 'unspecified'"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_asset VARCHAR(255)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS frame_asset VARCHAR(255)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(16) NOT NULL DEFAULT 'unspecified'"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_asset VARCHAR(255)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS frame_asset VARCHAR(255)"))


@app.on_event("startup")
def startup() -> None:
    logger.info("ErisChat API startup: environment=%s", settings.environment)
    Base.metadata.create_all(bind=engine)
    ensure_user_settings_columns()
    with Session(engine) as db:
        cleanup_expired_sessions(db)
    logger.info("ErisChat API startup complete")


def bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    return token


def current_user(db: Session = Depends(get_db), authorization: str | None = Header(default=None)) -> User:
    user = get_user_from_token(db, bearer_token(authorization))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş oturum")
    return user


register_room_auth(current_user)
register_platform_auth(current_user)
register_support_auth(current_user)
app.include_router(room_router)
app.include_router(platform_router)
app.include_router(support_router)
