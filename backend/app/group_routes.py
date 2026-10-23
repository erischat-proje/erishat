"""Authenticated paid group creation and metadata APIs."""
from io import BytesIO
from uuid import uuid4
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, UploadFile, File, Form
from PIL import Image
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from .models import User, Conversation, ConversationMember
from .group_models import MessageGroup, GroupRole, GroupInvitation, GroupSettings, GroupControl, GroupAudit
from .group_policy import locked_group, settings, role as policy_role, audit, aware
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field, ConfigDict
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
    payer=db.scalar(select(User).where(User.id==user.id).with_for_update().execution_options(populate_existing=True))
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
    return [{'conversation_id':r.conversation_id,'name':g.name,'invited_by':r.invited_by,'has_image':bool(g.image),'image_url':'/message-groups/'+r.conversation_id+'/image' if g.image else None} for r in rows if (g:=db.get(MessageGroup,r.conversation_id)) and not settings(db,r.conversation_id).closed]

@router.get('/{conversation_id}')
def get_group(conversation_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    group=db.get(MessageGroup,conversation_id)
    if not group:raise HTTPException(404,'Grup bulunamadı.')
    member=db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==user.id))
    if not member:raise HTTPException(403,'Bu gruba erişiminiz yok.')
    return {**info(group), **settings_info(db, group), "my_role":member_role(db,conversation_id,user.id)}

@router.get('/{conversation_id}/image')
def group_image(conversation_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    group=db.get(MessageGroup,conversation_id)
    if not group or not group.image:raise HTTPException(404,'Grup fotoğrafı yok.')
    if not db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==user.id)) and not db.scalar(select(GroupInvitation.invitee_id).where(GroupInvitation.conversation_id==conversation_id,GroupInvitation.invitee_id==user.id,GroupInvitation.status=='pending')):
        raise HTTPException(403,'Bu grup fotoğrafına erişiminiz yok.')
    return Response(content=group.image,media_type=group.image_mime or 'image/jpeg',headers={'Cache-Control':'private, max-age=300'})


def member_role(db, cid, uid):
    return policy_role(db,cid,uid)

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
        if target:result.append({'user_id':uid,'nickname':target.nickname,'role':member_role(db,conversation_id,uid),'public_id':target.public_id,'muted_until':(db.get(GroupControl,(conversation_id,uid)).muted_until if db.get(GroupControl,(conversation_id,uid)) else None)})
    return result

