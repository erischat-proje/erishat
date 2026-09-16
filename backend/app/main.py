from __future__ import annotations

from datetime import datetime, timezone
import logging
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from .auth import create_anonymous_user
from .cosmetic_routes import router as cosmetic_router
from .config import settings
from .db import Base, engine, get_db
from .models import Conversation, User
from .repositories import ConversationRepository, MessageRepository, UserRepository
from .schemas import (
    ConversationCreate,
    ConversationOut,
    MessageCreate,
    MessageOut,
    NicknameChange,
    SessionOut,
    UserCreate,
    UserOut,
    UserUpdate,
)
from .services import MessageService
from .session import cleanup_expired_sessions, create_session, get_user_from_token, revoke_session

logger = logging.getLogger("erischat.api")
app = FastAPI(title="ErisChat API", version="0.8.0")
app.include_router(cosmetic_router)

origins = [item.strip() for item in settings.cors_origins.split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=bool(origins and "*" not in origins),
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_user_settings_columns() -> None:
    """Add the two profile-settings columns to existing PostgreSQL installs."""
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
    try:
        Base.metadata.create_all(bind=engine)
        ensure_user_settings_columns()
        with Session(engine) as db:
            cleanup_expired_sessions(db)
    except OperationalError:
        logger.exception("Veritabanı başlatılamadı")
        raise


def current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    user = get_user_from_token(db, token)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş oturum")
    return user


def bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    return token


def ensure_demo_user(db: Session) -> User:
    repo = UserRepository(db)
    user = repo.get("demo")
    if user:
        return user
    return repo.create(User(id="demo", public_id="@eris_48291", nickname="Eris", avatar="🦊", gender="unspecified", lidya=10_000_000))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "erischat-api", "version": "0.8.0"}


@app.get("/v1/users/{user_id}", response_model=UserOut)
def get_user(user_id: str, db: Session = Depends(get_db)) -> User:
    user = UserRepository(db).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return user


@app.post("/v1/users", response_model=SessionOut, status_code=201)
def register_user(payload: UserCreate, db: Session = Depends(get_db)) -> SessionOut:
    try:
        user = create_anonymous_user(db, payload.nickname, payload.avatar, payload.gender)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SessionOut(access_token=create_session(db, user), user=user)


@app.post("/v1/users/demo/ensure", response_model=UserOut)
def create_demo_user(db: Session = Depends(get_db)) -> User:
    return ensure_demo_user(db)


@app.get("/v1/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> User:
    return user


@app.patch("/v1/me", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> User:
    if payload.nickname is not None:
        user.nickname = payload.nickname
    if payload.avatar is not None:
        user.avatar = payload.avatar
    if payload.notifications_enabled is not None:
        user.notifications_enabled = payload.notifications_enabled
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/v1/me/nickname", response_model=UserOut)
def change_nickname(
    payload: NicknameChange,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> User:
    new_name = payload.nickname.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="İsim boş olamaz")
    if new_name == user.nickname:
        return user
    if user.lidya < 300:
        raise HTTPException(status_code=400, detail="İsim değiştirmek için 300 Lidya gerekli")
    user.nickname = new_name
    user.lidya -= 300
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.patch("/v1/me/notifications", response_model=UserOut)
def update_notifications(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> User:
    if payload.notifications_enabled is None:
        raise HTTPException(status_code=400, detail="notifications_enabled gerekli")
    user.notifications_enabled = payload.notifications_enabled
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/v1/logout")
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    token = bearer_token(authorization)
    return {"revoked": revoke_session(db, token)}


@app.post("/v1/conversations", response_model=ConversationOut, status_code=201)
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> ConversationOut:
    if payload.participant_id == user.id:
        raise HTTPException(status_code=400, detail="Kendinizle konuşma oluşturamazsınız")
    participant = UserRepository(db).get(payload.participant_id)
    if not participant or not participant.is_active:
        raise HTTPException(status_code=404, detail="Katılımcı bulunamadı")
    conversation_repo = ConversationRepository(db)
    existing = conversation_repo.find_direct([user.id, participant.id])
    if existing:
        return existing
    conversation_id = f"dm_{uuid4().hex}"
    return conversation_repo.create_direct(conversation_id, [user.id, participant.id])


@app.get("/v1/conversations", response_model=list[ConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> list[ConversationOut]:
    return ConversationRepository(db).list_for_user(user.id)


@app.get("/v1/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> ConversationOut:
    repo = ConversationRepository(db)
    conversation = repo.get(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    if not repo.is_member(conversation_id, user.id):
        raise HTTPException(status_code=403, detail="Bu konuşmaya erişiminiz yok")
    return conversation


@app.post("/v1/messages/{conversation_id}", response_model=MessageOut)
def create_message(
    conversation_id: str,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> object:
    conversation_repo = ConversationRepository(db)
    if not conversation_repo.get(conversation_id):
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    if not conversation_repo.is_member(conversation_id, user.id):
        raise HTTPException(status_code=403, detail="Bu konuşmaya mesaj gönderemezsiniz")
    return MessageService(MessageRepository(db)).create(conversation_id, user.id, payload.text)


@app.get("/v1/messages/{conversation_id}", response_model=list[MessageOut])
def list_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> list[object]:
    conversation_repo = ConversationRepository(db)
    if not conversation_repo.get(conversation_id):
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    if not conversation_repo.is_member(conversation_id, user.id):
        raise HTTPException(status_code=403, detail="Bu konuşmaya erişiminiz yok")
    return MessageService(MessageRepository(db)).list(conversation_id)


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[str, set[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.setdefault(user_id, set()).add(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        sockets = self.connections.get(user_id)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self.connections.pop(user_id, None)

    async def send_user(self, user_id: str, payload: dict) -> None:
        for socket in list(self.connections.get(user_id, ())):
            try:
                await socket.send_json(payload)
            except Exception:
                self.disconnect(user_id, socket)


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="token gerekli")
        return
    db = Session(engine)
    user = None
    try:
        user = get_user_from_token(db, token)
        if not user or not user.is_active:
            await websocket.close(code=1008, reason="geçersiz oturum")
            return
        await manager.connect(user.id, websocket)
        await websocket.send_json({"type": "connected", "service": "erischat-api", "version": "0.8.0", "user_id": user.id})
        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                await websocket.send_json({"type": "error", "detail": "Mesaj gövdesi nesne olmalı"})
                continue
            conversation_id = str(data.get("conversation_id", "")).strip()
            text_value = str(data.get("text", "")).strip()
            if not conversation_id or not text_value or len(text_value) > 2000:
                await websocket.send_json({"type": "error", "detail": "conversation_id ve 1-2000 karakterlik text gerekli"})
                continue
            conversation_repo = ConversationRepository(db)
            if not conversation_repo.get(conversation_id) or not conversation_repo.is_member(conversation_id, user.id):
                await websocket.send_json({"type": "error", "detail": "Konuşmaya erişim yok"})
                continue
            message = MessageService(MessageRepository(db)).create(conversation_id, user.id, text_value)
            event = {"type": "message", "conversation_id": conversation_id, "sender_id": user.id, "text": message.text, "message_id": message.id, "created_at": message.created_at.isoformat()}
            for member_id in conversation_repo.members(conversation_id):
                await manager.send_user(member_id, event)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket hatası")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        if user:
            manager.disconnect(user.id, websocket)
        db.close()


FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

# Deployment marker: this file must be rebuilt from the current main branch.
