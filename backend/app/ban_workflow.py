"""Server-authorized UA requests, FA/DA review, restrictions and reversible bans."""
import base64
import hashlib
import json
import math
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .admin_models import AdminRole, BanApproval, UserBan, AdminAuditLog, FaActionLog
from .platform_models import Notification
from .support_models import SupportAgent
from .room_models import RoomMember, RoomSeat
from .ban_workflow_models import BanWorkflow, BanReviewSession, BanPresence, BanEvent, UserBrowserDevice

router = APIRouter(prefix='/v1/admin/ban-workflow', tags=['ban-workflow'])
TZ = ZoneInfo('Europe/Istanbul')
RESTRICTION_MESSAGE = 'Ban talebi ile ilgilenmediğiniz için işlemleriniz 3 dakikalığına kısıtlanmıştır.'
def now(): return datetime.now(timezone.utc)
def utc(value): return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
def stamp(value): return utc(value).astimezone(TZ).strftime('%d.%m.%Y %H:%M:%S')
def role(db, uid):
    row = db.get(AdminRole, uid)
    return row.role if row else None

def require(db, user, roles):
    value = role(db, user.id)
    if value not in roles: raise HTTPException(403, 'Bu işlem için yönetim yetkiniz yok')
    return value

def restriction(db, uid):
    row = db.get(BanPresence, uid)
    if role(db, uid) != 'FA' or not row or not row.restricted_until: return 0
    return max(0, math.ceil((utc(row.restricted_until)-now()).total_seconds()))

def penalize(db, user):
    if role(db, user.id) != 'FA': return
    presence = db.get(BanPresence, user.id)
    if not presence: presence = BanPresence(user_id=user.id, seen_at=now()); db.add(presence)
    presence.restricted_until = now()+timedelta(seconds=180)
    for member in db.scalars(select(RoomMember).where(RoomMember.user_id==user.id)): db.delete(member)
    for seat in db.scalars(select(RoomSeat).where(RoomSeat.user_id==user.id)): seat.user_id=None

def remember_device(db, user, device_key):
    if not device_key or not re.fullmatch(r'[a-f0-9-]{36}', device_key): return
    digest = hashlib.sha256(device_key.encode()).hexdigest()
    # Check before associating an unbanned account with a blocked browser.
    owners = select(UserBrowserDevice.user_id).where(UserBrowserDevice.device_hash==digest)
    blocked = db.scalar(select(UserBan).where(UserBan.user_id.in_(owners),UserBan.ban_type=='device',UserBan.active.is_(True),
        (UserBan.expires_at.is_(None)) | (UserBan.expires_at>now())))
    if blocked: raise HTTPException(403, 'Bu tarayıcı cihaz erişimi uygulama yönetimi tarafından engellenmiştir.')
    if not db.get(UserBrowserDevice,(user.id,digest)):
        db.add(UserBrowserDevice(user_id=user.id,device_hash=digest)); db.commit()

class EvidencePayload(BaseModel):
    days: int | None = Field(default=None, ge=1, le=36500)
    reason: str = Field(min_length=3, max_length=2000)
    evidence: list[str] = Field(default_factory=list, max_length=3)
    @field_validator('reason')
    @classmethod
    def reason_valid(cls, value):
        if len(value.strip())<3: raise ValueError('İşlem nedeni zorunludur')
        return value.strip()
    @field_validator('evidence')
    @classmethod
    def evidence_valid(cls, values):
        videos=0
        for value in values:
            if len(value)>11_000_000: raise ValueError('Kanıt dosyası çok büyük')
            match=re.fullmatch(r'data:(image/(?:png|jpeg|webp)|video/(?:mp4|webm));base64,([A-Za-z0-9+/]+={0,2})',value)
            if not match: raise ValueError('Kanıt PNG, JPEG, WebP, MP4 veya WebM olmalı')
            try: raw=base64.b64decode(match[2],validate=True)
            except ValueError: raise ValueError('Geçersiz kanıt')
            mime=match[1]
            valid = (mime=='image/png' and raw.startswith(b'\x89PNG\r\n\x1a\n')) or (mime=='image/jpeg' and raw.startswith(b'\xff\xd8\xff')) or (mime=='image/webp' and raw.startswith(b'RIFF') and raw[8:12]==b'WEBP') or (mime=='video/mp4' and raw[4:8]==b'ftyp') or (mime=='video/webm' and raw.startswith(b'\x1aE\xdf\xa3'))
            if not valid: raise ValueError('Kanıt içeriği dosya türüyle eşleşmiyor')
            video=mime.startswith('video/'); videos+=int(video)
            if len(raw)>(8_000_000 if video else 1_500_000): raise ValueError('Fotoğraf en fazla 1,5 MB, video en fazla 8 MB olabilir')
        if videos and (videos!=1 or len(values)!=1): raise ValueError('En fazla 3 fotoğraf veya 1 video ekleyin')
        return values

