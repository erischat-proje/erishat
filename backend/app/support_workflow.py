"""Persistent support routing, private conversations and their audit trail."""
import asyncio
import json
import logging
import math
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from .db import engine, get_db
from .models import User
from .admin_models import AdminRole, SupportAssignment, SupportMessage
from .support_models import SupportAgent, SupportFlow, SupportTicket, SupportReview, SupportArchive
from .room_models import RoomMember, RoomSeat, RoomChatMessage, Room
from .platform_models import Notification, SocialPost, SocialPostComment, UserFollow, UserBlock

router = APIRouter(prefix="/v1/support/live", tags=["live-support"])
ROLES = ("SA", "UA", "FA", "DA")
log = logging.getLogger("erischat.support")


def now():
    return datetime.now(timezone.utc)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def role_of(db, user):
    row = db.get(AdminRole, user.id)
    if not row or row.role not in ROLES:
        raise HTTPException(403, "Yönetim yetkisi gerekli")
    return row.role


def remaining_restriction(db, uid):
    agent = db.get(SupportAgent, uid)
    role = db.get(AdminRole, uid)
    if not agent or not role or role.role == "DA" or not agent.restricted_until:
        return 0
    return max(0, math.ceil((utc(agent.restricted_until) - now()).total_seconds()))


def flow_for(db, ticket):
    flow = db.get(SupportFlow, ticket.id)
    if not flow:
        assignment = db.get(SupportAssignment, ticket.id)
        phase = "closed" if ticket.status in {"closed", "rejected"} else "active" if assignment and assignment.decision == "accepted" else "pending"
        flow = SupportFlow(ticket_id=ticket.id, phase=phase, tier=0, not_assigned_json="[]", snapshot="", context_json="{}", customer_read_id=0, agent_read_id=0)
        db.add(flow)
        db.flush()
    return flow


def initialize_ticket(db, ticket, snapshot="", room_id=None, post_id=None, comment_id=None):
    flow = flow_for(db, ticket)
    flow.snapshot = snapshot
    context = {"source": "server", "captured_at": now().isoformat()}
    if room_id:
        room = db.get(Room, room_id) or db.scalar(select(Room).where(Room.public_id == room_id))
        member = db.scalar(select(RoomMember.id).where(RoomMember.room_id == room.id, RoomMember.user_id == ticket.user_id)) if room else None
        if member:
            context["room_id"] = room.public_id
            context["messages"] = [{"id": m.id, "sender_id": m.user_id, "text": m.text, "created_at": str(m.created_at)} for m in db.scalars(select(RoomChatMessage).where(RoomChatMessage.room_id == room.id).order_by(RoomChatMessage.id.desc()).limit(30))]
    if post_id:
        post = db.get(SocialPost, post_id)
        blocked = db.scalar(select(UserBlock.id).where(
            ((UserBlock.blocker_id == ticket.user_id) & (UserBlock.blocked_id == post.user_id)) |
            ((UserBlock.blocker_id == post.user_id) & (UserBlock.blocked_id == ticket.user_id))
        )) if post else True
        follows = db.scalar(select(UserFollow.id).where(UserFollow.follower_id == ticket.user_id, UserFollow.following_id == post.user_id)) if post else False
        visible = post and (post.user_id == ticket.user_id or (not blocked and not post.is_hidden and (post.audience == "public" or post.audience == "followers" and follows)))
        if visible:
            context["post"] = {"id": post.id, "caption": post.caption, "created_at": str(post.created_at), "media_present": post.image_bytes is not None}
            comment = db.get(SocialPostComment, comment_id) if comment_id else None
            if comment and comment.post_id == post.id:
                context["comment"] = {"id": comment.id, "body": comment.body, "created_at": str(comment.created_at)}
    flow.context_json = json.dumps(context, ensure_ascii=False)
    return flow


