from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from .auth import get_user_from_token
from .database import engine, get_db
from .models import Room, RoomBan, RoomChatMessage, RoomMember, RoomSeat

app = FastAPI(title="ErisChat API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/ready")
def ready() -> dict[str, str]:
    return {"status": "ok"}


def websocket_session_active(token: str) -> bool:
    with Session(engine) as db:
        user = get_user_from_token(db, token)
        return bool(user and user.is_active)


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


async def close_room_user_connections(room_id: str, user_id: str, reason: str = "oda erişiminiz yok") -> None:
    connections = room_chat_connections.get(room_id, set())
    sockets = list(connections)
    for websocket in sockets:
        try:
            await websocket.close(code=1008, reason=reason)
        except Exception:
            pass
        connections.discard(websocket)
    if not connections:
        room_chat_connections.pop(room_id, None)


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
def demo(db: Session = get_db()) -> dict:
    from .demo import ensure_demo_user
    user = ensure_demo_user(db)
    return {"id": user.id, "public_id": user.public_id, "nickname": user.nickname, "avatar": user.avatar, "message": "ErisChat API hazır"}


@app.get("/v1/debug/tables")
def debug_tables(db: Session = get_db()) -> dict[str, list[str]]:
    result = db.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).all()
    return {"tables": [row[0] for row in result]}


static_dir = Path(__file__).resolve().parents[2] / "frontend"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="frontend")