class Decision(BaseModel):
    action: str = Field(pattern='^(approve|reject)$')
class PresencePayload(BaseModel):
    active: bool = True

def add_event(db, row, recipient, kind, message):
    note=Notification(user_id=recipient,kind='ban_'+kind,title='ErisChat Yönetim',body=message)
    db.add(note); db.flush(); db.add(BanEvent(approval_id=row.id,recipient_id=recipient,notification_id=note.id,kind=kind,message=message))

def audit(db,user,row,action,**details):
    db.add(AdminAuditLog(admin_id=user.id,action=action,target_user_id=row.target_user_id,details=json.dumps({'request_id':row.id,**details},ensure_ascii=False)))
    if role(db,user.id)=='FA':db.add(FaActionLog(admin_id=user.id,action=action,target_user_id=row.target_user_id,details=json.dumps({'request_id':row.id,**details},ensure_ascii=False)))

def route_request(db,row,flow):
    if row.status!='pending':return
    cutoff=now()-timedelta(seconds=45); skipped=set(json.loads(flow.skipped_json))
    candidates=[]
    for user in db.scalars(select(User).join(AdminRole,AdminRole.user_id==User.id).where(AdminRole.role.in_(['FA','DA']),User.is_active.is_(True)).order_by(User.id)):
        if user.id in skipped or user.id in {row.requester_id,row.target_user_id} or restriction(db,user.id):continue
        p=db.get(BanPresence,user.id); s=db.get(SupportAgent,user.id)
        if s and s.restricted_until and utc(s.restricted_until)>now():continue
        if (p and utc(p.seen_at)>cutoff) or (s and utc(s.seen_at)>cutoff):candidates.append(user)
    # Keep a live assignment, except DA offers move to a newly active FA before review.
    session=db.get(BanReviewSession,flow.assigned_id) if flow.assigned_id else None
    live=next((u for u in candidates if u.id==flow.assigned_id),None)
    if live and ((session and session.pending_id==row.id) or role(db,live.id)=='FA'):return
    chosen=next((u for u in candidates if role(db,u.id)=='FA'),None) or next(iter(candidates),None)
    flow.assigned_id=chosen.id if chosen else None

def serialize(db,row,flow,details=False,include_evidence=True):
    requester=db.get(User,row.requester_id); target=db.get(User,row.target_user_id)
    result={'id':row.id,'number':f'#{row.id:04d}','status':row.status,'kind':row.kind,'days':row.days,
        'requester_id':row.requester_id,'requester_name':requester.nickname if requester else 'Yönetici',
        'requester_public_id':requester.public_id if requester else '', 'requester_role':flow.requester_role,
        'target_id':target.public_id if target else '', 'target_name':target.nickname if target else 'Kullanıcı',
        'created_at':row.created_at,'assigned_id':flow.assigned_id,'decision_by':row.decision_by,
        'reviewer_role':flow.reviewer_role,'decided_at':flow.decided_at,'undone_at':flow.undone_at,'thanked':flow.thanked_at is not None,'workflow':True}
    if details:
        evidence=json.loads(flow.evidence_json)
        result.update(reason=row.reason,evidence=evidence if include_evidence else [],evidence_count=len(evidence),log_text=flow.log_text)
    return result

def build_log(db,row,flow):
    requester=db.get(User,row.requester_id); approver=db.get(User,row.decision_by)
    return '\n'.join(['='*50,'[ERISCHAT BAN TALEBİ VE ONAY LOGU]','='*50,
        f'BAN TALEBİ OLUŞTURAN : [{flow.requester_role} - {requester.nickname} - {requester.public_id}]',
        f'BAN TALEBİNİ KABUL EDEN : [{flow.reviewer_role} - {approver.nickname} - {approver.public_id}]',
        'TALEP ZAMANI : '+stamp(row.created_at),'ONAY ZAMANI : '+stamp(flow.decided_at),
        'BAN TALEP EDİLEN ID : '+db.get(User,row.target_user_id).public_id,
        'BAN CİNSİ : '+('Cihaz Banı' if row.kind=='device' else 'Hesap Banı'),
        'SÜRE : '+('Süresiz' if row.days is None else str(row.days)+' Gün'),'İŞLEM NEDENİ : '+row.reason,
        'KANIT : '+', '.join(f'/v1/admin/ban-workflow/requests/{row.id}/evidence/{i}' for i in range(len(json.loads(flow.evidence_json))))])

