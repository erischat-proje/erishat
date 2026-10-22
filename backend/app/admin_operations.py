"""Working desks for the existing upper management buttons; no alternate wallet/ban engine."""
import json
from datetime import datetime,timezone,timedelta
from fastapi import APIRouter,Depends,HTTPException,Query,Response
from pydantic import Field
from sqlalchemy import select,func,or_,and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .admin_models import AdminRole,SupportAssignment,SupportMessage,BanApproval,BanAppeal,SystemAnnouncement
from .support_models import SupportTicket,SupportFlow
from .referral_models import ReferralCode,ReferralRedemption
from .suggestion_models import UserSuggestion,SuggestionReviewSession
from .payment_assistance_models import PaymentRequest
from .ban_workflow_models import BanWorkflow
from .case_models import ManagementCase
from .case_routes import TextModel,access,add_event,require_case,CATEGORIES
from .management_events import audit,notify,reviewers
from .admin_operations_models import OperationHistory,OperationCaseLink,FeedbackWork,AnnouncementDraft
def no_store(response:Response):
    response.headers['Cache-Control']='no-store';response.headers['Vary']='Authorization'
router=APIRouter(prefix='/v1/admin/operations-desk',tags=['management-operations-desk'],dependencies=[Depends(no_store)])
STAGES={'triage','planned','in_progress','completed','declined'}

def now():return datetime.now(timezone.utc)
def stamp(v):return v.isoformat() if v else None
def event(db,user,kind,sid,action,note,key=None):
    row=OperationHistory(kind=kind,source_id=str(sid),actor_id=user.id,action=action,note=note,request_key=key);db.add(row)
    audit(db,user,'desk_'+action,{'kind':kind,'source_id':str(sid),'note':note})
    return row

def acknowledged(db,user,sid):
    return bool(db.scalar(select(OperationHistory.id).where(OperationHistory.kind=='feedback',OperationHistory.source_id==str(sid),OperationHistory.actor_id==user.id,OperationHistory.action=='feedback_ack').limit(1)))

def support_scope(user):
    return or_(and_(SupportAssignment.admin_id==user.id,SupportAssignment.decision=='accepted'),and_(SupportFlow.phase=='pending',SupportFlow.offered_to==user.id,SupportFlow.offer_until>now()))

def source(db,user,kind,sid,lock=False):
    role=access(db,user,1);target=None
    if kind!='payment':
        if not sid.isascii() or not sid.isdigit() or len(sid)>12:raise HTTPException(422,'Kaynak numarası geçersiz')
        sid=int(sid)
    elif len(sid)>64:raise HTTPException(422,'Kaynak kimliği geçersiz')
    def load(model,key):
        q=select(model).where(model.id==key)
        if lock:q=q.with_for_update().execution_options(populate_existing=True)
        row=db.scalar(q)
        if not row:raise HTTPException(404,'Kaynak kayıt bulunamadı')
        return row
    if kind=='support':
        q=select(SupportTicket).join(SupportFlow).outerjoin(SupportAssignment).where(SupportTicket.id==sid,support_scope(user))
        if lock:q=q.with_for_update(of=SupportTicket).execution_options(populate_existing=True)
        row=db.scalar(q)
        if not row:raise HTTPException(403,'Bu destek görüşmesi size atanmadı')
        target=row.user_id if role in {'FA','DA'} else None
    elif kind=='payment':
        access(db,user,4);row=load(PaymentRequest,sid);target=row.user_id
        if row.status in {'connecting','chat','rejecting','finishing'} and row.assigned_to not in {user.id,None}:raise HTTPException(403,'Bu aktif ödeme görüşmesi size atanmamış')
    elif kind=='feedback':
        access(db,user,4);row=load(UserSuggestion,sid);target=row.user_id
        if not acknowledged(db,user,sid):raise HTTPException(409,'Önce öneriyi açıp Okudum Anladım adımını tamamlayın')
    elif kind in {'ban','appeal'}:
        access(db,user,2);row=load(BanApproval if kind=='ban' else BanAppeal,sid)
        ban=row if kind=='ban' else db.get(BanApproval,row.approval_id)
        if not ban:raise HTTPException(404,'Yaptırım kaydı bulunamadı')
        flow=db.get(BanWorkflow,ban.id)
        if role=='UA' and ban.requester_id!=user.id:raise HTTPException(403,'Talep size ait değil')
        if kind=='ban' and role=='FA' and flow and user.id not in {flow.assigned_id,ban.decision_by}:raise HTTPException(403,'Talep size atanmadı')
        target=ban.target_user_id
    elif kind=='referral':access(db,user,4);row=load(ReferralCode,sid)
    else:raise HTTPException(422,'Geçersiz kaynak türü')
    return row,target

