"""Group/family polls with private choices and server-enforced write rules."""
from datetime import datetime, timedelta, timezone
from typing import Literal, Annotated
import unicodedata
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import Message, User, ConversationMember
from .platform_models import Family, FamilyMember, Notification
from .group_models import MessageGroup
from .message_poll_models import MessagePoll, MessagePollVote
from . import group_policy, message_tools
from .runtime_tasks import database_task

router = APIRouter(prefix='/v1/message-polls', tags=['message-polls'])
_access = _notify = _serialize = _notifications = None


def register(access, notify, serialize, notifications):
    global _access, _notify, _serialize, _notifications
    _access, _notify, _serialize, _notifications = access, notify, serialize, notifications


def now():
    return datetime.now(timezone.utc)


def manager(db, cid, uid):
    group = db.get(MessageGroup, cid)
    if group:
        return group_policy.role(db, cid, uid) in ('owner', 'moderator')
    family = db.scalar(select(Family).where(Family.chat_conversation_id == cid))
    member = db.scalar(select(FamilyMember).where(FamilyMember.family_id == family.id, FamilyMember.user_id == uid)) if family else None
    return bool(family and (family.owner_id == uid or member and member.role in ('owner', 'admin')))


def annotations(db, messages, viewer_id):
    polls = list(db.scalars(select(MessagePoll).where(MessagePoll.message_id.in_([m.id for m in messages])))) if messages else []
    if not polls:
        return {}
    votes = {p.message_id:[] for p in polls}
    for vote in db.scalars(select(MessagePollVote).where(MessagePollVote.message_id.in_(votes))):
        votes[vote.message_id].append(vote)
    cid = messages[0].conversation_id
    group = db.get(MessageGroup, cid)
    group_closed = bool(group and group_policy.settings(db, cid).closed)
    can_manage = manager(db, cid, viewer_id)
    at = now(); result = {}
    for p in polls:
        closed = bool(p.closed_at or p.expires_at and message_tools.utc(p.expires_at) <= at or group_closed)
        counts = [0] * len(p.options); mine = []
        for vote in votes[p.message_id]:
            for index in vote.choices:
                if 0 <= index < len(counts):counts[index] += 1
            if vote.user_id == viewer_id:mine = vote.choices
        result[p.message_id] = {'revision':p.revision, 'question':p.question, 'multiple':p.multiple,
            'options':[{'id':i, 'text':text, 'count':counts[i]} for i,text in enumerate(p.options)],
            'my_choices':mine, 'voter_count':len(votes[p.message_id]), 'is_closed':closed,
            'expires_at':message_tools.utc(p.expires_at), 'closed_at':message_tools.utc(p.closed_at),
            'can_close':not closed and (p.creator_id == viewer_id or can_manage)}
    return result


def result(db, message, uid):
    return annotations(db, [message], uid)[message.id]


def readable(db, cid, mid, uid, token):
    message_tools.access(db, cid, uid, token)
    message = message_tools.visible_message(db, cid, uid, mid)
    if not db.get(MessagePoll, mid):raise HTTPException(404, 'Anket bulunamadı.')
    return message


def write_access(db, cid, user, token, consume=False):
    group_policy.require_write(db, cid, user.id, consume=consume, check_slow=consume)
    conversation = _access(db, cid, user, token)
    family = db.scalar(select(Family.id).where(Family.chat_conversation_id == cid, Family.closed.is_(False)))
    if not db.get(MessageGroup, cid) and not family:
        raise HTTPException(400, 'Anketler yalnızca grup ve aile sohbetlerinde kullanılabilir.')
    if conversation.is_ephemeral:raise HTTPException(403, 'Süreli sohbette anket oluşturulamaz veya oylanamaz.')
    return conversation


async def notify_change(db, cid, mid):
    for uid in db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id == cid)):
        await _notify(db, uid, {'type':'dm_poll_updated', 'conversation_id':cid, 'message_id':mid})