def apply_ban(db,row,flow,user):
    ban=UserBan(user_id=row.target_user_id,ban_type=row.kind,expires_at=None if row.days is None else now()+timedelta(days=row.days),banned_by=user.id,reason=row.reason)
    db.add(ban); db.flush(); flow.ban_id=ban.id; row.status='approved'; row.decision_by=user.id
    flow.reviewer_role=role(db,user.id); flow.decided_at=now(); flow.log_text=build_log(db,row,flow)
    for member in db.scalars(select(RoomMember).where(RoomMember.user_id==row.target_user_id)):db.delete(member)
    for seat in db.scalars(select(RoomSeat).where(RoomSeat.user_id==row.target_user_id)):seat.user_id=None
    audit(db,user,row,'ban_workflow_approved',log=flow.log_text)
    if row.requester_id!=user.id:add_event(db,row,row.requester_id,'approved',f'Ban talebiniz {stamp(flow.decided_at)} tarihinde müşteri danışmanlarımız tarafından onaylanmış ve ban işleminiz gerçekleşmiştir.')

def submit(db,user,target,payload,kind):
    rank=require(db,user,{'UA','DA'})
    if 'days' not in payload.model_fields_set:raise HTTPException(422,'Ban süresini seçin; süresiz için null gönderin')
    if target.id==user.id:raise HTTPException(403,'Kendi hesabınıza ban uygulayamazsınız')
    levels={'SA':1,'UA':2,'FA':3,'DA':4}
    if rank=='UA' and levels.get(role(db,target.id),0)>=2:raise HTTPException(403,'Eşit veya üst yöneticiye ban talebi açılamaz')
    row=BanApproval(requester_id=user.id,target_user_id=target.id,kind=kind,days=payload.days,reason=payload.reason)
    db.add(row);db.flush();db.refresh(row)
    flow=BanWorkflow(approval_id=row.id,requester_role=rank,evidence_json=json.dumps(payload.evidence),skipped_json='[]',log_text='')
    db.add(flow);db.flush()
    if rank=='DA':apply_ban(db,row,flow,user)
    else:route_request(db,row,flow);audit(db,user,row,'ban_workflow_requested',kind=kind)
    db.commit()
    return {**serialize(db,row,flow),'pending':rank=='UA','banned':rank=='DA','message':f'Sevgili müşteri temsilcimiz {user.nickname}, ban talebiniz alınmıştır. Üst yetkililere aktarılmıştır. İlginiz için teşekkür ederiz. İyi çalışmalar.' if rank=='UA' else 'Ban işlemi gerçekleşti.'}

def load(db,rid):
    row=db.scalar(select(BanApproval).where(BanApproval.id==rid).with_for_update());flow=db.get(BanWorkflow,rid)
    if not row or not flow:raise HTTPException(404,'Ban talebi bulunamadı')
    return row,flow

def reviewer(db,uid):
    s=db.scalar(select(BanReviewSession).where(BanReviewSession.user_id==uid).with_for_update())
    if not s:s=BanReviewSession(user_id=uid);db.add(s);db.flush()
    return s

def can_review(db,user,row,flow):
    rank=require(db,user,{'FA','DA'})
    if rank=='FA' and (flow.assigned_id!=user.id or restriction(db,user.id)):raise HTTPException(403,'Bu talep size atanmamış veya işlemleriniz kısıtlı')
    if user.id in {row.requester_id,row.target_user_id}:raise HTTPException(403,'Kendi talebinizi inceleyemezsiniz')
    return rank

