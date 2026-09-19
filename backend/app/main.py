from __future__ import annotations

from pathlib import Path
from uuid import uuid4
import logging

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from .auth import create_anonymous_user
from .cosmetic_routes import router as cosmetic_router
from .config import settings
from .db import Base, engine, get_db
from .models import Conversation, ConversationMember, User
from .repositories import ConversationRepository, MessageRepository, UserRepository
from .room_models import Room, RoomBan, RoomGiftEvent, RoomMember, RoomModerator, RoomMusic, RoomSeat, RoomChatMessage
from .room_routes import register_room_auth, router as room_router
from .platform_models import Family, FamilyDonation, FamilyMember, FanProfile, GameBet, GameRound, DiscoveryPreference, Report, RoomAnnouncement, UserLocation, UserPrivacy, VipStatus
from .platform_routes import register_platform_auth, router as platform_router
from .family_routes import register_family_auth, router as family_router
from .support_models import SupportTicket
from .admin_models import AdminRole, AdminAuditLog, SupportMessage, SupportAssignment, UserBan, ChatBan, RoomAdminBan, ApplicationGap
from .support_routes import register_support_auth, router as support_router
from .admin_routes import register_admin_auth, router as admin_router
from .system_data import UserIdRegistry, RoomIdRegistry, LidyaLedger
from .system_logs import ensure_log_files
from .schemas import ConversationCreate, ConversationOut, MessageCreate, MessageOut, NicknameChange, SessionOut, UserCreate, UserOut, UserUpdate
from .services import MessageService
from .session import cleanup_expired_sessions, create_session, get_user_from_token, revoke_session

logger = logging.getLogger("erischat.api")
app = FastAPI(title="ErisChat API", version="1.0.0")
app.include_router(cosmetic_router)

origins = [item.strip() for item in settings.cors_origins.split(",") if item.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins or ["*"], allow_credentials=bool(origins and "*" not in origins), allow_methods=["*"], allow_headers=["*"])


