"""Database-backed two-person call invitations and WebRTC signaling."""
import json
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select, delete
from sqlalchemy.orm import Session

from .db import get_db
from .config import settings
from .models import Conversation, ConversationMember, Message, User
from .platform_models import DirectCall, DirectCallSignal, DirectCallPayment, UserBlock, UserFollow
from .admin_models import AdminRole
from .repositories import ConversationRepository

router = APIRouter(prefix="/v1")
_current_user = None


def register_auth(fn):
    global _current_user
    _current_user = fn


def authenticated(db: Session = Depends(get_db), authorization: str | None = Header(None)):
    return _current_user(db, authorization)


def now():
    return datetime.now(timezone.utc)


def settle(db: Session, call: DirectCall, accepted: bool):
    payment = db.scalar(select(DirectCallPayment).where(DirectCallPayment.call_id == call.id).with_for_update())
    if not payment or payment.state != "held":
        return
    recipient = db.scalar(select(User).where(User.id == (call.callee_id if accepted else call.caller_id)).with_for_update().execution_options(populate_existing=True))
    recipient.lidya += 20 if accepted else payment.amount
    payment.state = "settled" if accepted else "refunded"
    db.info.update(lidya_operation="call_credit" if accepted else "call_refund", lidya_reference_id=call.id)
    db.flush()
    db.info.pop("lidya_operation", None); db.info.pop("lidya_reference_id", None)


def finish(db: Session, call: DirectCall, status: str):
    if call.status == "ringing":
        settle(db, call, False)
    call.status = status
    call.touched_at = now()


def expire(db: Session):
    instant = now()
    calls = db.scalars(select(DirectCall).where(DirectCall.status.in_(("ringing", "active")))).all()
    for call in calls:
        if call.touched_at.replace(tzinfo=timezone.utc) < instant - timedelta(seconds=15 if call.status == "ringing" else 45):
            finish(db, call, "missed" if call.status == "ringing" else "ended")
    db.commit()


def get_call(db: Session, call_id: str, user_id: str):
    call = db.get(DirectCall, call_id)
    if not call or user_id not in (call.caller_id, call.callee_id):
        raise HTTPException(404, "Arama bulunamadı")
    return call


def summary(db: Session, call: DirectCall, user_id: str):
    peer_id = call.callee_id if call.caller_id == user_id else call.caller_id
    peer = db.get(User, peer_id)
    return {"id": call.id, "conversation_id": call.conversation_id, "kind": call.kind,
            "status": call.status, "incoming": call.callee_id == user_id,
            "peer_id": peer_id, "peer_name": peer.nickname if peer else "Kullanıcı",
            "avatar_asset": peer.avatar_asset if peer else None,
            "frame_asset": peer.frame_asset if peer else None,
            "accepted_at": call.accepted_at.isoformat() if call.accepted_at else None}


class Start(BaseModel):
    conversation_id: str
    target_id: str
    kind: str


class Respond(BaseModel):
    action: str


class Signal(BaseModel):
    kind: str
    payload: dict = Field(default_factory=dict)


