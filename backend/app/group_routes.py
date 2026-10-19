"""Authenticated paid group creation and metadata APIs."""
from io import BytesIO
from uuid import uuid4
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, UploadFile, File, Form
from PIL import Image
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from .models import User, Conversation, ConversationMember
from .group_models import MessageGroup, GroupRole, GroupInvitation
from .moderation import require_feature
from .platform_models import UserBlock, Notification
from sqlalchemy import or_, and_

router = APIRouter(prefix='/v1/message-groups', tags=['message-groups'])
_auth = None
# LIDYACHAT_GROUP_CREATE_20MB_V1
GROUP_IMAGE_MAX_BYTES = 20_000_000

def register_auth(fn):
    global _auth
    _auth = fn

def authenticated(db: Session = Depends(get_db), authorization: str | None = Header(None), request: Request = None):
    return _auth(db, authorization, request)

def info(g):
    return {'id':g.conversation_id,'conversation_id':g.conversation_id,'name':g.name,
            'description':g.description,'owner_id':g.owner_id,'has_image':bool(g.image),
            'image_url':'/message-groups/'+g.conversation_id+'/image' if g.image else None}

@router.post('', status_code=201)
async def create_group(name: str = Form(...), description: str = Form(''), request_key: str = Form(...),
                       image: UploadFile | None = File(None), db: Session = Depends(get_db), user: User = Depends(authenticated)):
    name=name.strip();description=description.strip()
    if not 2 <= len(name) <= 64 or len(description)>500:
        raise HTTPException(422,'Grup adı 2-64, açıklama en fazla 500 karakter olmalı.')
    if not 16 <= len(request_key) <= 64 or not all(c.isalnum() or c in '_-' for c in request_key):
        raise HTTPException(422,'Geçersiz işlem anahtarı.')
    # Serialize charges by locking the payer before looking up idempotency key.
    payer=db.scalar(select(User).where(User.id==user.id).with_for_update())
    existing=db.scalar(select(MessageGroup).where(MessageGroup.request_key==request_key))
    if existing:
        if existing.owner_id!=user.id:raise HTTPException(409,'İşlem anahtarı kullanımda.')
        return {**info(existing),'already_processed':True,'balance':int(payer.lidya)}
    photo=None;mime=None
    if image and image.filename:
        data=await image.read(GROUP_IMAGE_MAX_BYTES + 1)
        if len(data)>GROUP_IMAGE_MAX_BYTES:raise HTTPException(413,'Fotoğraf en fazla 20 MB olabilir.')
        try:
            with Image.open(BytesIO(data)) as im:
                im.verify()
            with Image.open(BytesIO(data)) as im:
                im=im.convert('RGB');im.thumbnail((512,512))
                output=BytesIO();im.save(output,format='JPEG',quality=82)
                photo=output.getvalue();mime='image/jpeg'
        except Exception:
            raise HTTPException(415,'Geçerli bir fotoğraf seçin.')
    if int(payer.lidya or 0)<1000:raise HTTPException(402,'Grup kurmak için 1.000 Lidya gerekli.')
    cid='grp_'+uuid4().hex
    db.info.update(lidya_operation='message_group_create',lidya_actor_id=user.id,lidya_reference_id=cid)
    try:
        # Insert parent rows before dependent roles; all writes and the charge stay atomic.
        db.add(Conversation(id=cid,type='group'))
        db.flush()
        db.add(MessageGroup(conversation_id=cid,owner_id=user.id,request_key=request_key,
                            name=name,description=description,image=photo,image_mime=mime))
        db.flush()
        db.add(ConversationMember(conversation_id=cid,user_id=user.id))
        db.add(GroupRole(conversation_id=cid,user_id=user.id,role="owner"))
        payer.lidya-=1000
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        for k in ('lidya_operation','lidya_actor_id','lidya_reference_id'):db.info.pop(k,None)
    return {**info(db.get(MessageGroup,cid)),'already_processed':False,'balance':int(payer.lidya)}

@router.get('/invitations/mine')
def my_invitations(db: Session=Depends(get_db),user: User=Depends(authenticated)):
    rows=list(db.scalars(select(GroupInvitation).where(GroupInvitation.invitee_id==user.id,GroupInvitation.status=='pending')))
    return [{'conversation_id':r.conversation_id,'name':g.name,'invited_by':r.invited_by,'has_image':bool(g.image),'image_url':'/message-groups/'+r.conversation_id+'/image' if g.image else None} for r in rows if (g:=db.get(MessageGroup,r.conversation_id))]

@router.get('/{conversation_id}')
def get_group(conversation_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    group=db.get(MessageGroup,conversation_id)
    if not group:raise HTTPException(404,'Grup bulunamadı.')
    member=db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==user.id))
    if not member:raise HTTPException(403,'Bu gruba erişiminiz yok.')
    return info(group)

@router.get('/{conversation_id}/image')
def group_image(conversation_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    group=db.get(MessageGroup,conversation_id)
    if not group or not group.image:raise HTTPException(404,'Grup fotoğrafı yok.')
    if not db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==user.id)) and not db.scalar(select(GroupInvitation.invitee_id).where(GroupInvitation.conversation_id==conversation_id,GroupInvitation.invitee_id==user.id,GroupInvitation.status=='pending')):
        raise HTTPException(403,'Bu grup fotoğrafına erişiminiz yok.')
    return Response(content=group.image,media_type=group.image_mime or 'image/jpeg',headers={'Cache-Control':'private, max-age=300'})