def ensure_system_data_columns() -> None:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ALTER COLUMN lidya TYPE BIGINT"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS lidya_gem BIGINT NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip VARCHAR(64)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS device_info VARCHAR(512)"))
        conn.execute(text("ALTER TABLE system_lidya_gem_ledger ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128)"))
        conn.execute(text("ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS state_data TEXT NOT NULL DEFAULT '{}'"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_system_lidya_gem_ledger_idempotency ON system_lidya_gem_ledger (idempotency_key) WHERE idempotency_key IS NOT NULL"))
        conn.execute(text("ALTER TABLE vip_status ADD COLUMN IF NOT EXISTS total_spent INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS public_id VARCHAR(12)"))
        conn.execute(text("ALTER TABLE rooms ALTER COLUMN public_id TYPE VARCHAR(12)"))
        conn.execute(text("ALTER TABLE game_rounds ALTER COLUMN room_id DROP NOT NULL"))
        rows = conn.execute(text("SELECT id, public_id FROM rooms")).fetchall()
        import uuid as _uuid
        import re as _re
        used = {str(x[1]) for x in rows if _re.fullmatch(r"\d{12}", str(x[1] or ""))}
        for rid, pid in rows:
            if not _re.fullmatch(r"\d{12}", str(pid or "")) or str(pid) in {str(x[1]) for x in rows if x[0] != rid and x[1]}:
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
    db.commit()


@app.on_event("startup")
def startup() -> None:
    logger.info("ErisChat API startup: environment=%s", settings.environment)
    Base.metadata.create_all(bind=engine)
    ensure_log_files()
    ensure_system_data_columns()
    with Session(engine) as db:
        cleanup_expired_sessions(db)
        sync_system_registries(db)
        bootstrap_initial_developer_admins(db)
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
register_family_auth(current_user)
register_support_auth(current_user)
register_admin_auth(current_user)
app.include_router(room_router)
app.include_router(platform_router)
app.include_router(family_router)
app.include_router(support_router)
app.include_router(admin_router)


def ensure_demo_user(db: Session) -> User:
    repo = UserRepository(db)
    user = repo.get("demo")
    if user:
        return user
    public_id = "0000000001"
    while db.scalar(select(User.id).where(User.public_id == public_id)) or db.scalar(select(UserIdRegistry.user_id).where(UserIdRegistry.public_id == public_id)):
        public_id = f"{uuid4().int % 10_000_000_000:010d}"
    created = repo.create(User(id="demo", public_id=public_id, nickname="Eris", avatar="🦊", gender="unspecified", lidya=10_000_000))
    db.add(UserIdRegistry(user_id=created.id, public_id=created.public_id))
    db.commit()
    return created


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
def create_demo_user(db: Session = Depends(get_db)) -> UserOut:
    return ensure_demo_user(db)


@app.get("/v1/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> User:
    return user


@app.post("/v1/families")
def create_family_production(payload: dict, db: Session = Depends(get_db), user: User = Depends(current_user)):
    name = str(payload.get("name", "")).strip()
    if not name or len(name) > 64:
        raise HTTPException(status_code=422, detail="Geçerli bir aile adı gerekli")
    family_id = "family_" + uuid4().hex[:12]
    conversation_id = "family_chat_" + family_id
    conversation = Conversation(id=conversation_id, type="family")
    family = Family(id=family_id, owner_id=user.id, name=name, level=1, balance=0, chat_conversation_id=conversation_id)
    db.add(conversation)
    db.add(family)
    db.flush()
    db.add(ConversationMember(conversation_id=conversation_id, user_id=user.id))
    db.add(FamilyMember(family_id=family_id, user_id=user.id, role="member"))
    db.commit()
    return {"id": family.id, "name": family.name, "level": 1}


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


def websocket_session_active(token: str) -> bool:
    with Session(engine) as db:
        user = get_user_from_token(db, token)
        return bool(user and user.is_active)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="token gerekli")
        return
    if not websocket_session_active(token):
        await websocket.close(code=1008, reason="geçersiz oturum")
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
            if not websocket_session_active(token):
                manager.disconnect(user_id, websocket)
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

async def _broadcast_room_chat(room_id: str, payload: dict) -> None:
    connections = room_chat_connections.get(room_id, set())
    dead = []
    for ws in list(connections):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connections.discard(ws)


@app.websocket("/ws/rooms/{room_id}")
async def room_websocket_endpoint(room_id: str, websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="token gerekli")
        return
    with Session(engine) as db:
        user = get_user_from_token(db, token)
        if not user or not user.is_active:
            await websocket.close(code=1008, reason="geçersiz oturum")
            return
        room = db.get(Room, room_id)
        member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == user.id).first()
        banned = db.query(RoomBan).filter(RoomBan.room_id == room_id, RoomBan.user_id == user.id).first()
        if not room or not member or banned:
            await websocket.close(code=1008, reason="oda üyeliği gerekli")
            return
        if not room.chat_enabled:
            await websocket.close(code=1008, reason="oda sohbeti kapalı")
            return
        history = (db.query(RoomChatMessage).filter(RoomChatMessage.room_id == room_id).order_by(RoomChatMessage.id.desc()).limit(50).all())
        history.reverse()
        history_payload = [{"type":"room_chat","id":m.id,"room_id":room_id,"user_id":m.user_id,"text":m.text,"created_at":m.created_at.isoformat() if m.created_at else None} for m in history]
    await websocket.accept()
    room_chat_connections.setdefault(room_id, set()).add(websocket)
    await websocket.send_json({"type":"room_history","messages":history_payload})
    try:
        while True:
            data = await websocket.receive_json()
            if not websocket_session_active(token):
                room_chat_connections.get(room_id, set()).discard(websocket)
                await websocket.close(code=1008, reason="oturum sona erdi")
                return
            with Session(engine) as db:
                room = db.get(Room, room_id)
                member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == user.id).first()
                banned = db.query(RoomBan).filter(RoomBan.room_id == room_id, RoomBan.user_id == user.id).first()
                if not room or not member or banned or not room.chat_enabled:
                    room_chat_connections.get(room_id, set()).discard(websocket)
                    await websocket.close(code=1008, reason="oda erişiminiz yok")
                    return
            if not isinstance(data, dict):
                continue
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if data.get("type") != "room_chat":
                continue
            text_value = str(data.get("text") or "").strip()
            if not text_value or len(text_value) > 500:
                continue
            with Session(engine) as db:
                room = db.get(Room, room_id)
                member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == user.id).first()
                banned = db.query(RoomBan).filter(RoomBan.room_id == room_id, RoomBan.user_id == user.id).first()
                seat = db.query(RoomSeat).filter(RoomSeat.room_id == room_id, RoomSeat.user_id == user.id).first()
                if not room or not member or banned or not room.chat_enabled:
                    await websocket.close(code=1008, reason="oda erişiminiz yok")
                    break
                if seat and seat.muted:
                    await websocket.send_json({"type":"room_chat_error","code":"muted","message":"Mikrofonunuz susturuldu."})
                    continue
                msg = RoomChatMessage(room_id=room_id, user_id=user.id, text=text_value)
                db.add(msg)
                db.commit()
                db.refresh(msg)
                payload = {"type":"room_chat","id":msg.id,"room_id":room_id,"user_id":user.id,"text":msg.text,"created_at":msg.created_at.isoformat() if msg.created_at else None}
            await _broadcast_room_chat(room_id, payload)
    except WebSocketDisconnect:
        room_chat_connections.get(room_id, set()).discard(websocket)
    except Exception:
        room_chat_connections.get(room_id, set()).discard(websocket)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass


@app.get("/v1/demo")
def demo(db: Session = Depends(get_db)) -> dict:
    user = ensure_demo_user(db)
    return {"id": user.id, "public_id": user.public_id, "nickname": user.nickname, "avatar": user.avatar, "message": "ErisChat API hazır"}


@app.get("/v1/debug/tables")
def debug_tables(db: Session = Depends(get_db)) -> dict[str, list[str]]:
    result = db.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).all()
    return {"tables": [row[0] for row in result]}


static_dir = Path(__file__).resolve().parents[2] / "frontend"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="frontend")
