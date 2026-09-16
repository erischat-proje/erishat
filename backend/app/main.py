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
from .room_models import Room, RoomBan, RoomGiftEvent, RoomMember, RoomModerator, RoomMusic, RoomSeat
from .room_routes import register_room_auth, router as room_router
from .platform_models import Family, FamilyDonation, FamilyMember, FanProfile, GameBet, GameRound, DiscoveryPreference, Report, RoomAnnouncement, UserLocation, UserPrivacy, VipStatus
from .platform_routes import register_platform_auth, router as platform_router
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
app.include_router(room_router)
app.include_router(platform_router)


def ensure_demo_user(db: Session) -> User:
    repo = UserRepository(db)
    user = repo.get("demo")
    if user:
        return user
    return repo.create(User(id="demo", public_id="@eris_48291", nickname="Eris", avatar="🦊", gender="unspecified", lidya=10_000_000))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "erischat-api", "version": app.version}


@app.get("/ready")
def ready() -> dict[str, str]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready", "service": "erischat-api", "version": app.version}
    except OperationalError as exc:
        logger.warning("Readiness DB check failed: %s", exc)
        raise HTTPException(status_code=503, detail="database not ready") from exc


@app.get("/v1/users/{user_id}", response_model=UserOut)
def get_user(user_id: str, db: Session = Depends(get_db)) -> User:
    user = UserRepository(db).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return user


@app.post("/v1/users", response_model=SessionOut, status_code=201)
def register_user(payload: UserCreate, db: Session = Depends(get_db)) -> SessionOut:
    try:
        user = create_anonymous_user(db, payload.nickname.strip(), payload.avatar, payload.gender)
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
def update_me(payload: UserUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)) -> User:
    if payload.nickname is not None:
        nickname = payload.nickname.strip()
        if not nickname:
            raise HTTPException(status_code=400, detail="İsim boş olamaz")
        user.nickname = nickname
    if payload.avatar is not None:
        user.avatar = payload.avatar
    if payload.notifications_enabled is not None:
        user.notifications_enabled = payload.notifications_enabled
    db.commit()
    db.refresh(user)
    return user


@app.post("/v1/me/nickname", response_model=UserOut)
def change_nickname(payload: NicknameChange, db: Session = Depends(get_db), user: User = Depends(current_user)) -> User:
    new_name = payload.nickname.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="İsim boş olamaz")
    if new_name == user.nickname:
        return user
    if user.lidya < 300:
        raise HTTPException(status_code=400, detail="İsim değiştirmek için 300 Lidya gerekli")
    user.nickname = new_name
    user.lidya -= 300
    db.commit()
    db.refresh(user)
    return user


@app.patch("/v1/me/notifications", response_model=UserOut)
def update_notifications(payload: UserUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)) -> User:
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
def list_conversations(limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0), db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[ConversationOut]:
    return ConversationRepository(db).list_for_user(user.id, limit=limit, offset=offset)


@app.get("/v1/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)) -> ConversationOut:
    repo = ConversationRepository(db)
    conversation = repo.get(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    if not repo.is_member(conversation_id, user.id):
        raise HTTPException(status_code=403, detail="Bu konuşmaya erişiminiz yok")
    return conversation


@app.post("/v1/messages/{conversation_id}", response_model=MessageOut)
def create_message(conversation_id: str, payload: MessageCreate, db: Session = Depends(get_db), user: User = Depends(current_user)) -> MessageOut:
    repo = ConversationRepository(db)
    if not repo.get(conversation_id):
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    if not repo.is_member(conversation_id, user.id):
        raise HTTPException(status_code=403, detail="Bu konuşmaya mesaj gönderemezsiniz")
    try:
        return MessageService(MessageRepository(db)).create(conversation_id, user.id, payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/v1/messages/{conversation_id}", response_model=list[MessageOut])
def list_messages(conversation_id: str, limit: int = Query(default=100, ge=1, le=200), offset: int = Query(default=0, ge=0), db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[MessageOut]:
    repo = ConversationRepository(db)
    if not repo.get(conversation_id):
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    if not repo.is_member(conversation_id, user.id):
        raise HTTPException(status_code=403, detail="Bu konuşmaya erişim yok")
    return MessageService(MessageRepository(db)).list(conversation_id, limit=limit, offset=offset)


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
        for websocket in list(self.connections.get(user_id, set())):
            try:
                await websocket.send_json(payload)
            except Exception:
                self.disconnect(user_id, websocket)


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="token gerekli")
        return
    with Session(engine) as db:
        user = get_user_from_token(db, token)
        if not user or not user.is_active:
            await websocket.close(code=1008, reason="geçersiz oturum")
            return
        user_id = user.id
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
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


frontend_path = Path(__file__).resolve().parents[2] / "frontend"
if frontend_path.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