def dispatch(db, at=None):
    at = at or now()
    # Bootstrap older pending tickets without changing their conversation history.
    for ticket in db.scalars(select(SupportTicket).outerjoin(SupportFlow, SupportFlow.ticket_id == SupportTicket.id).where(SupportFlow.ticket_id.is_(None), SupportTicket.status.in_(["pending", "open", "accepted"])).order_by(SupportTicket.id).limit(200)):
        flow_for(db, ticket)
    flows = list(db.scalars(select(SupportFlow).where(SupportFlow.phase == "pending").order_by(SupportFlow.ticket_id).with_for_update(skip_locked=True)))
    busy = set(db.scalars(select(SupportAssignment.admin_id).join(SupportFlow, SupportFlow.ticket_id == SupportAssignment.ticket_id).where(SupportFlow.phase.in_(["awaiting_ready", "active"]))))
    reserved = {f.offered_to for f in flows if f.offered_to and utc(f.offer_until) and utc(f.offer_until) > at}
    agents = list(db.execute(select(SupportAgent, AdminRole).join(AdminRole, AdminRole.user_id == SupportAgent.user_id).join(User, User.id == SupportAgent.user_id).where(User.is_active.is_(True), SupportAgent.seen_at > at - timedelta(seconds=15)).order_by(SupportAgent.user_id)))
    for flow in flows:
        ticket = db.get(SupportTicket, flow.ticket_id)
        offered_at = utc(flow.offer_until) - timedelta(seconds=20) if flow.offer_until else at
        tried = set(json.loads(flow.not_assigned_json or "[]"))
        eligible = [(a, r) for a, r in agents if r.role in ROLES and a.user_id != ticket.user_id and a.user_id not in tried and a.user_id not in busy and (not a.available_at or utc(a.available_at) <= at)]
        current = next(((a, r) for a, r in eligible if a.user_id == flow.offered_to), None)
        if flow.offered_to and (not current or not flow.offer_until or utc(flow.offer_until) <= at):
            tried.add(flow.offered_to)
            reserved.discard(flow.offered_to)
            flow.offered_to = None
            flow.tier = min(3, flow.tier + 1)
        # A newly online SA preempts an unaccepted higher-tier offer, but never repeats an offer.
        sa = next((a for a, r in eligible if r.role == "SA" and a.user_id not in reserved and a.user_id not in tried and a.online_since and utc(a.online_since) > offered_at), None)
        if flow.offered_to and flow.tier > 0 and sa:
            tried.add(flow.offered_to)
            reserved.discard(flow.offered_to)
            flow.offered_to = None
        if not flow.offered_to:
            candidate = None
            for tier, role in enumerate(ROLES):
                if tier < flow.tier and not (role == "SA" and sa):
                    continue
                candidate = next((a for a, r in eligible if r.role == role and a.user_id not in tried and a.user_id not in reserved), None)
                if candidate:
                    flow.tier = tier
                    break
            if candidate:
                flow.offered_to = candidate.user_id
                flow.offer_until = at + timedelta(seconds=20)
                reserved.add(candidate.user_id)
        flow.not_assigned_json = json.dumps(sorted(tried))
    db.commit()


async def routing_loop():
    while True:
        try:
            await asyncio.to_thread(dispatch_once)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Support routing iteration failed")
        await asyncio.sleep(1)


def dispatch_once():
    with Session(engine) as db:
        dispatch(db)


def ticket_for(db, ticket_id, user, *, offered=False):
    ticket = db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id).with_for_update())
    if not ticket:
        raise HTTPException(404, "Destek kaydı bulunamadı")
    flow = db.scalar(select(SupportFlow).where(SupportFlow.ticket_id == ticket.id).with_for_update().execution_options(populate_existing=True)) or flow_for(db, ticket)
    if ticket.user_id == user.id:
        return ticket, flow, "USER"
    role = role_of(db, user)
    assignment = db.get(SupportAssignment, ticket_id)
    if assignment and assignment.admin_id == user.id and assignment.decision == "accepted":
        return ticket, flow, role
    if offered and flow.phase == "pending" and flow.offered_to == user.id and flow.offer_until and utc(flow.offer_until) > now():
        return ticket, flow, role
    raise HTTPException(403, "Bu talep size atanmadı")