@router.post("/calls")
def start_call(body: Start, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    if body.kind not in ("voice", "video") or body.target_id == user.id:
        raise HTTPException(400, "Arama türü veya alıcı geçersiz")
    conversation = db.get(Conversation, body.conversation_id)
    if not conversation or conversation.type != "dm" or not ConversationRepository(db).is_member(body.conversation_id, user.id) or not ConversationRepository(db).is_member(body.conversation_id, body.target_id):
        raise HTTPException(403, "Bu konuşmadan arama yapamazsınız")
    members = list(db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id == body.conversation_id)))
    if len(members) != 2 or set(members) != {user.id, body.target_id}:
        raise HTTPException(403, "Arama yalnızca birebir sohbetlerde kullanılabilir")
    target = db.get(User, body.target_id)
    if not target or not target.is_active:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    if not db.scalar(select(UserFollow.id).where(UserFollow.follower_id == user.id, UserFollow.following_id == target.id)):
        raise HTTPException(403, "Arama yapabilmek için önce kişiyi takip etmelisiniz")
    if not db.scalar(select(UserFollow.id).where(UserFollow.follower_id == target.id, UserFollow.following_id == user.id)):
        raise HTTPException(403, "Karşı taraf sizi takip etmediği sürece arayamazsınız")
    if db.scalar(select(UserBlock.id).where(or_(and_(UserBlock.blocker_id == user.id, UserBlock.blocked_id == target.id),
                                                and_(UserBlock.blocker_id == target.id, UserBlock.blocked_id == user.id)))):
        raise HTTPException(403, "Bu kullanıcıyla arama yapılamıyor")
    expire(db)
    occupied = db.scalar(select(DirectCall.id).where(DirectCall.status.in_(("ringing", "active")),
        or_(DirectCall.caller_id.in_((user.id, target.id)), DirectCall.callee_id.in_((user.id, target.id)))).limit(1))
    if occupied:
        raise HTTPException(409, "Kullanıcılardan biri başka bir aramada")
    call = DirectCall(id=str(uuid4()), conversation_id=body.conversation_id,
                      caller_id=user.id, callee_id=target.id, kind=body.kind,
                      status="ringing", touched_at=now())
    payer = db.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
    if payer.lidya < 40:
        raise HTTPException(402, "Arama için 40 Lidya gerekli")
    payer.lidya -= 40
    db.add(call)
    db.add(DirectCallPayment(call_id=call.id, amount=40, state="held"))
    db.info.update(lidya_operation="call_hold", lidya_reference_id=call.id)
    db.commit()
    db.info.pop("lidya_operation", None); db.info.pop("lidya_reference_id", None)
    return summary(db, call, user.id)


@router.get("/calls/active")
def active_call(db: Session = Depends(get_db), user: User = Depends(authenticated)):
    expire(db)
    call = db.scalar(select(DirectCall).where(DirectCall.status.in_(("ringing", "active")),
        or_(DirectCall.caller_id == user.id, DirectCall.callee_id == user.id)).order_by(DirectCall.created_at.desc()).limit(1))
    return summary(db, call, user.id) if call else {"id": None}


def history_rows(db: Session, user_id: str):
    calls = db.scalars(select(DirectCall).where(or_(DirectCall.caller_id == user_id, DirectCall.callee_id == user_id))
                       .order_by(DirectCall.created_at.desc()).limit(100)).all()
    rows = []
    for call in calls:
        item = summary(db, call, user_id)
        end_at = call.touched_at.replace(tzinfo=timezone.utc) if call.touched_at.tzinfo is None else call.touched_at
        accepted = call.accepted_at.replace(tzinfo=timezone.utc) if call.accepted_at and call.accepted_at.tzinfo is None else call.accepted_at
        item.update(created_at=call.created_at.isoformat(), duration_seconds=max(0, int((end_at - accepted).total_seconds())) if accepted else 0)
        rows.append(item)
    return rows


@router.get("/calls/history")
def call_history(db: Session = Depends(get_db), user: User = Depends(authenticated)):
    return history_rows(db, user.id)