def decide(db,user,rid,action):
    row,flow=load(db,rid);can_review(db,user,row,flow)
    if row.status!='pending':raise HTTPException(409,'Talep artık beklemede değil')
    s=reviewer(db,user.id)
    if s.pending_id!=rid:raise HTTPException(409,'Önce talep detayını inceleyin')
    if action=='approve':apply_ban(db,row,flow,user)
    else:
        row.status='rejected';row.decision_by=user.id;flow.reviewer_role=role(db,user.id);flow.decided_at=now();penalize(db,user)
        audit(db,user,row,'ban_workflow_rejected');add_event(db,row,row.requester_id,'rejected','Ban talebiniz yönetim tarafından reddedildi.')
    for session in db.scalars(select(BanReviewSession).where(BanReviewSession.pending_id==rid)):session.pending_id=None
    db.commit();return {**serialize(db,row,flow),'restriction_seconds':restriction(db,user.id)}

def undo(db,user,row,flow):
    rank=require(db,user,{'DA'}) # DA is the only rank above both FA and DA reviewers.
    if row.status!='approved' or not flow.ban_id:raise HTTPException(409,'Onaylanmış ban bulunamadı')
    if not flow.undone_at:
        ban=db.get(UserBan,flow.ban_id);ban.active=False;flow.undone_at=now();flow.undone_by=user.id
        flow.log_text+='\n'+'-'*50+'\n[ALT YETKİ / DA YÖNETİM İŞLEMLERİ]\nİŞLEMİ GERİ ALAN : '+user.nickname+' - '+user.public_id+'\nGERİ ALMA ZAMANI : '+stamp(flow.undone_at)
        for ev in db.scalars(select(BanEvent).where(BanEvent.approval_id==row.id,BanEvent.kind=='approved')):
            ev.seen_at=now();db.get(Notification,ev.notification_id).read=True
        add_event(db,row,row.decision_by,'undone','Ban talebi onayınız gözden geçirilmiş ve haksız ban olduğuna karar verilmiştir. Lütfen bir daha ki sefer daha dikkatli olunuz.')
        approver=db.get(User,row.decision_by)
        add_event(db,row,user.id,'undo_receipt',f'{approver.nickname} tarafından onaylanan ban talebi geri alınıp kullanıcı banı kaldırılmıştır.')
        audit(db,user,row,'ban_workflow_undone',log=flow.log_text)
    return flow