class CreatePoll(BaseModel):
    model_config = ConfigDict(extra='forbid')
    question: str = Field(min_length=1, max_length=180)
    options: list[str] = Field(min_length=2, max_length=10)
    multiple: StrictBool = False
    duration_seconds: Literal[86400,604800] | None = None
    request_key: str = Field(min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')

    @field_validator('question')
    @classmethod
    def question_text(cls, value):
        value = value.strip()
        if not value:raise ValueError('Anket sorusu boş olamaz.')
        return value

    @field_validator('options')
    @classmethod
    def distinct_options(cls, values):
        values = [' '.join(v.split()) for v in values]
        if any(not v or len(v)>80 for v in values):raise ValueError('Her seçenek 1–80 karakter olmalı.')
        if len({unicodedata.normalize('NFKC', v).casefold().replace('ı','i').replace('\u0307','') for v in values}) != len(values):
            raise ValueError('Anket seçenekleri farklı olmalı.')
        return values


@router.post('/{conversation_id}')
@database_task
async def create(conversation_id: str, payload: CreatePoll, x_eris_dm_vault: str | None = Header(None),
        db: Session = Depends(get_db), user: User = Depends(message_tools.authenticated)):
    write_access(db, conversation_id, user, x_eris_dm_vault)
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    previous = db.scalar(select(MessagePoll).where(MessagePoll.creator_id == user.id, MessagePoll.request_key == payload.request_key))
    if previous:
        message = readable(db, conversation_id, previous.message_id, user.id, x_eris_dm_vault)
        if previous.question != payload.question or previous.options != payload.options or previous.multiple != payload.multiple or previous.duration_seconds != payload.duration_seconds:
            raise HTTPException(409, 'Bu işlem anahtarı başka bir anket için kullanılmış.')
        return _serialize(db, message, user.id)
    write_access(db, conversation_id, user, x_eris_dm_vault, consume=True)
    message = Message(conversation_id=conversation_id, sender_id=user.id, text='[Anket] '+payload.question)
    db.add(message); db.flush()
    db.add(MessagePoll(message_id=message.id, creator_id=user.id, request_key=payload.request_key,
        question=payload.question, options=payload.options, multiple=payload.multiple, duration_seconds=payload.duration_seconds,
        expires_at=now()+timedelta(seconds=payload.duration_seconds) if payload.duration_seconds else None))
    members = list(db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation_id)))
    for uid in members:
        if uid != user.id and _notifications(db, uid, conversation_id):
            db.add(Notification(user_id=uid, kind='dm_message', title=user.nickname, body='Yeni bir anket oluşturdu.'))
    db.commit(); db.refresh(message)
    for uid in members:
        await _notify(db, uid, {'type':'dm_message', 'conversation_id':conversation_id, 'message_id':message.id,
            'sender_id':user.id, 'sender_nickname':user.nickname, 'text':message.text,
            'created_at':message.created_at.isoformat(), 'has_poll':True})
    return _serialize(db, message, user.id)


@router.get('/{conversation_id}/{message_id}')
@database_task
async def get(conversation_id: str, message_id: int, x_eris_dm_vault: str | None = Header(None),
        db: Session = Depends(get_db), user: User = Depends(message_tools.authenticated)):
    return result(db, readable(db, conversation_id, message_id, user.id, x_eris_dm_vault), user.id)


class VotePoll(BaseModel):
    model_config = ConfigDict(extra='forbid')
    choices: list[Annotated[StrictInt, Field(ge=0, le=9)]] = Field(max_length=10)


@router.put('/{conversation_id}/{message_id}/vote')
@database_task
async def vote(conversation_id: str, message_id: int, payload: VotePoll, x_eris_dm_vault: str | None = Header(None),
        db: Session = Depends(get_db), user: User = Depends(message_tools.authenticated)):
    write_access(db, conversation_id, user, x_eris_dm_vault)
    message = readable(db, conversation_id, message_id, user.id, x_eris_dm_vault)
    poll = db.scalar(select(MessagePoll).where(MessagePoll.message_id == message_id).with_for_update().execution_options(populate_existing=True))
    if not poll:raise HTTPException(404, 'Anket silindi.')
    if poll.closed_at or poll.expires_at and message_tools.utc(poll.expires_at) <= now():
        raise HTTPException(409, 'Anket oylamaya kapalı.')
    choices = sorted(set(payload.choices))
    if any(i >= len(poll.options) for i in choices) or not poll.multiple and len(choices)>1:
        raise HTTPException(422, 'Bu anket için geçersiz seçim.')
    row = db.get(MessagePollVote, (message_id, user.id), populate_existing=True)
    changed = False
    if not choices:
        if row:db.delete(row); changed = True
    elif row:
        if row.choices != choices:row.choices = choices; changed = True
    else:db.add(MessagePollVote(message_id=message_id, user_id=user.id, choices=choices)); changed = True
    if changed:poll.revision += 1
    db.commit()
    if changed:await notify_change(db, conversation_id, message_id)
    return result(db, message, user.id)


@router.post('/{conversation_id}/{message_id}/close')
@database_task
async def close(conversation_id: str, message_id: int, x_eris_dm_vault: str | None = Header(None),
        db: Session = Depends(get_db), user: User = Depends(message_tools.authenticated)):
    message = readable(db, conversation_id, message_id, user.id, x_eris_dm_vault)
    if db.get(MessageGroup, conversation_id):group_policy.locked_group(db, conversation_id, active=False)
    poll = db.scalar(select(MessagePoll).where(MessagePoll.message_id == message_id).with_for_update().execution_options(populate_existing=True))
    if not poll:raise HTTPException(404, 'Anket silindi.')
    if poll.creator_id != user.id and not manager(db, conversation_id, user.id):
        raise HTTPException(403, 'Anketi yalnızca oluşturan kişi veya sohbet yöneticisi kapatabilir.')
    if not poll.closed_at:
        poll.closed_at = now(); poll.revision += 1; db.commit()
        await notify_change(db, conversation_id, message_id)
    return result(db, message, user.id)
