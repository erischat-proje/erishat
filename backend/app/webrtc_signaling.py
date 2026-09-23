from __future__ import annotations
import os
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from .db import get_db
from .voice_models import RoomMicSeat
from .session import get_user_from_token

router = APIRouter(prefix="/v1/voice", tags=["WebRTC & Voice Signaling"])

# Aktif WebSocket bağlantı yöneticisi: {room_id: {user_id: WebSocket}}
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, room_id: str, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
        self.active_connections[room_id][user_id] = websocket

    def disconnect(self, room_id: str, user_id: str):
        if room_id in self.active_connections:
            if user_id in self.active_connections[room_id]:
                del self.active_connections[room_id][user_id]
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]

    async def broadcast_to_room(self, room_id: str, message: dict, exclude_user_id: str | None = None):
        if room_id in self.active_connections:
            data_str = json.dumps(message)
            for uid, ws in self.active_connections[room_id].items():
                if uid != exclude_user_id:
                    try:
                        await ws.send_text(data_str)
                    except Exception:
                        pass

manager = ConnectionManager()

@router.websocket("/ws/{room_id}/{user_id}")
async def voice_signaling_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await manager.connect(room_id, user_id, websocket)
    try:
        # Oda üyelerine yeni kullanıcının katıldığını bildir
        await manager.broadcast_to_room(room_id, {
            "type": "user_joined",
            "user_id": user_id
        }, exclude_user_id=user_id)

        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            msg_type = data.get("type")

            # WebRTC Signaling (offer, answer, ice-candidate)
            if msg_type in ["offer", "answer", "ice-candidate"]:
                target_user_id = data.get("target_user_id")
                # Hedef kullanıcıya sinyal mesajını ilet
                if room_id in manager.active_connections and target_user_id in manager.active_connections[room_id]:
                    target_ws = manager.active_connections[room_id][target_user_id]
                    await target_ws.send_text(json.dumps({
                        "type": msg_type,
                        "from_user_id": user_id,
                        "payload": data.get("payload")
                    }))

            # Mikrofon aç/kapat (Mute / Unmute / Mic Seat Control)
            elif msg_type in ["mic_toggle", "mute_user", "lock_seat"]:
                await manager.broadcast_to_room(room_id, {
                    "type": msg_type,
                    "user_id": user_id,
                    "data": data.get("data")
                })

    except WebSocketDisconnect:
        manager.disconnect(room_id, user_id)
        await manager.broadcast_to_room(room_id, {
            "type": "user_left",
            "user_id": user_id
        })

@router.get("/stun-turn-config")
def get_webrtc_config():
    # Production STUN/TURN sunucu yapılandırmaları
    return {
        "status": "success",
        "iceServers": [
            {"urls": "stun:stun.l.google.com:19302"},
            {"urls": "stun:stun1.l.google.com:19302"},
            {
                "urls": "turn:turn.erischat.proje:3478",
                "username": os.getenv("ERISCHAT_TURN_USERNAME", "erischat_user"),
                "credential": os.getenv("ERISCHAT_TURN_PASSWORD", "secure_turn_password_2026")
            }
        ]
    }