def register_auth(current_user_dependency, disconnect=None):
    @router.post('/presence')
    def presence(payload:PresencePayload,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require(db,user,{'UA','FA','DA'})
        row=db.get(BanPresence,user.id)
        if not row:row=BanPresence(user_id=user.id,seen_at=now());db.add(row)
        row.seen_at=now() if payload.active else now()-timedelta(days=1)
        db.commit();return {'restriction_seconds':restriction(db,user.id)}

    @router.get('/inbox')
    def inbox(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require(db,user,{'UA','FA','DA'})
        rows=[]
        for row in db.scalars(select(BanApproval).join(BanWorkflow).where(BanApproval.status=='pending').order_by(BanApproval.id)):
            flow=db.get(BanWorkflow,row.id);route_request(db,row,flow)
            if flow.assigned_id==user.id:rows.append(serialize(db,row,flow))
        s=db.get(BanReviewSession,user.id)
        if s and s.pending_id and role(db,user.id) not in {'FA','DA'}:s.pending_id=None
        db.commit()
        return {'items':rows,'pending_id':s.pending_id if s else None,'restriction_seconds':restriction(db,user.id)}

    @router.get('/requests')
    def listing(before:int|None=Query(None,ge=1),db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        rank=require(db,user,{'UA','FA','DA'})
        q=select(BanApproval).join(BanWorkflow).order_by(BanApproval.id.desc()).limit(50)
        if before:q=q.where(BanApproval.id<before)
        if rank=='UA':q=q.where(BanApproval.requester_id==user.id)
        if rank=='FA':q=q.where((BanWorkflow.assigned_id==user.id)|(BanApproval.decision_by==user.id))
        rows=list(db.scalars(q));return {'items':[serialize(db,r,db.get(BanWorkflow,r.id)) for r in rows],'next_before':rows[-1].id if len(rows)==50 else None}

    @router.get('/requests/{rid}')
    def detail(rid:int,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        row,flow=load(db,rid);can_review(db,user,row,flow)
        if row.status!='pending':raise HTTPException(409,'Talep artık beklemede değil')
        s=reviewer(db,user.id)
        if s.pending_id and s.pending_id!=rid:raise HTTPException(409,'Önce açık talebi sonuçlandırın')
        s.pending_id=rid;db.commit();return serialize(db,row,flow,True)

    @router.post('/requests/{rid}/decision')
    async def decision(rid:int,payload:Decision,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        result=decide(db,user,rid,payload.action)
        if disconnect and (payload.action=='approve' or result['restriction_seconds']):
            await disconnect(user.id if result['restriction_seconds'] else db.get(BanApproval,rid).target_user_id)
        return result

    @router.post('/requests/{rid}/dismiss')
    async def dismiss(rid:int,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        row,flow=load(db,rid);can_review(db,user,row,flow)
        if row.status!='pending':raise HTTPException(409,'Talep artık beklemede değil')
        s=reviewer(db,user.id)
        if s.pending_id:raise HTTPException(409,'İncelemeye başladıktan sonra karar verin')
        skipped=set(json.loads(flow.skipped_json));skipped.add(user.id);flow.skipped_json=json.dumps(sorted(skipped));flow.assigned_id=None
        penalize(db,user);route_request(db,row,flow);audit(db,user,row,'ban_workflow_dismissed');db.commit()
        seconds=restriction(db,user.id)
        if disconnect and seconds:await disconnect(user.id)
        return {'dismissed':True,'restriction_seconds':seconds}

    @router.post('/requests/{rid}/thank')
    def thank(rid:int,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        row,flow=load(db,rid)
        if row.requester_id!=user.id:raise HTTPException(404,'Talep bulunamadı')
        if row.status!='approved' or flow.undone_at:raise HTTPException(409,'Bu talep için teşekkür gönderilemez')
        if not flow.thanked_at:
            flow.thanked_at=now();add_event(db,row,row.decision_by,'thanks',f'{user.nickname} admin size teşekkürlerini iletti. Keyifli çalışmalar.')
        for ev in db.scalars(select(BanEvent).where(BanEvent.approval_id==rid,BanEvent.recipient_id==user.id,BanEvent.kind=='approved')):
            ev.seen_at=now();db.get(Notification,ev.notification_id).read=True
        db.commit();return {'thanked':True}

    @router.get('/events')
    def events(db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        require(db,user,{'UA','FA','DA'})
        return [{'id':e.id,'request_id':e.approval_id,'kind':e.kind,'message':e.message} for e in db.scalars(select(BanEvent).where(BanEvent.recipient_id==user.id,BanEvent.seen_at.is_(None)).order_by(BanEvent.id).limit(30))]

    @router.post('/events/{eid}/seen')
    def seen(eid:int,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        ev=db.get(BanEvent,eid)
        if not ev or ev.recipient_id!=user.id:raise HTTPException(404,'Bildirim bulunamadı')
        ev.seen_at=now();db.get(Notification,ev.notification_id).read=True;db.commit();return {'seen':True}

    @router.get('/logs')
    def logs(before:int|None=Query(None,ge=1),db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        rank=require(db,user,{'FA','DA'})
        q=select(BanApproval).join(BanWorkflow).where(BanApproval.status=='approved').order_by(BanApproval.id.desc()).limit(30)
        if before:q=q.where(BanApproval.id<before)
        if rank=='FA':q=q.where(BanApproval.decision_by==user.id)
        rows=list(db.scalars(q));return {'items':[serialize(db,r,db.get(BanWorkflow,r.id),True,False) for r in rows],'can_undo':rank=='DA','next_before':rows[-1].id if len(rows)==30 else None}

    @router.get('/logs/{rid}')
    def log_detail(rid:int,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        row,flow=load(db,rid);rank=require(db,user,{'FA','DA'})
        if row.status!='approved' or (rank=='FA' and row.decision_by!=user.id):raise HTTPException(403,'Bu loga erişiminiz yok')
        return serialize(db,row,flow,True)

    @router.post('/requests/{rid}/undo')
    def undo_route(rid:int,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        row,flow=load(db,rid);undo(db,user,row,flow);db.commit();return {'undone':True}

    @router.get('/requests/{rid}/evidence/{index}')
    def evidence(rid:int,index:int,db:Session=Depends(get_db),user:User=Depends(current_user_dependency)):
        from fastapi.responses import Response
        row,flow=load(db,rid);rank=require(db,user,{'UA','FA','DA'})
        if rank!='DA' and user.id not in {row.requester_id,flow.assigned_id,row.decision_by}:raise HTTPException(403,'Kanıt erişimi yok')
        values=json.loads(flow.evidence_json)
        if index<0 or index>=len(values):raise HTTPException(404,'Kanıt bulunamadı')
        header,data=values[index].split(',',1)
        return Response(base64.b64decode(data),media_type=header[5:].split(';')[0],headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
    return router