@router.post('/{conversation_id}/invitations',status_code=201)
def invite(conversation_id: str,payload: dict,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    locked_group(db,conversation_id)
    actor=member_role(db,conversation_id,user.id)
    if actor=='member' and not settings(db,conversation_id).members_can_invite:raise HTTPException(403,'Üye daveti yöneticilere açık.')
    uid=str(payload.get('user_id') or '').strip()
    target=db.get(User,uid) or db.scalar(select(User).where(User.public_id==uid))
    if target:uid=target.id
    control=db.get(GroupControl,(conversation_id,uid))
    if control and control.banned:raise HTTPException(403,'Kullanıcı bu gruptan yasaklanmış.')
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
    audit(db,conversation_id,user.id,'invite',uid)
    db.commit()
    return {'invited':True,'already_pending':False}

@router.post('/{conversation_id}/invitations/respond')
def respond(conversation_id: str,payload: dict,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    action=payload.get('action')
    if action not in ('accept','reject'):raise HTTPException(422,'Geçersiz yanıt.')
    locked_group(db,conversation_id)
    row=db.get(GroupInvitation,(conversation_id,user.id))
    if not row or row.status!='pending':raise HTTPException(404,'Bekleyen davet bulunamadı.')
    if action=='accept':
        control=db.get(GroupControl,(conversation_id,user.id))
        if control and control.banned:raise HTTPException(403,'Bu gruptan yasaklandınız.')
        inviter=db.get(User,row.invited_by)
        if not inviter or not inviter.is_active:raise HTTPException(409,'Davet artık geçerli değil.')
        member_role(db,conversation_id,inviter.id)
        if db.scalar(select(UserBlock.id).where(or_(and_(UserBlock.blocker_id==user.id,UserBlock.blocked_id==inviter.id),and_(UserBlock.blocker_id==inviter.id,UserBlock.blocked_id==user.id)))):raise HTTPException(403,'Bu davet kabul edilemez.')
        require_feature(db,user.id,[inviter.id])
        count=db.scalar(select(func.count(ConversationMember.id)).where(ConversationMember.conversation_id==conversation_id))
        if count>=50:raise HTTPException(409,'Grup dolu.')
        if not db.scalar(select(ConversationMember.id).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==user.id)):
            db.add(ConversationMember(conversation_id=conversation_id,user_id=user.id))
        old_role=db.get(GroupRole,(conversation_id,user.id))
        if old_role:old_role.role='member'
        else:db.add(GroupRole(conversation_id=conversation_id,user_id=user.id,role='member'))
    row.status='accepted' if action=='accept' else 'rejected'
    audit(db,conversation_id,user.id,'join' if action=='accept' else 'reject_invite')
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
    locked_group(db,conversation_id)
    if member_role(db,conversation_id,user.id)!='owner':raise HTTPException(403,'Moderatör atama yalnızca kurucuya açıktır.')
    role=payload.get('role')
    if role not in ('member','moderator'):raise HTTPException(422,'Geçersiz rol.')
    if target_id==user.id:raise HTTPException(403,'Kurucunun rolü değiştirilemez.')
    member_role(db,conversation_id,target_id)
    row=db.get(GroupRole,(conversation_id,target_id))
    if not row:row=GroupRole(conversation_id=conversation_id,user_id=target_id,role=role);db.add(row)
    else:row.role=role
    audit(db,conversation_id,user.id,'role_'+role,target_id)
    db.commit();return {'user_id':target_id,'role':role}

@router.delete('/{conversation_id}/members/{target_id}')
def remove_member(conversation_id: str,target_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    locked_group(db,conversation_id,active=False)
    actor=member_role(db,conversation_id,user.id)
    target_role=member_role(db,conversation_id,target_id)
    if target_role=='owner':raise HTTPException(403,'Kurucu çıkarılamaz.')
    if target_id!=user.id and not (actor=='owner' or (actor=='moderator' and target_role=='member')):
        raise HTTPException(403,'Bu üyeyi çıkarma yetkiniz yok.')
    row=db.scalar(select(ConversationMember).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==target_id))
    if row:db.delete(row)
    role=db.get(GroupRole,(conversation_id,target_id))
    if role:db.delete(role)
    for invitation in db.scalars(select(GroupInvitation).where(GroupInvitation.conversation_id==conversation_id,GroupInvitation.status=='pending',or_(GroupInvitation.invited_by==target_id,GroupInvitation.invitee_id==target_id))):invitation.status='revoked'
    audit(db,conversation_id,user.id,'leave' if target_id==user.id else 'remove',target_id)
    db.commit();return {'removed':True}


def settings_info(db, group):
    config=settings(db,group.conversation_id)
    return {key:getattr(config,key) for key in ('closed','admins_only','members_can_invite','admins_edit_info','slow_seconds')}

class GroupUpdate(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    name: str | None = Field(default=None,min_length=2,max_length=64)
    description: str | None = Field(default=None,max_length=500)
    admins_only: bool | None = None
    members_can_invite: bool | None = None
    admins_edit_info: bool | None = None
    slow_seconds: int | None = Field(default=None,ge=0,le=3600)

@router.patch('/{conversation_id}')
def update_group(conversation_id: str,payload: GroupUpdate,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    group=locked_group(db,conversation_id)
    actor=manage_role(db,conversation_id,user.id)
    changes=payload.model_dump(exclude_unset=True)
    if not changes or any(value is None for value in changes.values()):raise HTTPException(422,'Geçerli ayarları belirtin.')
    config=settings(db,conversation_id)
    if actor!='owner' and (not config.admins_edit_info or any(key not in ('name','description') for key in changes)):
        raise HTTPException(403,'Bu ayar yalnızca kurucuya açık.')
    for key,value in changes.items():
        if key in ('name','description'):
            value=value.strip()
            if key=='name' and len(value)<2:raise HTTPException(422,'Grup adı en az 2 karakter olmalı.')
            setattr(group,key,value)
        else:setattr(config,key,value)
    db.add(config)
    audit(db,conversation_id,user.id,'settings')
    db.commit()
    return {**info(group),**settings_info(db,group)}

@router.put('/{conversation_id}/image')
async def update_image(conversation_id: str,image: UploadFile=File(...),db: Session=Depends(get_db),user: User=Depends(authenticated)):
    # Decode before taking the database lock; recheck permissions after upload.
    data=await image.read(GROUP_IMAGE_MAX_BYTES+1)
    if len(data)>GROUP_IMAGE_MAX_BYTES:raise HTTPException(413,'Fotoğraf en fazla 20 MB olabilir.')
    try:
        with Image.open(BytesIO(data)) as im:im.verify()
        with Image.open(BytesIO(data)) as im:
            im=im.convert('RGB');im.thumbnail((512,512));out=BytesIO();im.save(out,'JPEG',quality=82)
    except Exception:raise HTTPException(415,'Geçerli bir fotoğraf seçin.')
    group=locked_group(db,conversation_id)
    actor=manage_role(db,conversation_id,user.id)
    if actor!='owner' and not settings(db,conversation_id).admins_edit_info:raise HTTPException(403,'Grup bilgilerini kurucu düzenler.')
    group.image=out.getvalue();group.image_mime='image/jpeg'
    audit(db,conversation_id,user.id,'image')
    db.commit();return info(group)

@router.delete('/{conversation_id}/image')
def remove_image(conversation_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    group=locked_group(db,conversation_id)
    actor=manage_role(db,conversation_id,user.id)
    if actor!='owner' and not settings(db,conversation_id).admins_edit_info:raise HTTPException(403,'Grup bilgilerini kurucu düzenler.')
    group.image=None;group.image_mime=None
    audit(db,conversation_id,user.id,'remove_image');db.commit();return info(group)

class Transfer(BaseModel):
    user_id: str = Field(min_length=1,max_length=64)

@router.post('/{conversation_id}/transfer')
def transfer_owner(conversation_id: str,payload: Transfer,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    group=locked_group(db,conversation_id)
    if member_role(db,conversation_id,user.id)!='owner':raise HTTPException(403,'Sahipliği yalnızca kurucu devredebilir.')
    target_id=payload.user_id
    if target_id==user.id:raise HTTPException(422,'Başka bir üye seçin.')
    member_role(db,conversation_id,target_id)
    target=db.get(User,target_id)
    if not target or not target.is_active:raise HTTPException(409,'Etkin bir üye seçin.')
    group.owner_id=target_id
    for uid,new_role in ((user.id,'moderator'),(target_id,'owner')):
        row=db.get(GroupRole,(conversation_id,uid))
        if not row:db.add(GroupRole(conversation_id=conversation_id,user_id=uid,role=new_role))
        else:row.role=new_role
    audit(db,conversation_id,user.id,'transfer',target_id);db.commit()
    return {'owner_id':target_id}

@router.post('/{conversation_id}/close')
def close_group(conversation_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    locked_group(db,conversation_id,active=False)
    if member_role(db,conversation_id,user.id)!='owner':raise HTTPException(403,'Grubu yalnızca kurucu kapatabilir.')
    config=settings(db,conversation_id)
    if not config.closed:
        config.closed=True;db.add(config)
        for row in db.scalars(select(GroupInvitation).where(GroupInvitation.conversation_id==conversation_id,GroupInvitation.status=='pending')):row.status='revoked'
        audit(db,conversation_id,user.id,'close')
    db.commit();return {'closed':True}

@router.get('/{conversation_id}/invitations')
def pending_invites(conversation_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    manage_role(db,conversation_id,user.id)
    rows=db.scalars(select(GroupInvitation).where(GroupInvitation.conversation_id==conversation_id,GroupInvitation.status=='pending'))
    return [{'user_id':r.invitee_id,'nickname':u.nickname if (u:=db.get(User,r.invitee_id)) else 'Kullanıcı','invited_by':r.invited_by} for r in rows]

@router.delete('/{conversation_id}/invitations/{target_id}')
def revoke_invite(conversation_id: str,target_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    locked_group(db,conversation_id)
    manage_role(db,conversation_id,user.id)
    row=db.get(GroupInvitation,(conversation_id,target_id))
    if not row or row.status!='pending':raise HTTPException(404,'Bekleyen davet yok.')
    row.status='revoked';audit(db,conversation_id,user.id,'revoke_invite',target_id);db.commit()
    return {'revoked':True}

class MemberControl(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    action: str
    minutes: int = Field(default=60,ge=1,le=10080)

@router.post('/{conversation_id}/members/{target_id}/control')
def control_member(conversation_id: str,target_id: str,payload: MemberControl,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    locked_group(db,conversation_id)
    actor=manage_role(db,conversation_id,user.id)
    if payload.action not in ('mute','unmute','ban','unban'):raise HTTPException(422,'Geçersiz işlem.')
    if target_id==user.id:raise HTTPException(403,'Kendinize uygulanamaz.')
    control=db.get(GroupControl,(conversation_id,target_id))
    if payload.action=='unban':
        if not control or not control.banned:raise HTTPException(404,'Yasak kaydı bulunamadı.')
    else:
        target_role=member_role(db,conversation_id,target_id)
        if target_role=='owner' or (actor=='moderator' and target_role!='member'):raise HTTPException(403,'Bu üyeye işlem yapamazsınız.')
    if not control:
        control=GroupControl(conversation_id=conversation_id,user_id=target_id,banned=False);db.add(control)
    if payload.action in ('ban','unban'):
        control.banned=payload.action=='ban'
        control.muted_until=None
        if control.banned:
            member=db.scalar(select(ConversationMember).where(ConversationMember.conversation_id==conversation_id,ConversationMember.user_id==target_id))
            if member:db.delete(member)
            role_row=db.get(GroupRole,(conversation_id,target_id))
            if role_row:db.delete(role_row)
            for invitation in db.scalars(select(GroupInvitation).where(GroupInvitation.conversation_id==conversation_id,GroupInvitation.status=='pending',or_(GroupInvitation.invited_by==target_id,GroupInvitation.invitee_id==target_id))):invitation.status='revoked'
    else:control.muted_until=datetime.now(timezone.utc)+timedelta(minutes=payload.minutes) if payload.action=='mute' else None
    audit(db,conversation_id,user.id,payload.action,target_id);db.commit()
    return {'ok':True}

@router.get('/{conversation_id}/bans')
def banned_members(conversation_id: str,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    manage_role(db,conversation_id,user.id)
    return [{'user_id':r.user_id,'nickname':u.nickname if (u:=db.get(User,r.user_id)) else 'Kullanıcı'} for r in db.scalars(select(GroupControl).where(GroupControl.conversation_id==conversation_id,GroupControl.banned==True))]

@router.get('/{conversation_id}/audit')
def audit_log(conversation_id: str,before: int|None=None,db: Session=Depends(get_db),user: User=Depends(authenticated)):
    manage_role(db,conversation_id,user.id)
    query=select(GroupAudit).where(GroupAudit.conversation_id==conversation_id)
    if before is not None:query=query.where(GroupAudit.id<before)
    rows=list(db.scalars(query.order_by(GroupAudit.id.desc()).limit(50)))
    return [{'id':r.id,'action':r.action,'actor_id':r.actor_id,'actor_name':u.nickname if (u:=db.get(User,r.actor_id)) else 'Silinmiş kullanıcı','target_id':r.target_id,'target_name':t.nickname if r.target_id and (t:=db.get(User,r.target_id)) else None,'created_at':r.created_at} for r in rows]

@router.get('/{conversation_id}/search')
def search_messages(conversation_id: str,q: str,before: int|None=None,db: Session=Depends(get_db),user: User=Depends(authenticated),x_eris_dm_vault: str|None=Header(default=None)):
    from .dm_folders import require_unlocked
    from .models import Message
    from .platform_models import MessageHidden
    member_role(db,conversation_id,user.id)
    require_unlocked(db,user.id,conversation_id,x_eris_dm_vault)
    q=q.strip()
    if not 2<=len(q)<=100:raise HTTPException(422,'Arama metni 2-100 karakter olmalı.')
    hidden=select(MessageHidden.message_id).where(MessageHidden.user_id==user.id)
    query=select(Message).where(Message.conversation_id==conversation_id,
        Message.text.icontains(q,autoescape=True),Message.id.not_in(hidden),
        or_(Message.expires_at==None,Message.expires_at>datetime.now(timezone.utc)))
    if before is not None:query=query.where(Message.id<before)
    rows=db.scalars(query.order_by(Message.id.desc()).limit(50))
    return [{'id':m.id,'text':m.text,'created_at':m.created_at,'sender_nickname':u.nickname if (u:=db.get(User,m.sender_id)) else 'Silinmiş kullanıcı'} for m in rows]