class Key(TextModel):
    request_key:str=Field(min_length=16,max_length=64,pattern='^[A-Za-z0-9_-]+$')
class Note(Key):note:str=Field(min_length=20,max_length=2000)
class ReferralCreate(Key):
    kind:str=Field(pattern='^(USER|TANIDIK)$')
    max_uses:int=Field(strict=True,ge=1,le=100000)
class SourceCase(TextModel):
    category:str
    summary:str=Field(min_length=20,max_length=3000)
class FeedbackDecision(TextModel):
    status:str
    assignee_id:str|None=None
    revision:int=Field(ge=0)
    note:str=Field(min_length=20,max_length=2000)
class DraftCreate(Key):message:str=Field(min_length=3,max_length=4000)
class DraftEdit(TextModel):
    message:str=Field(min_length=3,max_length=4000)
    revision:int=Field(ge=1)
class Version(TextModel):revision:int=Field(ge=1)

def draft_view(db,row):
    author=db.get(User,row.author_id)
    return {'id':row.id,'message':row.message,'revision':row.revision,'status':row.status,'announcement_id':row.announcement_id,'author_public_id':author.public_id if author else None,'created_at':stamp(row.created_at),'updated_at':stamp(row.updated_at)}
def draft(db,user,did):
    access(db,user,3)
    row=db.scalar(select(AnnouncementDraft).where(AnnouncementDraft.id==did).with_for_update().execution_options(populate_existing=True))
    if not row or row.author_id!=user.id:raise HTTPException(404,'Taslak bulunamadı')
    return row

