"""Bounded page queries; binary media are loaded only by media endpoints."""
from sqlalchemy import select, func, and_, or_
from .models import Conversation, ConversationMember, Message, User
from .group_models import MessageGroup
from .notification_policy import mute_states
from .platform_models import (ConversationFolder, ConversationReadState, Family, MessageHidden,
    PinnedMessage, DirectMessageGift, MessageMedia, FamilyVisual, ConversationInboxPreference, PrivateMessageRequest)


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
    from .message_stars import starred_ids
    from .message_actions import annotations
    from .message_tools import extras
    from .message_attachment_models import MessageAttachment
    return {'starred':starred_ids(db,messages,viewer_id),'actions':annotations(db,messages,viewer_id),'attachments':{a.message_id:a for a in db.scalars(select(MessageAttachment).where(MessageAttachment.message_id.in_(ids)))},'details':extras(db,messages,viewer_id),'senders':senders,'bubbles':bubbles,'read': state.last_read_message_id if state else 0,
        'hidden': set(db.scalars(select(MessageHidden.message_id).where(MessageHidden.user_id == viewer_id, MessageHidden.message_id.in_(ids)))),
        'pinned': set(db.scalars(select(PinnedMessage.message_id).where(PinnedMessage.conversation_id == cid, PinnedMessage.message_id.in_(ids)))),
        'gifts': {r.message_id: r for r in db.scalars(select(DirectMessageGift).where(DirectMessageGift.message_id.in_(ids)))},
        'media': {r.message_id: r for r in db.scalars(select(MessageMedia).where(MessageMedia.message_id.in_(ids)))}}


