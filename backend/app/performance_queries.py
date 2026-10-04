"""Bounded page queries; binary media are loaded only by media endpoints."""
from sqlalchemy import select, func, and_
from .models import Conversation, ConversationMember, Message, User
from .platform_models import (ConversationFolder, ConversationReadState, Family, MessageHidden,
    PinnedMessage, DirectMessageGift, MessageMedia)


def message_context(db, messages, viewer_id):
    if not messages:
        return {'hidden': set(), 'pinned': set(), 'gifts': {}, 'media': {}, 'read': 0}
    cid = messages[0].conversation_id
    ids = [m.id for m in messages]
    conversation = db.get(Conversation, cid)
    family = db.scalar(select(Family.id).where(Family.chat_conversation_id == cid))
    state = db.scalar(select(ConversationReadState).where(
        ConversationReadState.conversation_id == cid, ConversationReadState.user_id != viewer_id)) if conversation and conversation.type != 'family' and not family else None
    from .relationship_models import CoupleRewardSelection, CoupleMember, Couple
    sender_ids={m.sender_id for m in messages}
    senders={u.id:u for u in db.scalars(select(User).where(User.id.in_(sender_ids)))}
    bubbles=dict(db.execute(select(CoupleRewardSelection.user_id,CoupleRewardSelection.asset_key).join(
        CoupleMember,CoupleMember.user_id==CoupleRewardSelection.user_id).join(Couple,Couple.id==CoupleMember.couple_id).where(
        CoupleRewardSelection.user_id.in_(sender_ids),CoupleRewardSelection.kind=='bubble',Couple.active.is_(True))).all())
    bubbles.update({uid:u.bubble_asset for uid,u in senders.items() if u.bubble_asset})
    return {'senders':senders,'bubbles':bubbles,'read': state.last_read_message_id if state else 0,
        'hidden': set(db.scalars(select(MessageHidden.message_id).where(MessageHidden.user_id == viewer_id, MessageHidden.message_id.in_(ids)))),
        'pinned': set(db.scalars(select(PinnedMessage.message_id).where(PinnedMessage.conversation_id == cid, PinnedMessage.message_id.in_(ids)))),
        'gifts': {r.message_id: r for r in db.scalars(select(DirectMessageGift).where(DirectMessageGift.message_id.in_(ids)))},
        'media': {r.message_id: r for r in db.scalars(select(MessageMedia).where(MessageMedia.message_id.in_(ids)))}}


def conversation_page(db, user_id, folder, limit, offset):
    latest = select(func.max(Message.created_at)).where(Message.conversation_id == Conversation.id).correlate(Conversation).scalar_subquery()
    query = select(Conversation).join(ConversationMember, ConversationMember.conversation_id == Conversation.id).outerjoin(
        ConversationFolder, and_(ConversationFolder.conversation_id == Conversation.id, ConversationFolder.user_id == user_id)).where(ConversationMember.user_id == user_id)
    locked = func.coalesce(ConversationFolder.locked, False)
    archived = func.coalesce(ConversationFolder.archived, False)
    query = query.where(locked.is_(True) if folder == 'locked' else and_(locked.is_(False), archived.is_(folder == 'archive')))
    rows = list(db.scalars(query.order_by(latest.desc().nullslast(), Conversation.created_at.desc(), Conversation.id).offset(offset).limit(limit)).unique())
    if not rows:
        return []
    ids = [r.id for r in rows]
    member_rows = list(db.execute(select(ConversationMember.conversation_id, ConversationMember.user_id).where(ConversationMember.conversation_id.in_(ids))))
    users = {r.id:r for r in db.scalars(select(User).where(User.id.in_({r.user_id for r in member_rows})))}
    members = {cid:[] for cid in ids}
    for cid, uid in member_rows:
        u = users.get(uid)
        members[cid].append({'user_id':uid, 'nickname':u.nickname if u else None, 'avatar':u.avatar if u else None,
            'avatar_asset':u.avatar_asset if u else None, 'frame_asset':u.frame_asset if u else None})
    families = dict(db.execute(select(Family.chat_conversation_id, Family.name).where(Family.chat_conversation_id.in_(ids))).all())
    hidden = select(MessageHidden.id).where(MessageHidden.message_id == Message.id, MessageHidden.user_id == user_id).exists()
    last_ids = select(func.max(Message.id)).where(Message.conversation_id.in_(ids), ~hidden).group_by(Message.conversation_id)
    last = {m.conversation_id:m for m in db.scalars(select(Message).where(Message.id.in_(last_ids)))}
    unread = dict(db.execute(select(Message.conversation_id, func.count(Message.id)).outerjoin(ConversationReadState,
        and_(ConversationReadState.conversation_id == Message.conversation_id, ConversationReadState.user_id == user_id)).where(
        Message.conversation_id.in_(ids), Message.sender_id != user_id,
        Message.id > func.coalesce(ConversationReadState.last_read_message_id, 0), ~hidden).group_by(Message.conversation_id)).all())
    return [{'id':c.id, 'type':'family' if families.get(c.id) else c.type, 'created_at':c.created_at,
        'members':members[c.id], 'name':families[c.id]+' aile sohbeti' if families.get(c.id) else 'ErisChat' if c.type == 'welcome' else None,
        'unread_count':int(unread.get(c.id,0)), 'last_message':last[c.id].text if c.id in last else None,
        'last_message_at':last[c.id].created_at if c.id in last else None} for c in rows]