def view(db, ticket, user):
    flow = flow_for(db, ticket)
    customer = ticket.user_id == user.id
    role = "USER" if customer else role_of(db, user)
    reveal = not customer and role in {"FA", "DA"}
    owner = db.get(User, ticket.user_id)
    other_read = flow.agent_read_id if customer else flow.customer_read_id
    messages = [{"id": 0, "sender_role": "USER", "message": ticket.message, "attachments": json.loads(ticket.attachments_json or "[]"), "created_at": ticket.created_at, "read": True}]
    for msg in db.scalars(select(SupportMessage).where(SupportMessage.ticket_id == ticket.id).order_by(SupportMessage.id)):
        is_user = msg.sender_role in {"US", "USER"}
        messages.append({"id": msg.id, "sender_role": "USER" if is_user else "AGENT", "message": msg.message, "attachments": json.loads(msg.attachments_json or "[]"), "created_at": msg.created_at, "read": msg.id <= other_read})
    context = json.loads(flow.context_json or "{}") if not customer else None
    if context and not reveal:
        for message in context.get("messages", []):
            message.pop("sender_id", None)
    return {"id": ticket.id, "number": f"#{ticket.id:04d}", "subject": ticket.subject, "category": ticket.category, "message": ticket.message, "created_at": ticket.created_at, "status": ticket.status, "phase": flow.phase, "closed_by": flow.closed_by, "rated": db.get(SupportReview, ticket.id) is not None,
            "customer_name": owner.nickname if customer or reveal else "ERISCHAT MÜŞTERİ", "customer_id": owner.public_id if reveal else "(ID GİZLENMİŞTİR)", "snapshot": flow.snapshot if not customer else None, "server_context": context, "messages": messages}


def summary(db, ticket, user):
    flow = flow_for(db, ticket)
    return {"id": ticket.id, "number": f"#{ticket.id:04d}", "subject": ticket.subject, "status": ticket.status, "phase": flow.phase, "closed_by": flow.closed_by, "rated": db.get(SupportReview, ticket.id) is not None}


def admin_tickets(db, user):
    role_of(db, user)
    dispatch(db)
    assigned = set(db.scalars(select(SupportAssignment.ticket_id).where(SupportAssignment.admin_id == user.id, SupportAssignment.decision == "accepted")))
    offered = set(db.scalars(select(SupportFlow.ticket_id).where(SupportFlow.offered_to == user.id, SupportFlow.phase == "pending")))
    rows = db.scalars(select(SupportTicket).where(SupportTicket.id.in_(assigned | offered)).order_by(SupportTicket.id.desc()).limit(100))
    return [summary(db, t, user) for t in rows]


def accept(db, user, ticket_id):
    role = role_of(db, user)
    db.scalar(select(SupportAgent).where(SupportAgent.user_id == user.id).with_for_update())
    ticket, flow, _ = ticket_for(db, ticket_id, user, offered=True)
    if flow.phase != "pending" or flow.offered_to != user.id:
        raise HTTPException(409, "Talep artık beklemede değil")
    if db.scalar(select(SupportAssignment.ticket_id).join(SupportFlow, SupportFlow.ticket_id == SupportAssignment.ticket_id).where(SupportAssignment.admin_id == user.id, SupportFlow.phase.in_(["active", "awaiting_ready"]))):
        raise HTTPException(409, "Önce mevcut görüşmenizi tamamlayın")
    flow.phase = "awaiting_ready"
    ticket.status = "accepted"
    assignment = db.get(SupportAssignment, ticket_id)
    if assignment:
        assignment.admin_id, assignment.decision = user.id, "accepted"
    else:
        db.add(SupportAssignment(ticket_id=ticket_id, admin_id=user.id, decision="accepted"))
    from .admin_routes import audit
    audit(db,user,"support_accept",{"ticket_id":ticket_id},target_user_id=ticket.user_id)
    db.add(Notification(user_id=ticket.user_id, kind="support_accepted", title="Destek talebiniz kabul edildi", body="Destek talebiniz yetkili müşteri temsilciniz tarafından kabul edilmiştir. Hazırlanan canlı desteğe bağlanacaksınız."))
    db.commit()
    return view(db, ticket, user)


def decline(db, user, ticket_id):
    role = role_of(db, user)
    ticket, flow, _ = ticket_for(db, ticket_id, user, offered=True)
    if flow.phase != "pending" or flow.offered_to != user.id:
        raise HTTPException(409, "Talep artık beklemede değil")
    tried = set(json.loads(flow.not_assigned_json or "[]")); tried.add(user.id)
    flow.not_assigned_json = json.dumps(sorted(tried)); flow.offered_to = None; flow.offer_until = None
    agent = db.get(SupportAgent, user.id)
    if not agent:
        agent = SupportAgent(user_id=user.id, seen_at=now()); db.add(agent)
    agent.available_at = now() + timedelta(seconds=60)
    if role != "DA":
        agent.restricted_until = now() + timedelta(seconds=180)
        room_ids = list(db.scalars(select(RoomMember.room_id).where(RoomMember.user_id == user.id)))
        db.execute(delete(RoomMember).where(RoomMember.user_id == user.id))
        for seat in db.scalars(select(RoomSeat).where(RoomSeat.user_id == user.id)):
            seat.user_id = None; seat.muted = False
        db.flush()
        for room_id in room_ids:
            room = db.get(Room, room_id)
            if room:
                room.is_active = bool(db.scalar(select(RoomMember.id).where(RoomMember.room_id == room_id, RoomMember.ghost.is_(False)).limit(1)))
    from .admin_routes import audit
    audit(db,user,"support_decline",{"ticket_id":ticket_id},target_user_id=ticket.user_id)
    flow.tier = min(3, flow.tier + 1)
    db.commit(); dispatch(db)
    return {"declined": True, "restriction_seconds": remaining_restriction(db, user.id)}