@router.get("/admin/calls/{user_key}")
def admin_call_history(user_key: str, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    role = db.get(AdminRole, user.id)
    if not role or role.role != "DA":
        raise HTTPException(403, "Yalnızca geliştirici yöneticisi arama sorgulayabilir")
    target = db.get(User, user_key) or db.scalar(select(User).where(User.public_id == user_key))
    if not target:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    return {"user": {"id": target.id, "public_id": target.public_id, "nickname": target.nickname,
                     "avatar_asset": target.avatar_asset, "frame_asset": target.frame_asset},
            "calls": history_rows(db, target.id)}


@router.get("/calls/rtc-config")
def rtc_config(user: User = Depends(authenticated)):
    raw = os.getenv("ERIS_WEBRTC_ICE_SERVERS_JSON", "").strip()
    if raw:
        try: servers = json.loads(raw)
        except json.JSONDecodeError: raise HTTPException(500, "WebRTC ICE yapılandırması geçersiz")
        if not isinstance(servers, list) or not all(isinstance(item, dict) for item in servers):
            raise HTTPException(500, "WebRTC ICE yapılandırması geçersiz")
        return {"ice_servers": servers}
    servers = [{"urls": ["stun:stun.l.google.com:19302"]}]
    url = settings.rtc_turn_url or os.getenv("ERISCHAT_TURN_URL", "")
    username = settings.rtc_turn_username or os.getenv("ERISCHAT_TURN_USERNAME", "")
    credential = settings.rtc_turn_credential or os.getenv("ERISCHAT_TURN_PASSWORD", "")
    if url and username and credential:
        servers.append({"urls": [url], "username": username, "credential": credential})
    return {"ice_servers": servers}


@router.post("/calls/{call_id}/respond")
def respond(call_id: str, body: Respond, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    call = get_call(db, call_id, user.id)
    call = db.scalar(select(DirectCall).where(DirectCall.id == call.id).with_for_update())
    if call.status == "ringing" and call.touched_at.replace(tzinfo=timezone.utc) < now() - timedelta(seconds=15):
        finish(db, call, "missed"); db.commit()
    if user.id != call.callee_id or call.status != "ringing" or body.action not in ("accept", "reject", "unavailable"):
        raise HTTPException(409, "Çağrı artık yanıtlanamıyor")
    call.status = "active" if body.action == "accept" else body.action
    if body.action == "accept":
        call.accepted_at = now()
        settle(db, call, True)
    else:
        settle(db, call, False)
    if body.action == "unavailable":
        db.add(Message(conversation_id=call.conversation_id, sender_id=user.id,
                       text="Şu anda müsait değilim, lütfen daha sonra tekrar ara."))
    call.touched_at = now(); db.commit()
    return summary(db, call, user.id)


@router.post("/calls/{call_id}/end")
def end_call(call_id: str, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    call = get_call(db, call_id, user.id)
    call = db.scalar(select(DirectCall).where(DirectCall.id == call.id).with_for_update())
    if call.status in ("ringing", "active"):
        finish(db, call, "ended"); db.commit()
    return summary(db, call, user.id)


@router.post("/calls/{call_id}/signals")
def send_signal(call_id: str, body: Signal, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    call = get_call(db, call_id, user.id)
    if call.status != "active" or body.kind not in ("offer", "answer", "ice", "renegotiate", "screen-stop", "video-state", "screen-state"):
        raise HTTPException(409, "Arama aktif değil")
    encoded = json.dumps(body.payload)
    if len(encoded) > 16000: raise HTTPException(413, "Sinyal fazla büyük")
    db.add(DirectCallSignal(call_id=call.id, sender_id=user.id, kind=body.kind, payload=encoded))
    call.touched_at = now(); db.commit()
    return {"ok": True}


@router.get("/calls/{call_id}/events")
def call_events(call_id: str, after: int = 0, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    call = get_call(db, call_id, user.id)
    if call.status == "ringing" and call.touched_at.replace(tzinfo=timezone.utc) < now() - timedelta(seconds=15):
        finish(db, call, "missed"); db.commit()
    if call.status == "active":
        call.touched_at = now(); db.commit()
    latest = db.scalar(select(DirectCallSignal.id).where(DirectCallSignal.call_id == call_id).order_by(DirectCallSignal.id.desc()).limit(1)) or after
    events = db.scalars(select(DirectCallSignal).where(DirectCallSignal.call_id == call_id,
        DirectCallSignal.sender_id != user.id, DirectCallSignal.id > max(0, after), DirectCallSignal.id <= latest).order_by(DirectCallSignal.id).limit(100)).all()
    return {"call": summary(db, call, user.id), "cursor": latest,
            "events": [{"kind": event.kind, "payload": json.loads(event.payload)} for event in events]}
