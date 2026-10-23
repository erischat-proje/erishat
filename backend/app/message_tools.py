"""Conversation-scoped reply, edit, history, and search with shared privacy rules."""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, or_
from sqlalchemy.orm import Session
from .db import get_db
from .models import Conversation, ConversationMember, Message, User
from .message_detail_models import MessageDetail
from .platform_models import MessageHidden, MessageMedia, DirectMessageGift, UserBlock, PrivateMessageRequest, ConversationReadState
from .group_models import MessageGroup
from . import group_policy
from .dm_folders import require_unlocked
from .moderation import require_feature
from .runtime_tasks import database_task

router=APIRouter(prefix='/v1/message-tools',tags=['message-tools'])
_auth=_serialize=_notify=None
EDIT_MINUTES=15

def register(auth,serialize,notify):
    global _auth,_serialize,_notify
    _auth,_serialize,_notify=auth,serialize,notify

def authenticated(db: Session=Depends(get_db),authorization: str|None=Header(None),request: Request=None):
    return _auth(db,authorization,request)

def utc(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value

def access(db,cid,uid,token=None):
    conversation=db.get(Conversation,cid)
    if not conversation:raise HTTPException(404,'Konuşma bulunamadı.')
    if not db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==cid,ConversationMember.user_id==uid)):
        raise HTTPException(403,'Bu konuşmaya erişiminiz yok.')
    require_unlocked(db,uid,cid,token)
    return conversation

def visible_query(uid,cid):
    hidden=select(MessageHidden.message_id).where(MessageHidden.user_id==uid)
    return select(Message).where(Message.conversation_id==cid,Message.id.not_in(hidden),
        or_(Message.expires_at==None,Message.expires_at>datetime.now(timezone.utc)))

def visible_message(db,cid,uid,mid):
    row=db.scalar(visible_query(uid,cid).where(Message.id==mid))
    if not row:raise HTTPException(404,'Mesaj artık görüntülenemiyor.')
    return row

def create_text(db,cid,uid,text,reply_to_id=None):
    text=text.strip()
    if not text:raise ValueError('Mesaj boş olamaz')
    if reply_to_id is not None:
        # Caller holds group write lock where applicable. Lock the quoted row against deletion.
        visible_message(db,cid,uid,reply_to_id)
        quoted=db.scalar(select(Message.id).where(Message.id==reply_to_id).with_for_update())
        if quoted is None:raise HTTPException(404,'Yanıtlanan mesaj silindi.')
    conversation=db.get(Conversation,cid)
    msg=Message(conversation_id=cid,sender_id=uid,text=text)
    if conversation and conversation.type=='dm' and conversation.is_ephemeral:
        msg.expires_at=datetime.now(timezone.utc)+timedelta(hours=24)
    db.add(msg);db.flush()
    if reply_to_id is not None:db.add(MessageDetail(message_id=msg.id,reply_to_id=reply_to_id,has_reply=True))
    db.commit();db.refresh(msg)
    return msg

def extras(db,messages,viewer_id):
    """Batch optional metadata; never store or return copies of deleted quoted text."""
    if not messages:return {}
    ids=[m.id for m in messages]
    details={d.message_id:d for d in db.scalars(select(MessageDetail).where(MessageDetail.message_id.in_(ids)))}
    targets={d.reply_to_id for d in details.values() if d.reply_to_id}
    references={m.id:m for m in db.scalars(select(Message).where(Message.id.in_(targets)))} if targets else {}
    hidden=set(db.scalars(select(MessageHidden.message_id).where(MessageHidden.user_id==viewer_id,MessageHidden.message_id.in_(targets)))) if targets else set()
    media={r.message_id:r for r in db.execute(select(MessageMedia.message_id,MessageMedia.media_type,MessageMedia.temporary,MessageMedia.expires_at).where(MessageMedia.message_id.in_(targets)))} if targets else {}
    users={u.id:u for u in db.scalars(select(User).where(User.id.in_({m.sender_id for m in references.values()})))} if references else {}
    by_id={m.id:m for m in messages};now=datetime.now(timezone.utc);result={}
    for mid,detail in details.items():
        data={'edited_at':detail.edited_at,'reply_to_id':None,'reply':None}
        if detail.has_reply:
            target=references.get(detail.reply_to_id);attachment=media.get(detail.reply_to_id)
            available=target and target.conversation_id==by_id[mid].conversation_id and target.id not in hidden and (not target.expires_at or utc(target.expires_at)>now)
            if attachment and attachment.temporary and attachment.expires_at and utc(attachment.expires_at)<=now:available=False
            data['reply']={'unavailable':True,'text':'Mesaj artık görüntülenemiyor.','sender_name':''}
            if available:
                data['reply_to_id']=target.id
                data['reply']={'unavailable':False,'text':('Süreli fotoğraf' if attachment.temporary else 'Fotoğraf') if attachment and attachment.media_type=='image' else 'Sesli mesaj' if attachment and attachment.media_type=='voice' else target.text[:180],
                    'sender_name':users[target.sender_id].nickname if target.sender_id in users else 'Silinmiş kullanıcı'}
        result[mid]=data
    return result