def send(db, user, ticket_id, message, attachments):
    ticket, flow, role = ticket_for(db, ticket_id, user)
    if flow.phase != "active":
        raise HTTPException(409, "Canlı görüşme henüz açık değil")
    if role != "USER" and attachments:
        raise HTTPException(403, "Medya yalnızca müşteri tarafından eklenebilir")
    if not message.strip():
        raise HTTPException(422, "Mesaj boş olamaz")
    msg = SupportMessage(ticket_id=ticket_id, sender_id=user.id, sender_role="US" if role == "USER" else role, message=message.strip(), attachments_json=json.dumps(attachments))
    db.add(msg)
    if role != "USER":
        from .admin_routes import audit
        audit(db,user,"support_reply",{"ticket_id":ticket_id},target_user_id=ticket.user_id)
    db.commit()
    return view(db, ticket, user)


def close(db, user, ticket_id, not_ready=False):
    ticket, flow, role = ticket_for(db, ticket_id, user)
    if flow.phase == "closed":
        return view(db, ticket, user)
    flow.phase = "closed"; flow.closed_by = "not_ready" if not_ready else "customer" if role == "USER" else "agent"
    ticket.status = "closed"
    if role != "USER":
        from .admin_routes import audit
        audit(db,user,"support_close",{"ticket_id":ticket_id},target_user_id=ticket.user_id)
    assignment = db.get(SupportAssignment, ticket_id)
    admin = db.get(User, assignment.admin_id) if assignment else None
    admin_role = db.get(AdminRole, admin.id) if admin else None
    owner = db.get(User, ticket.user_id)
    transcript = [{"id": 0, "sender_id": ticket.user_id, "sender_role": "USER", "message": ticket.message, "attachments": json.loads(ticket.attachments_json or "[]"), "created_at": str(ticket.created_at)}]
    transcript.extend({"id": m.id, "sender_id": m.sender_id, "sender_role": m.sender_role, "message": m.message, "attachments": json.loads(m.attachments_json or "[]"), "created_at": str(m.created_at)} for m in db.scalars(select(SupportMessage).where(SupportMessage.ticket_id == ticket_id).order_by(SupportMessage.id)))
    archive = {"number": f"#{ticket.id:04d}", "agent": {"id": admin.public_id, "nickname": admin.nickname, "role": admin_role.role if admin_role else None} if admin else None, "customer": {"id": owner.public_id, "nickname": owner.nickname}, "reason": ticket.message, "snapshot": flow.snapshot, "server_context": json.loads(flow.context_json or "{}"), "closed_by": flow.closed_by, "messages": transcript}
    if not db.get(SupportArchive, ticket_id):
        db.add(SupportArchive(ticket_id=ticket_id, audit_json=json.dumps(archive, ensure_ascii=False)))
    if admin and role == "USER":
        text = "Müşteriniz müsait olmadığından dolayı destek talebi sonlandırılmıştır. Keyifli çalışmalar dileriz." if not_ready else "Müşterimiz ile ilgilendiğiniz zaman ayırdığınız için teşekkür ederiz. İyi çalışmalar."
        db.add(Notification(user_id=admin.id, kind="support_closed", title="Destek görüşmesi sonlandı", body=text))
    elif role != "USER":
        db.add(Notification(user_id=owner.id, kind="support_closed", title="Destek görüşmesi sonlandı", body=f"ErisChat ailesi olarak bizimle aranızda olduğunuzdan çok memnunuz {owner.nickname}. Herhangi bir talebiniz olduğunda tekrardan müşteri temsilcilerimiz ile iletişime geçebilirsiniz."))
    db.commit()
    return view(db, ticket, user)


class Ready(BaseModel):
    ready: bool


class Rating(BaseModel):
    score: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=1000)


class ReadReceipt(BaseModel):
    message_id: int = Field(ge=0)