def conversation_page(db, user_id, folder, limit, offset, q='', view='all'):
    from .dm_inbox import visible_conditions
    conditions = visible_conditions(user_id)
    latest = select(func.max(Message.created_at)).where(Message.conversation_id == Conversation.id, *conditions).correlate(Conversation).scalar_subquery()
    query = select(Conversation).join(ConversationMember, ConversationMember.conversation_id == Conversation.id).outerjoin(
        ConversationFolder, and_(ConversationFolder.conversation_id == Conversation.id, ConversationFolder.user_id == user_id)).where(ConversationMember.user_id == user_id)
    query = query.outerjoin(ConversationInboxPreference, and_(
        ConversationInboxPreference.conversation_id == Conversation.id, ConversationInboxPreference.user_id == user_id))
    pinned = func.coalesce(ConversationInboxPreference.pinned, False)
    manual = func.coalesce(ConversationInboxPreference.manual_unread, False)
    pending = select(PrivateMessageRequest.id).where(PrivateMessageRequest.conversation_id == Conversation.id,
        PrivateMessageRequest.recipient_id == user_id, PrivateMessageRequest.status == 'pending').exists()
    query = query.where(~pending)
    if view == 'pinned':
        query = query.where(pinned.is_(True))
    if view == 'unread':
        read = select(ConversationReadState.last_read_message_id).where(
            ConversationReadState.conversation_id == Conversation.id, ConversationReadState.user_id == user_id).correlate(Conversation).scalar_subquery()
        unread_exists = select(Message.id).where(Message.conversation_id == Conversation.id,
            Message.sender_id != user_id, Message.id > func.coalesce(read, 0), *conditions).exists()
        query = query.where(or_(manual.is_(True), unread_exists))
    if q.strip():
        # Escape LIKE wildcards; search names/IDs, never message text or vault contents.
        term = '%' + q.strip().replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%'
        peer = select(ConversationMember.id).join(User, User.id == ConversationMember.user_id).where(
            ConversationMember.conversation_id == Conversation.id, ConversationMember.user_id != user_id,
            or_(User.nickname.ilike(term, escape='!'), User.public_id.ilike(term, escape='!'))).exists()
        group_name = select(MessageGroup.conversation_id).where(MessageGroup.conversation_id == Conversation.id,
            MessageGroup.name.ilike(term, escape='!')).exists()
        family_name = select(Family.id).where(Family.chat_conversation_id == Conversation.id, Family.name.ilike(term, escape='!')).exists()
        query = query.where(or_(group_name, family_name, and_(Conversation.type == 'dm', peer),
            and_(Conversation.type == 'welcome', func.lower('LidyaChat').like(term.lower(), escape='!'))))
    locked = func.coalesce(ConversationFolder.locked, False)
    archived = func.coalesce(ConversationFolder.archived, False)
    query = query.where(locked.is_(True) if folder == 'locked' else and_(locked.is_(False), archived.is_(folder == 'archive')))
    # Do not show empty DM rows after local or mutual deletion.
    visible = select(Message.id).where(
        Message.conversation_id == Conversation.id, *conditions
    ).exists()
    family = select(Family.id).where(Family.chat_conversation_id == Conversation.id).exists()
    query = query.where((Conversation.type == 'welcome') | (Conversation.type == 'group') | family | visible)
    rows = list(db.scalars(query.order_by(pinned.desc(), latest.desc().nullslast(), Conversation.created_at.desc(), Conversation.id).offset(offset).limit(limit)).unique())
    if not rows:
        return []
    ids = [r.id for r in rows]
    mutes = mute_states(db, user_id, ids)
    member_rows = list(db.execute(select(ConversationMember.conversation_id, ConversationMember.user_id).where(ConversationMember.conversation_id.in_(ids))))
    users = {r.id:r for r in db.scalars(select(User).where(User.id.in_({r.user_id for r in member_rows})))}
    members = {cid:[] for cid in ids}
    for cid, uid in member_rows:
        u = users.get(uid)
        members[cid].append({'user_id':uid, 'nickname':u.nickname if u else None, 'avatar':u.avatar if u else None,
            'avatar_asset':u.avatar_asset if u else None, 'frame_asset':u.frame_asset if u else None})
    families = dict(db.execute(select(Family.chat_conversation_id, Family.name).where(Family.chat_conversation_id.in_(ids))).all())
    family_images = dict(db.execute(select(Family.chat_conversation_id, Family.id).join(
        FamilyVisual, FamilyVisual.family_id == Family.id).where(Family.chat_conversation_id.in_(ids))).all())
    group_images = set(db.scalars(select(MessageGroup.conversation_id).where(
        MessageGroup.conversation_id.in_(ids), MessageGroup.image.is_not(None))))
    groups = {g.conversation_id:g for g in db.scalars(select(MessageGroup).where(MessageGroup.conversation_id.in_(ids)))}
    preferences = {p.conversation_id:p for p in db.scalars(select(ConversationInboxPreference).where(
        ConversationInboxPreference.user_id == user_id, ConversationInboxPreference.conversation_id.in_(ids)))}
    last_ids = select(func.max(Message.id)).where(Message.conversation_id.in_(ids), *conditions).group_by(Message.conversation_id)
    last = {m.conversation_id:m for m in db.scalars(select(Message).where(Message.id.in_(last_ids)))}
    unread = dict(db.execute(select(Message.conversation_id, func.count(Message.id)).outerjoin(ConversationReadState,
        and_(ConversationReadState.conversation_id == Message.conversation_id, ConversationReadState.user_id == user_id)).where(
        Message.conversation_id.in_(ids), Message.sender_id != user_id,
        Message.id > func.coalesce(ConversationReadState.last_read_message_id, 0), *conditions).group_by(Message.conversation_id)).all())
    return [{**mutes.get(c.id, {'is_muted':False, 'muted_until':None}), 'id':c.id, 'type':'family' if families.get(c.id) else c.type, 'created_at':c.created_at,
        'members':members[c.id], 'name':families[c.id]+' aile sohbeti' if families.get(c.id) else groups[c.id].name if c.id in groups else 'LidyaChat' if c.type == 'welcome' else None,
        'avatar_url':f'/families/{family_images[c.id]}/avatar' if c.id in family_images else f'/message-groups/{c.id}/image' if c.id in group_images else None,
        'pinned':bool(preferences[c.id].pinned) if c.id in preferences else False,
        'manual_unread':bool(preferences[c.id].manual_unread) if c.id in preferences else False,
        'unread_count':int(unread.get(c.id,0)), 'last_message':last[c.id].text if c.id in last else None,
        'last_message_at':last[c.id].created_at if c.id in last else None} for c in rows]