def serialize_rows(db,rows,uid):
    from .performance_queries import message_context
    context=message_context(db,rows,uid)
    return [_serialize(db,m,uid,context) for m in rows]

@router.get('/{conversation_id}/history')
@database_task
async def history(conversation_id: str,before: int|None=Query(None,ge=1),around: int|None=Query(None,ge=1),limit: int=Query(50,ge=1,le=100),
                  x_eris_dm_vault: str|None=Header(None),db: Session=Depends(get_db),user: User=Depends(authenticated)):
    access(db,conversation_id,user.id,x_eris_dm_vault)
    query=visible_query(user.id,conversation_id)
    if before is not None and around is not None:raise HTTPException(422,'Tek bir geçmiş imleci kullanın.')
    if around is not None:
        visible_message(db,conversation_id,user.id,around)
        query=query.where(Message.id<=around)
    if before is not None:query=query.where(Message.id<before)
    rows=list(db.scalars(query.order_by(Message.id.desc()).limit(limit+1)))
    more=len(rows)>limit;rows=rows[:limit]
    # Looking up an older search result must keep a personal unread reminder.
    if before is None and around is None:
        from .dm_inbox import clear_manual_unread
        db.scalar(select(User.id).where(User.id==user.id).with_for_update())
        if clear_manual_unread(db,user.id,conversation_id):db.commit()
    incoming=max((m.id for m in rows if m.sender_id!=user.id),default=0)
    if incoming:
        db.scalar(select(User.id).where(User.id==user.id).with_for_update())
        state=db.scalar(select(ConversationReadState).where(ConversationReadState.conversation_id==conversation_id,ConversationReadState.user_id==user.id).execution_options(populate_existing=True))
        if state is None or incoming>state.last_read_message_id:
            if state is None:db.add(ConversationReadState(conversation_id=conversation_id,user_id=user.id,last_read_message_id=incoming))
            else:state.last_read_message_id=incoming
            db.commit()
            for uid in db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id!=user.id)):
                await _notify(db,uid,{'type':'dm_read','conversation_id':conversation_id,'reader_id':user.id,'read_up_to':incoming})
    return {'messages':serialize_rows(db,list(reversed(rows)),user.id),'has_more':more,'next_before':rows[-1].id if rows and more else None}

@router.get('/{conversation_id}/search')
@database_task
async def search(conversation_id: str,q: str=Query(...,min_length=2,max_length=100),before: int|None=Query(None,ge=1),
                 x_eris_dm_vault: str|None=Header(None),db: Session=Depends(get_db),user: User=Depends(authenticated)):
    access(db,conversation_id,user.id,x_eris_dm_vault)
    q=q.strip()
    if len(q)<2:raise HTTPException(422,'Arama metni en az 2 karakter olmalı.')
    query=visible_query(user.id,conversation_id).where(Message.text.icontains(q,autoescape=True))
    if before is not None:query=query.where(Message.id<before)
    rows=list(db.scalars(query.order_by(Message.id.desc()).limit(51)));more=len(rows)>50;rows=rows[:50]
    return {'messages':serialize_rows(db,rows,user.id),'has_more':more,'next_before':rows[-1].id if rows and more else None}

class EditText(BaseModel):
    text: str=Field(min_length=1,max_length=2000)
    expected_text: str=Field(min_length=1,max_length=2000)
    @field_validator('text')
    @classmethod
    def clean(cls,value):
        value=value.strip()
        if not value:raise ValueError('Mesaj boş olamaz.')
        return value

class EditCaption(BaseModel):
    caption: str=Field(max_length=1000)
    expected_text: str=Field(min_length=1,max_length=2000)

@router.patch('/{conversation_id}/{message_id}')
@database_task
async def edit(conversation_id: str,message_id: int,payload: EditText,x_eris_dm_vault: str|None=Header(None),
               db: Session=Depends(get_db),user: User=Depends(authenticated)):
    return await _edit_message(db,user,conversation_id,message_id,payload,x_eris_dm_vault)

@router.patch('/{conversation_id}/{message_id}/caption')
@database_task
async def edit_caption(conversation_id: str,message_id: int,payload: EditCaption,x_eris_dm_vault: str|None=Header(None),
                       db: Session=Depends(get_db),user: User=Depends(authenticated)):
    return await _edit_message(db,user,conversation_id,message_id,payload,x_eris_dm_vault,caption_mode=True)