class Presence(BaseModel):
    active: bool = True


def register_auth(current_user_dependency, disconnect_agent=None):
    @router.post("/presence")
    def presence(payload: Presence, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        role_of(db, user)
        agent = db.get(SupportAgent, user.id)
        if not agent:
            agent = SupportAgent(user_id=user.id, seen_at=now()); db.add(agent)
        if payload.active and (not agent.online_since or not agent.seen_at or utc(agent.seen_at) < now() - timedelta(seconds=15)):
            agent.online_since = now()
        agent.seen_at = now() if payload.active else now() - timedelta(seconds=30)
        db.commit(); dispatch(db)
        return {"restriction_seconds": remaining_restriction(db, user.id)}

    @router.get("/inbox")
    def inbox(db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        return admin_tickets(db, user)

    @router.get("/tickets/{ticket_id}")
    def detail(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket, _, _ = ticket_for(db, ticket_id, user, offered=True)
        return view(db, ticket, user)

    @router.get("/tickets/{ticket_id}/state")
    def state_route(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket, flow, _ = ticket_for(db, ticket_id, user, offered=True)
        last = db.scalar(select(SupportMessage.id).where(SupportMessage.ticket_id == ticket_id).order_by(SupportMessage.id.desc()).limit(1)) or 0
        return {"phase": flow.phase, "last": last, "customer_read": flow.customer_read_id, "agent_read": flow.agent_read_id, "rated": db.get(SupportReview, ticket_id) is not None}

    @router.post("/tickets/{ticket_id}/accept")
    def accept_route(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        return accept(db, user, ticket_id)

    @router.post("/tickets/{ticket_id}/decline")
    async def decline_route(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        result = decline(db, user, ticket_id)
        if result["restriction_seconds"] and disconnect_agent:
            await disconnect_agent(user.id)
        return result

    @router.post("/tickets/{ticket_id}/ready")
    def ready_route(ticket_id: int, payload: Ready, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket, flow, role = ticket_for(db, ticket_id, user)
        if role != "USER":
            raise HTTPException(403, "Bu seçim müşteriye aittir")
        if flow.phase != "awaiting_ready":
            raise HTTPException(409, "Hazırlık onayı beklenmiyor")
        if not payload.ready:
            return close(db, user, ticket_id, not_ready=True)
        flow.phase = "active"
        assignment = db.get(SupportAssignment, ticket_id)
        db.add(Notification(user_id=assignment.admin_id, kind="support_ready", title="Müşteriniz hazır", body="Yardımcı olduğunuz müşteriniz hazır, konuşmaya bağlıyorum sizi."))
        db.commit()
        return view(db, ticket, user)

    @router.post("/tickets/{ticket_id}/read")
    def read_route(ticket_id: int, payload: ReadReceipt, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket, flow, role = ticket_for(db, ticket_id, user)
        msg = db.get(SupportMessage, payload.message_id) if payload.message_id else None
        if payload.message_id and (not msg or msg.ticket_id != ticket_id):
            raise HTTPException(422, "Mesaj bu görüşmeye ait değil")
        key = "customer_read_id" if role == "USER" else "agent_read_id"
        setattr(flow, key, max(getattr(flow, key), payload.message_id))
        db.commit()
        return {"read": True}

    @router.post("/tickets/{ticket_id}/close")
    def close_route(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        return close(db, user, ticket_id)

    @router.post("/tickets/{ticket_id}/rating")
    def rating_route(ticket_id: int, payload: Rating, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        ticket, flow, role = ticket_for(db, ticket_id, user)
        if role != "USER" or flow.phase != "closed":
            raise HTTPException(403, "Yalnızca müşteri tamamlanmış görüşmeyi değerlendirebilir")
        if db.get(SupportReview, ticket_id):
            raise HTTPException(409, "Bu görüşme zaten değerlendirildi")
        db.add(SupportReview(ticket_id=ticket_id, score=payload.score, comment=payload.comment.strip())); db.commit()
        return {"saved": True}

    @router.get("/tickets/{ticket_id}/audit")
    def audit_route(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dependency)):
        if role_of(db, user) not in {"FA", "DA"}:
            raise HTTPException(403, "Denetim kayıtları için FA veya DA yetkisi gerekli")
        archive = db.get(SupportArchive, ticket_id)
        if not archive:
            raise HTTPException(404, "Denetim kaydı bulunamadı")
        return json.loads(archive.audit_json)
    return router