def register_auth(current_user):
    @router.get('/targets/{identifier}')
    def target(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        rank=access(db,user,2)
        if rank not in {'UA','DA'}:raise HTTPException(403,'Talep oluşturma yetkisi gerekli')
        p=db.get(User,identifier) or db.scalar(select(User).where(User.public_id==identifier))
        if not p:raise HTTPException(404,'Hedef bulunamadı')
        staff=db.get(AdminRole,p.id) is not None
        return {'public_id':p.public_id,'nickname':p.nickname,'is_active':p.is_active,'can_submit':p.id!=user.id and not staff,'reason':'Personel hesabı için ayrı disiplin süreci gerekir.' if staff else 'Kendi hesabınıza yaptırım uygulayamazsınız.' if p.id==user.id else ''}

    @router.get('/rooms/{identifier}')
    def room(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        rank=access(db,user,2)
        if rank not in {'UA','DA'}:raise HTTPException(403,'Talep oluşturma yetkisi gerekli')
        from .room_models import Room
        p=db.get(Room,identifier) or db.scalar(select(Room).where(Room.public_id==identifier))
        if not p:raise HTTPException(404,'Oda bulunamadı')
        return {'public_id':p.public_id,'name':p.name,'is_active':p.is_active}

    @router.get('/support')
    def support(q:str=Query('',max_length=100),phase:str=Query('all',pattern='^(all|pending|awaiting_ready|active|closed)$'),category:str=Query('',max_length=32),before:int|None=Query(None,ge=1),days:int=Query(30,ge=1,le=365),db:Session=Depends(get_db),user:User=Depends(current_user)):
        role=access(db,user,1);query=select(SupportTicket,SupportFlow).join(SupportFlow).outerjoin(SupportAssignment).where(support_scope(user),SupportTicket.created_at>=now()-timedelta(days=days))
        if phase!='all':query=query.where(SupportFlow.phase==phase)
        if category:query=query.where(SupportTicket.category==category)
        if before:query=query.where(SupportTicket.id<before)
        if q:
            conditions=[SupportTicket.subject.contains(q,autoescape=True)]
            if q.isascii() and q.lstrip('#').isdigit() and len(q)<13:conditions.append(SupportTicket.id==int(q.lstrip('#')))
            if role in {'FA','DA'}:conditions.append(SupportTicket.user_id.in_(select(User.id).where(User.public_id==q)))
            query=query.where(or_(*conditions))
        rows=list(db.execute(query.order_by(SupportTicket.id.desc()).limit(31)));items=[]
        for row,flow in rows[:30]:
            unread=db.scalar(select(func.count()).select_from(SupportMessage).where(SupportMessage.ticket_id==row.id,SupportMessage.sender_role.in_(['USER','US']),SupportMessage.id>flow.agent_read_id))
            items.append({'id':row.id,'subject':row.subject,'category':row.category,'phase':flow.phase,'created_at':stamp(row.created_at),'unread':unread,'offered':flow.phase=='pending','can_open':True})
        return {'items':items,'next_before':rows[29][0].id if len(rows)>30 else None}

    @router.get('/sources/{kind}/{sid}')
    def history(kind:str,sid:str,before:int|None=Query(None,ge=1),db:Session=Depends(get_db),user:User=Depends(current_user)):
        record,_=source(db,user,kind,sid);sid=str(record.id);q=select(OperationHistory).where(OperationHistory.kind==kind,OperationHistory.source_id==sid)
        if before:q=q.where(OperationHistory.id<before)
        rows=list(db.scalars(q.order_by(OperationHistory.id.desc()).limit(31)));link=db.scalar(select(OperationCaseLink).where(OperationCaseLink.kind==kind,OperationCaseLink.source_id==sid))
        case_id=None
        if link:
            try:require_case(db,user,link.case_id);case_id=link.case_id
            except HTTPException:pass
        return {'case_id':case_id,'items':[{'id':r.id,'action':r.action,'note':r.note,'actor_name':db.get(User,r.actor_id).nickname,'created_at':stamp(r.created_at)} for r in rows[:30]],'next_before':rows[29].id if len(rows)>30 else None}

    @router.post('/sources/{kind}/{sid}/notes',status_code=201)
    def notes(kind:str,sid:str,payload:Note,db:Session=Depends(get_db),user:User=Depends(current_user)):
        record,_=source(db,user,kind,sid,True);sid=str(record.id)
        prior=db.scalar(select(OperationHistory).where(OperationHistory.request_key==payload.request_key))
        if prior:
            if (prior.kind,prior.source_id,prior.actor_id,prior.note,prior.action)!=(kind,sid,user.id,payload.note,'internal_note'):raise HTTPException(409,'İstek anahtarı başka kayıt için kullanılmış')
            return {'id':prior.id,'recorded':True}
        row=event(db,user,kind,sid,'internal_note',payload.note,payload.request_key);db.flush();db.commit();return {'id':row.id,'recorded':True}

    @router.post('/sources/{kind}/{sid}/case',status_code=201)
    def escalate(kind:str,sid:str,payload:SourceCase,db:Session=Depends(get_db),user:User=Depends(current_user)):
        record,target=source(db,user,kind,sid,True);sid=str(record.id)
        link=db.scalar(select(OperationCaseLink).where(OperationCaseLink.kind==kind,OperationCaseLink.source_id==sid))
        if link:require_case(db,user,link.case_id);return {'case_id':link.case_id,'existing':True}
        if payload.category not in CATEGORIES:raise HTTPException(422,'Geçersiz kategori')
        case=ManagementCase(category=payload.category,summary=payload.summary,target_user_id=target,reporter_id=user.id,status='open');db.add(case);db.flush()
        add_event(db,case,user,'created',{'category':case.category});add_event(db,case,user,'evidence_reference',{'reference':kind+':'+sid,'description':'Yetki kontrollü kaynak kaydı. Özel görüşme içeriği otomatik aktarılmadı.'})
        db.add(OperationCaseLink(kind=kind,source_id=sid,case_id=case.id,created_by=user.id));event(db,user,kind,sid,'case_linked',f'Olay #{case.id}: '+payload.summary)
        notify(db,reviewers(db),'Kaynak kaydı olay incelemesine aktarıldı',f'Olay #{case.id} inceleme bekliyor.',user.id);db.commit();return {'case_id':case.id,'existing':False}

    @router.post('/referrals',status_code=201)
    def referral_create(payload:ReferralCreate,db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4);db.scalar(select(User.id).where(User.id==user.id).with_for_update())
        prior=db.scalar(select(OperationHistory).where(OperationHistory.request_key==payload.request_key))
        if prior:
            if (prior.kind,prior.action,prior.actor_id)!=('referral','code_created',user.id):raise HTTPException(409,'İstek anahtarı başka işlemde kullanılmış')
            row=db.get(ReferralCode,int(prior.source_id))
            if not row or (row.kind,row.max_uses)!=(payload.kind,payload.max_uses):raise HTTPException(409,'İstek anahtarı başka kod için kullanılmış')
            return {'id':row.id,'code':row.code,'kind':row.kind,'max_uses':row.max_uses}
        from secrets import choice
        row=ReferralCode(code=''.join(choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(14)),kind=payload.kind,max_uses=payload.max_uses,created_by=user.id)
        db.add(row);db.flush();event(db,user,'referral',row.id,'code_created',payload.kind+' / '+str(payload.max_uses),payload.request_key);db.commit()
        return {'id':row.id,'code':row.code,'kind':row.kind,'max_uses':row.max_uses}

    @router.post('/referrals/{code_id}/cancel')
    def referral_cancel(code_id:int,payload:Note,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row,_=source(db,user,'referral',str(code_id),True)
        prior=db.scalar(select(OperationHistory).where(OperationHistory.request_key==payload.request_key))
        if prior and (prior.kind,prior.source_id,prior.actor_id,prior.action,prior.note)!=('referral',str(code_id),user.id,'code_cancelled',payload.note):raise HTTPException(409,'İstek anahtarı başka işlemde kullanılmış')
        if not row.active:return {'cancelled':True}
        row.active=False;event(db,user,'referral',row.id,'code_cancelled',payload.note,payload.request_key);db.commit();return {'cancelled':True}

    @router.get('/appeals')
    def appeals(status:str=Query('pending',pattern='^(all|pending|approved|rejected)$'),q:str=Query('',max_length=100),before:int|None=Query(None,ge=1),db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,3);query=select(BanAppeal,BanApproval).join(BanApproval,BanApproval.id==BanAppeal.approval_id)
        if status!='all':query=query.where(BanAppeal.status==status)
        if before:query=query.where(BanAppeal.id<before)
        if q:
            cond=[BanAppeal.reason.contains(q,autoescape=True),BanApproval.target_user_id.in_(select(User.id).where(User.public_id==q))]
            if q.lstrip('#').isascii() and q.lstrip('#').isdigit() and len(q)<13:cond.append(BanAppeal.id==int(q.lstrip('#')))
            query=query.where(or_(*cond))
        rows=list(db.execute(query.order_by(BanAppeal.id.desc()).limit(31)))
        return {'items':[{'id':r.id,'status':r.status,'reason':r.reason,'request_id':b.id,'kind':b.kind,'created_at':stamp(r.created_at)} for r,b in rows[:30]],'next_before':rows[29][0].id if len(rows)>30 else None}

    @router.get('/appeals/{aid}')
    def appeal_detail(aid:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,3);r,_=source(db,user,'appeal',str(aid));b=db.get(BanApproval,r.approval_id);p=db.get(User,b.target_user_id) if b.target_user_id else None
        from .room_models import Room
        room=db.get(Room,b.target_room_id) if b.target_room_id else None
        original=db.scalar(select(OperationHistory).where(OperationHistory.kind=='appeal',OperationHistory.source_id==str(r.id),OperationHistory.action=='appeal_created').order_by(OperationHistory.id.desc()).limit(1))
        first_reviewer=b.decision_by
        if original:
            try:first_reviewer=json.loads(original.note).get('first_reviewer_id',first_reviewer)
            except (ValueError,AttributeError):pass
        first_person=db.get(User,first_reviewer) if first_reviewer else None;requester=db.get(User,b.requester_id)
        first_note=db.scalar(select(OperationHistory.note).where(OperationHistory.kind=='ban',OperationHistory.source_id==str(b.id),OperationHistory.action=='decision_reject').order_by(OperationHistory.id).limit(1))
        audit(db,user,'appeal_evidence_viewed',{'appeal_id':r.id});db.commit()
        return {'id':r.id,'status':r.status,'reason':r.reason,'explanation':r.explanation,'images':json.loads(r.images_json),'request_id':b.id,'kind':b.kind,'days':b.days,'original_reason':b.reason,'target_public_id':p.public_id if p else None,'room_public_id':room.public_id if room else None,'room_name':room.name if room else None,'first_decision_note':first_note,'first_reviewer_id':first_reviewer,'first_reviewer_public_id':first_person.public_id if first_person else None,'requester_id':b.requester_id,'requester_public_id':requester.public_id if requester else None,'can_decide':r.status=='pending' and user.id not in {b.requester_id,b.target_user_id,b.decision_by}}

    @router.get('/referrals')
    def referrals(q:str=Query('',max_length=48),state:str=Query('all',pattern='^(all|active|exhausted|cancelled)$'),kind:str=Query('',pattern='^(|USER|TANIDIK)$'),before:int|None=Query(None,ge=1),db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4);query=select(ReferralCode)
        if q:query=query.where(ReferralCode.code.contains(q.strip().upper(),autoescape=True))
        if kind:query=query.where(ReferralCode.kind==kind)
        if state=='active':query=query.where(ReferralCode.active.is_(True),ReferralCode.uses<ReferralCode.max_uses)
        if state=='exhausted':query=query.where(ReferralCode.uses>=ReferralCode.max_uses)
        if state=='cancelled':query=query.where(ReferralCode.active.is_(False),ReferralCode.uses<ReferralCode.max_uses)
        if before:query=query.where(ReferralCode.id<before)
        rows=list(db.scalars(query.order_by(ReferralCode.id.desc()).limit(31)))
        return {'items':[{'id':r.id,'code':r.code,'kind':r.kind,'uses':r.uses,'max_uses':r.max_uses,'state':'exhausted' if r.uses>=r.max_uses else 'active' if r.active else 'cancelled','created_at':stamp(r.created_at),'total_awarded':str(db.scalar(select(func.coalesce(func.sum(ReferralRedemption.amount),0)).where(ReferralRedemption.code_id==r.id)))} for r in rows[:30]],'next_before':rows[29].id if len(rows)>30 else None}

    @router.get('/referrals/{code_id}/uses')
    def uses(code_id:int,before:int|None=Query(None,ge=1),db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4)
        if not db.get(ReferralCode,code_id):raise HTTPException(404,'Kod bulunamadı')
        q=select(ReferralRedemption,User).join(User,User.id==ReferralRedemption.user_id).where(ReferralRedemption.code_id==code_id)
        if before:q=q.where(ReferralRedemption.id<before)
        rows=list(db.execute(q.order_by(ReferralRedemption.id.desc()).limit(31)))
        audit(db,user,'referral_usage_viewed',{'code_id':code_id});db.commit()
        return {'items':[{'id':r.id,'public_id':p.public_id,'name':p.nickname,'amount':str(r.amount),'created_at':stamp(r.created_at)} for r,p in rows[:30]],'next_before':rows[29][0].id if len(rows)>30 else None}

    @router.get('/feedback')
    def feedback(q:str=Query('',max_length=100),status:str=Query('all'),mine:bool=False,before:int|None=Query(None,ge=1),db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4)
        if status not in STAGES|{'all'}:raise HTTPException(422,'Geçersiz takip durumu')
        query=select(UserSuggestion,FeedbackWork).outerjoin(FeedbackWork,FeedbackWork.suggestion_id==UserSuggestion.id)
        if status=='triage':query=query.where(or_(FeedbackWork.status=='triage',FeedbackWork.suggestion_id.is_(None)))
        elif status!='all':query=query.where(FeedbackWork.status==status)
        if mine:query=query.where(FeedbackWork.assignee_id==user.id)
        if before:query=query.where(UserSuggestion.id<before)
        if q:
            cond=[UserSuggestion.user_id.in_(select(User.id).where(User.public_id==q))]
            if q.lstrip('#').isascii() and q.lstrip('#').isdigit() and len(q)<13:cond.append(UserSuggestion.id==int(q.lstrip('#')))
            query=query.where(or_(*cond))
        rows=list(db.execute(query.order_by(UserSuggestion.id.desc()).limit(31)))
        return {'items':[{'id':r.id,'read':bool(r.read_at),'status':w.status if w else 'triage','assignee_id':w.assignee_id if w else None,'revision':w.revision if w else 0,'can_manage':acknowledged(db,user,r.id),'created_at':stamp(r.created_at)} for r,w in rows[:30]],'next_before':rows[29][0].id if len(rows)>30 else None}

    @router.post('/feedback/{sid}/workflow')
    def feedback_update(sid:int,payload:FeedbackDecision,db:Session=Depends(get_db),user:User=Depends(current_user)):
        source(db,user,'feedback',str(sid),True)
        if payload.status not in STAGES:raise HTTPException(422,'Geçersiz takip durumu')
        row=db.get(FeedbackWork,sid)
        if (row.revision if row else 0)!=payload.revision:raise HTTPException(409,'Takip kaydı değişti; ekranı yenileyin')
        if payload.assignee_id:
            person=db.get(User,payload.assignee_id);role=db.get(AdminRole,payload.assignee_id)
            if not person or not person.is_active or not role or role.role!='DA':raise HTTPException(422,'Takip sorumlusu aktif bir DA olmalı')
        if not row:row=FeedbackWork(suggestion_id=sid,revision=0);db.add(row)
        previous=row.status or 'triage';prior_assignee=row.assignee_id;row.status=payload.status;row.assignee_id=payload.assignee_id;row.revision+=1
        if previous!=row.status:
            labels={'triage':'Ön değerlendirme','planned':'Planlandı','in_progress':'Çalışılıyor','completed':'Tamamlandı','declined':'Uygun bulunmadı'}
            idea=db.get(UserSuggestion,sid);notify(db,[idea.user_id],'Gelişim fikri takibi',f'Öneri #{sid}: '+labels[row.status],user.id)
        if row.assignee_id and row.assignee_id!=prior_assignee:notify(db,[row.assignee_id],'Geri bildirim görevi',f'Öneri #{sid} size atandı.',user.id)
        event(db,user,'feedback',sid,'feedback_updated',json.dumps({'from':previous,'to':row.status,'assignee_id':row.assignee_id,'reason':payload.note},ensure_ascii=False));db.commit();return {'updated':True,'revision':row.revision}

    @router.post('/announcements/{aid}/withdraw')
    def withdraw(aid:int,payload:Note,db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,3);row=db.scalar(select(SystemAnnouncement).where(SystemAnnouncement.id==aid).with_for_update().execution_options(populate_existing=True))
        if not row:raise HTTPException(404,'Duyuru bulunamadı')
        prior=db.scalar(select(OperationHistory).where(OperationHistory.request_key==payload.request_key))
        if prior and (prior.kind,prior.source_id,prior.actor_id,prior.action,prior.note)!=('publication',str(aid),user.id,'announcement_withdrawn',payload.note):raise HTTPException(409,'İstek anahtarı başka işlemde kullanılmış')
        if not row.active:return {'withdrawn':True}
        row.active=False;event(db,user,'publication',aid,'announcement_withdrawn',payload.note,payload.request_key);db.commit();return {'withdrawn':True}

    @router.get('/announcement-drafts')
    def drafts(before:int|None=Query(None,ge=1),status:str=Query('draft',pattern='^(draft|published|discarded|all)$'),db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,3);q=select(AnnouncementDraft).where(AnnouncementDraft.author_id==user.id)
        if status!='all':q=q.where(AnnouncementDraft.status==status)
        if before:q=q.where(AnnouncementDraft.id<before)
        rows=list(db.scalars(q.order_by(AnnouncementDraft.id.desc()).limit(21)))
        return {'items':[draft_view(db,r) for r in rows[:20]],'next_before':rows[19].id if len(rows)>20 else None}

    @router.post('/announcement-drafts',status_code=201)
    def draft_create(payload:DraftCreate,db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,3);db.scalar(select(User.id).where(User.id==user.id).with_for_update())
        row=db.scalar(select(AnnouncementDraft).where(AnnouncementDraft.request_key==payload.request_key))
        if row:
            if row.author_id!=user.id or row.message!=payload.message:raise HTTPException(409,'İstek anahtarı başka taslakta kullanılmış')
            return draft_view(db,row)
        row=AnnouncementDraft(author_id=user.id,message=payload.message,request_key=payload.request_key);db.add(row);db.flush();event(db,user,'announcement',row.id,'draft_created','Duyuru taslağı oluşturuldu.');db.commit();return draft_view(db,row)

    @router.put('/announcement-drafts/{did}')
    def draft_edit(did:int,payload:DraftEdit,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=draft(db,user,did)
        if row.status!='draft' or row.revision!=payload.revision:raise HTTPException(409,'Taslak değişti veya sonuçlandı; kaydı yenileyin')
        row.message=payload.message;row.revision+=1;event(db,user,'announcement',did,'draft_edited','Taslak sürümü '+str(row.revision));db.commit();return draft_view(db,row)

    @router.post('/announcement-drafts/{did}/publish')
    def publish(did:int,payload:Version,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=draft(db,user,did)
        if row.status=='published':return draft_view(db,row)
        if row.status!='draft' or row.revision!=payload.revision:raise HTTPException(409,'Taslak değişti veya sonuçlandı; önizlemeyi yenileyin')
        announcement=SystemAnnouncement(admin_id=user.id,message=row.message,active=True);db.add(announcement);db.flush();row.status='published';row.announcement_id=announcement.id;row.revision+=1
        event(db,user,'announcement',did,'draft_published','Duyuru #'+str(announcement.id)+' yayınlandı.');db.commit();return draft_view(db,row)

    @router.post('/announcement-drafts/{did}/discard')
    def discard(did:int,payload:Version,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=draft(db,user,did)
        if row.status=='discarded':return draft_view(db,row)
        if row.status!='draft' or row.revision!=payload.revision:raise HTTPException(409,'Taslak değişti veya sonuçlandı')
        row.status='discarded';row.revision+=1;event(db,user,'announcement',did,'draft_discarded','Taslak yayına alınmadan kapatıldı.');db.commit();return draft_view(db,row)
    return router