def member_role(db, cid, uid):
    group=db.get(MessageGroup,cid)
    if not group: raise HTTPException(404,'Grup bulunamadı.')
    if group.owner_id==uid: return 'owner'
    member=db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==cid,ConversationMember.user_id==uid))
    if not member: raise HTTPException(403,'Bu gruba üye değilsiniz.')
    row=db.get(GroupRole,(cid,uid))
    return row.role if row else 'member'

def manage_role(db,cid,uid):
    role=member_role(db,cid,uid)
    if role not in ('owner','moderator'):raise HTTPException(403,'Bu işlem için moderatör yetkisi gerekli.')
    return role

@router.get('/{conversation_id}/members')
def members(conversation_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    member_role(db,conversation_id,user.id)
    ids=list(db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id==conversation_id)))
    result=[]
    for uid in ids:
        target=db.get(User,uid)
        if target:result.append({'user_id':uid,'nickname':target.nickname,'role':member_role(db,conversation_id,uid)})
    return result

@router.post('/{conversation_id}/invitations',status_code=201)
def invite(conversation_id: str,payload: dict,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    manage_role(db,conversation_id,user.id)
    uid=str(payload.get('user_id') or '').strip()
    target=db.get(User,uid)
    if not target or not target.is_active or uid==user.id:raise HTTPException(404,'Kullanıcı bulunamadı.')
    if db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==uid)):
        raise HTTPException(409,'Kullanıcı zaten grupta.')
    if db.scalar(select(UserBlock.id).where(or_(and_(UserBlock.blocker_id==uid,UserBlock.blocked_id==user.id),and_(UserBlock.blocker_id==user.id,UserBlock.blocked_id==uid)))):
        raise HTTPException(403,'Bu kullanıcıya davet gönderilemez.')
    require_feature(db,user.id,[uid])
    row=db.get(GroupInvitation,(conversation_id,uid))
    if row and row.status=='pending':return {'invited':True,'already_pending':True}
    if row:row.status='pending';row.invited_by=user.id
    else:db.add(GroupInvitation(conversation_id=conversation_id,invitee_id=uid,invited_by=user.id,status='pending'))
    group=db.get(MessageGroup,conversation_id)
    db.add(Notification(user_id=uid,kind='message_group_invite',title='Grup daveti',body=f'{group.name} grubuna davet edildiniz.'))
    db.commit()
    return {'invited':True,'already_pending':False}

@router.post('/{conversation_id}/invitations/respond')
def respond(conversation_id: str,payload: dict,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    action=payload.get('action')
    if action not in ('accept','reject'):raise HTTPException(422,'Geçersiz yanıt.')
    db.scalar(select(User.id).where(User.id==user.id).with_for_update())
    row=db.get(GroupInvitation,(conversation_id,user.id))
    if not row or row.status!='pending':raise HTTPException(404,'Bekleyen davet bulunamadı.')
    if action=='accept':
        count=db.scalar(select(func.count(ConversationMember.id)).where(ConversationMember.conversation_id==conversation_id))
        if count>=50:raise HTTPException(409,'Grup dolu.')
        if not db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==user.id)):
            db.add(ConversationMember(conversation_id=conversation_id,user_id=user.id))
        db.add(GroupRole(conversation_id=conversation_id,user_id=user.id,role='member'))
    row.status='accepted' if action=='accept' else 'rejected'
    group=db.get(MessageGroup,conversation_id)
    recipients={row.invited_by,group.owner_id}
    recipients.update(db.scalars(select(GroupRole.user_id).where(GroupRole.conversation_id==conversation_id,GroupRole.role=='moderator')))
    recipients.discard(user.id)
    outcome='kabul etti' if action=='accept' else 'reddetti'
    for recipient in recipients:
        db.add(Notification(user_id=recipient,kind='message_group_reply',title='Grup daveti yanıtı',body=f'{user.nickname} grup davetinizi {outcome}.'))
    db.commit()
    return {'status':row.status}

@router.put('/{conversation_id}/members/{target_id}/role')
def set_role(conversation_id: str,target_id: str,payload: dict,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    if member_role(db,conversation_id,user.id)!='owner':raise HTTPException(403,'Moderatör atama yalnızca kurucuya açıktır.')
    role=payload.get('role')
    if role not in ('member','moderator'):raise HTTPException(422,'Geçersiz rol.')
    if target_id==user.id:raise HTTPException(403,'Kurucunun rolü değiştirilemez.')
    member_role(db,conversation_id,target_id)
    row=db.get(GroupRole,(conversation_id,target_id))
    if not row:row=GroupRole(conversation_id=conversation_id,user_id=target_id,role=role);db.add(row)
    else:row.role=role
    db.commit();return {'user_id':target_id,'role':role}

@router.delete('/{conversation_id}/members/{target_id}')
def remove_member(conversation_id: str,target_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    actor=member_role(db,conversation_id,user.id)
    target_role=member_role(db,conversation_id,target_id)
    if target_role=='owner':raise HTTPException(403,'Kurucu çıkarılamaz.')
    if target_id!=user.id and not (actor=='owner' or (actor=='moderator' and target_role=='member')):
        raise HTTPException(403,'Bu üyeyi çıkarma yetkiniz yok.')
    row=db.scalar(select(ConversationMember).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==target_id))
    if row:db.delete(row)
    role=db.get(GroupRole,(conversation_id,target_id))
    if role:db.delete(role)
    db.commit();return {'removed':True}