async def _edit_message(db,user,conversation_id,message_id,payload,x_eris_dm_vault,caption_mode=False):
    conversation=access(db,conversation_id,user.id,x_eris_dm_vault)
    if conversation.type=='welcome':raise HTTPException(403,'Sistem mesajları düzenlenemez.')
    group_policy.require_write(db,conversation_id,user.id,consume=False,check_slow=False)
    require_feature(db,user.id)
    if conversation.type=='dm':
        peers=list(db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id!=user.id)))
        for peer in peers:
            blocked=db.scalar(select(UserBlock.id).where(or_(
                (UserBlock.blocker_id==peer)&(UserBlock.blocked_id==user.id),
                (UserBlock.blocker_id==user.id)&(UserBlock.blocked_id==peer))))
            if blocked:raise HTTPException(403,'Engelli sohbet mesajları düzenlenemez.')
        pending=db.scalar(select(PrivateMessageRequest.id).where(PrivateMessageRequest.conversation_id==conversation_id,PrivateMessageRequest.sender_id==user.id,PrivateMessageRequest.status!='accepted'))
        if pending:raise HTTPException(403,'Mesaj isteğiniz kabul edilmeden düzenleme yapılamaz.')
    visible_message(db,conversation_id,user.id,message_id)
    message=db.scalar(select(Message).where(Message.id==message_id).with_for_update().execution_options(populate_existing=True))
    if not message:raise HTTPException(404,'Mesaj silindi.')
    from .message_poll_models import MessagePoll
    if db.get(MessagePoll,message_id):raise HTTPException(403,'Anket sorusu ve seçenekleri sonradan düzenlenemez.')
    if message.sender_id!=user.id:raise HTTPException(403,'Yalnızca kendi mesajınızı düzenleyebilirsiniz.')
    media=db.get(MessageMedia,message_id)
    gift=db.scalar(select(DirectMessageGift.message_id).where(DirectMessageGift.message_id==message_id))
    if caption_mode:
        from . import message_captions
        from .message_attachment_models import MessageAttachment
        if gift or not media or media.temporary or media.media_type not in {'image','video','document'}:
            raise HTTPException(403,'Yalnızca normal fotoğraf, video ve belge açıklamaları düzenlenebilir.')
        if not db.scalar(select(MessageMedia.message_id).where(MessageMedia.message_id==message_id,MessageMedia.data.is_not(None))):raise HTTPException(404,'Dosya artık görüntülenemiyor.')
        caption=message_captions.clean(payload.caption,media.media_type)
        attachment=db.get(MessageAttachment,message_id) if media.media_type=='document' else None
        new_text=message_captions.text(media.media_type,attachment.filename if attachment else '',caption)
    else:
        if media or gift:raise HTTPException(403,'Yalnızca metin mesajları düzenlenebilir.')
        new_text=payload.text
    if datetime.now(timezone.utc)-utc(message.created_at)>timedelta(minutes=EDIT_MINUTES):raise HTTPException(403,'Düzenleme süresi doldu. İlk 15 dakika içinde düzenleyebilirsiniz.')
    if message.text!=payload.expected_text:raise HTTPException(409,'Mesaj başka bir oturumda değişti. Sohbeti yenileyin.')
    if message.text!=new_text:
        message.text=new_text
        detail=db.get(MessageDetail,message_id)
        if not detail:detail=MessageDetail(message_id=message_id,has_reply=False);db.add(detail)
        detail.edited_at=datetime.now(timezone.utc)
        db.commit()
    result=_serialize(db,message,user.id)
    # Content is fetched again under each viewer's vault and visibility rules.
    for uid in db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id==conversation_id)):
        await _notify(db,uid,{'type':'dm_message_updated','conversation_id':conversation_id,'message_id':message_id})
    return result


@router.get('/{conversation_id}/shared')
@database_task
async def shared(conversation_id: str,kind: str=Query('all',pattern='^(all|image|video|voice|document)$'),
                 q: str=Query('',max_length=100),before: int|None=Query(None,ge=1),limit: int=Query(30,ge=1,le=50),
                 x_eris_dm_vault: str|None=Header(None),db: Session=Depends(get_db),user: User=Depends(authenticated)):
    from .message_attachment_models import MessageAttachment
    access(db,conversation_id,user.id,x_eris_dm_vault)
    query=visible_query(user.id,conversation_id).join(MessageMedia,MessageMedia.message_id==Message.id).outerjoin(MessageAttachment,MessageAttachment.message_id==Message.id).where(MessageMedia.temporary.is_(False),MessageMedia.data.is_not(None))
    if kind!='all':query=query.where(MessageMedia.media_type==kind)
    q=q.strip()
    if q:query=query.where(or_(Message.text.icontains(q,autoescape=True),MessageAttachment.filename.icontains(q,autoescape=True)))
    if before is not None:query=query.where(Message.id<before)
    rows=list(db.scalars(query.order_by(Message.id.desc()).limit(limit+1)));more=len(rows)>limit;rows=rows[:limit]
    return {'messages':serialize_rows(db,rows,user.id),'has_more':more,'next_before':rows[-1].id if rows and more else None}
