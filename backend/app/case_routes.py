"""Role-scoped cases, assignments, evidence and independent final decisions."""
import base64,hashlib,json,re
from datetime import datetime, timezone
from fastapi import APIRouter,Depends,HTTPException,Query,Response
from pydantic import BaseModel,Field,field_validator
from sqlalchemy import select,or_
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .admin_models import AdminRole
from .case_models import ManagementCase,ManagementCaseEvent
from .management_workflow_models import ManagementEvidence
from .management_events import audit,notify,reviewers
router=APIRouter(prefix='/v1/admin/cases',tags=['management-cases'])
CATEGORIES={'spam','harassment','threat','fraud','account_safety','room_abuse','other'}
STATUSES={'open','investigating','awaiting_decision','resolved','dismissed'}
CLOSED={'resolved','dismissed'}

class TextModel(BaseModel):
    @field_validator('*',mode='before')
    @classmethod
    def strip_text(cls,v):return v.strip() if isinstance(v,str) else v
class CaseCreate(TextModel):
    category:str
    summary:str=Field(min_length=12,max_length=3000)
    target_public_id:str|None=Field(default=None,max_length=64)
class CaseTransition(TextModel):
    status:str
    note:str=Field(min_length=10,max_length=2000)
    expected_status:str|None=None
class EvidenceReference(TextModel):
    reference:str=Field(min_length=3,max_length=200)
    description:str=Field(min_length=10,max_length=1000)
class CaseNote(TextModel):
    note:str=Field(min_length=10,max_length=2000)
class CaseAssignment(CaseNote):
    assignee_id:str|None=None
class CaseSanction(CaseNote):
    kind:str=Field(pattern='^(account|device|chat)$')
    days:int|None=Field(default=None,ge=1,le=36500)

class EvidenceUpload(TextModel):
    description:str=Field(min_length=10,max_length=1000)
    image:str=Field(min_length=24,max_length=2_100_000)

def access(db,user,minimum):
    if not user.is_active:raise HTTPException(403,'Hesap aktif değil')
    role=db.get(AdminRole,user.id)
    rank={'SA':1,'UA':2,'FA':3,'DA':4}.get(role.role if role else None,0)
    if rank<minimum:raise HTTPException(403,'Yönetim yetkisi gerekli')
    return role.role

def allowed(role,user,case):return role in {'FA','DA'} or case.reporter_id==user.id or case.assigned_id==user.id

def scoped(db,user,minimum=1):
    role=access(db,user,minimum);q=select(ManagementCase)
    if role not in {'FA','DA'}:q=q.where(or_(ManagementCase.reporter_id==user.id,ManagementCase.assigned_id==user.id))
    return q,role

def require_case(db,user,cid,minimum=1,lock=False):
    role=access(db,user,minimum);q=select(ManagementCase).where(ManagementCase.id==cid)
    if lock:q=q.with_for_update().execution_options(populate_existing=True)
    item=db.scalar(q)
    if not item:raise HTTPException(404,'Olay dosyası bulunamadı')
    if not allowed(role,user,item):raise HTTPException(403,'Bu dosyaya erişim yok')
    return item,role

def independent_decider(db,case,user):
    if user.id in {case.reporter_id,case.target_user_id,case.assigned_id}:return False
    for event in db.scalars(select(ManagementCaseEvent).where(ManagementCaseEvent.case_id==case.id,ManagementCaseEvent.event=='assigned')):
        if json.loads(event.details).get('to')==user.id:return False
    return True

def serialize(case,db=None):
    result={'id':case.id,'category':case.category,'status':case.status,'summary':case.summary,
        'target_user_id':case.target_user_id,'reporter_id':case.reporter_id,'assigned_id':case.assigned_id,
        'created_at':case.created_at.isoformat() if case.created_at else None,
        'updated_at':case.updated_at.isoformat() if case.updated_at else None}
    if db:
        for prefix,uid in [('target',case.target_user_id),('reporter',case.reporter_id),('assigned',case.assigned_id)]:
            person=db.get(User,uid) if uid else None
            result[prefix+'_name']=person.nickname if person else None
            result[prefix+'_public_id']=person.public_id if person else None
    return result

def add_event(db,case,user,kind,details):
    db.add(ManagementCaseEvent(case_id=case.id,actor_id=user.id,event=kind,details=json.dumps(details,ensure_ascii=False)))
    case.updated_at=datetime.now(timezone.utc)
    audit(db,user,'case_'+kind,{'case_id':case.id,**{k:v for k,v in details.items() if k!='data'}},case.target_user_id)

def sanctions(db,case):
    from .admin_models import BanApproval
    from .ban_workflow_models import BanWorkflow
    result=[]
    for event in db.scalars(select(ManagementCaseEvent).where(ManagementCaseEvent.case_id==case.id,ManagementCaseEvent.event=='sanction_requested').order_by(ManagementCaseEvent.id.desc()).limit(100)):
        rid=json.loads(event.details).get('request_id');request=db.get(BanApproval,rid)
        if request:
            flow=db.get(BanWorkflow,rid);reviewer=db.get(User,request.decision_by) if request.decision_by else None
            result.append({'request_id':rid,'kind':request.kind,'days':request.days,'status':request.status,'reviewer_name':reviewer.nickname if reviewer else None,'decided_at':flow.decided_at.isoformat() if flow and flow.decided_at else None})
    return result

def open_only(case):
    if case.status in CLOSED:raise HTTPException(409,'Dosya kapalı; değişiklik yapılamaz')

def image_bytes(value):
    match=re.fullmatch(r'data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})',value)
    if not match:raise HTTPException(422,'Kanıt PNG, JPEG veya WebP olmalı')
    try:data=base64.b64decode(match[2],validate=True)
    except ValueError:raise HTTPException(422,'Geçersiz kanıt')
    if len(data)>1_500_000:raise HTTPException(422,'Kanıt en fazla 1,5 MB olabilir')
    mime=match[1]
    if not ((mime=='image/png' and data.startswith(b'\x89PNG\r\n\x1a\n')) or (mime=='image/jpeg' and data.startswith(b'\xff\xd8\xff')) or (mime=='image/webp' and data.startswith(b'RIFF') and data[8:12]==b'WEBP')):raise HTTPException(422,'Kanıt türü içerikle eşleşmiyor')
    from .purchase_routes import decode_document
    try:verified,verified_mime=decode_document(value)
    except ValueError:raise HTTPException(422,'Geçerli bir kanıt fotoğrafı gerekli')
    return verified_mime,verified

def register_auth(current_user):
    @router.get('/staff')
    def staff(db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,3)
        rows=db.execute(select(User,AdminRole).join(AdminRole,AdminRole.user_id==User.id).where(User.is_active.is_(True)).order_by(User.public_id).limit(500)).all()
        return [{'id':p.id,'public_id':p.public_id,'name':p.nickname,'role':r.role} for p,r in rows]

    @router.post('',status_code=201)
    def create(payload:CaseCreate,db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,1)
        if payload.category not in CATEGORIES:raise HTTPException(422,'Geçersiz kategori')
        target=None
        if payload.target_public_id:
            target=db.scalar(select(User).where(User.public_id==payload.target_public_id))
            if not target:raise HTTPException(404,'Hedef kullanıcı bulunamadı')
        case=ManagementCase(category=payload.category,summary=payload.summary,target_user_id=target.id if target else None,reporter_id=user.id,status='open')
        db.add(case);db.flush();add_event(db,case,user,'created',{'category':case.category})
        notify(db,reviewers(db),'Yeni olay dosyası',f'Olay #{case.id} inceleme bekliyor.',user.id)
        db.commit();db.refresh(case);return serialize(case,db)

    @router.get('')
    def index(limit:int=Query(30,ge=1,le=100),before:int|None=Query(None,ge=1),status:str|None=None,category:str|None=None,q:str=Query('',max_length=100),assigned_to_me:bool=False,db:Session=Depends(get_db),user:User=Depends(current_user)):
        query,_=scoped(db,user)
        if status:
            if status not in STATUSES:raise HTTPException(422,'Geçersiz durum')
            query=query.where(ManagementCase.status==status)
        if category:
            if category not in CATEGORIES:raise HTTPException(422,'Geçersiz kategori')
            query=query.where(ManagementCase.category==category)
        if assigned_to_me:query=query.where(ManagementCase.assigned_id==user.id)
        if before:query=query.where(ManagementCase.id<before)
        if q.strip():
            query=query.where(or_(ManagementCase.summary.contains(q.strip(),autoescape=True),ManagementCase.target_user_id.in_(select(User.id).where(User.public_id==q.strip())),ManagementCase.id==int(q) if q.isdigit() else False))
        return [serialize(c,db) for c in db.scalars(query.order_by(ManagementCase.id.desc()).limit(limit))]

    @router.get('/{case_id}')
    def detail(case_id:int,before:int|None=Query(None,ge=1),db:Session=Depends(get_db),user:User=Depends(current_user)):
        case,role=require_case(db,user,case_id)
        q=select(ManagementCaseEvent).where(ManagementCaseEvent.case_id==case_id)
        if before:q=q.where(ManagementCaseEvent.id<before)
        events=list(db.scalars(q.order_by(ManagementCaseEvent.id.desc()).limit(51)))
        history=[]
        for event in events[:50]:
            actor=db.get(User,event.actor_id)
            history.append({'id':event.id,'event':event.event,'actor_id':event.actor_id,'actor_name':actor.nickname if actor else 'Yetkili','details':json.loads(event.details),'created_at':event.created_at.isoformat() if event.created_at else None})
        linked=sanctions(db,case)
        return {'case':serialize(case,db),'linked_sanctions':linked,'history':history,'next_before':events[49].id if len(events)>50 else None,'can_decide':role in {'FA','DA'} and independent_decider(db,case,user),'can_assign':role in {'FA','DA'}}

    @router.post('/{case_id}/assign')
    def assign(case_id:int,payload:CaseAssignment,db:Session=Depends(get_db),user:User=Depends(current_user)):
        case,_=require_case(db,user,case_id,3,True);open_only(case)
        assignee_id=payload.assignee_id or None
        if assignee_id:
            person=db.get(User,assignee_id);rank=db.get(AdminRole,assignee_id)
            if not person or not person.is_active or not rank or rank.role not in {'SA','UA','FA','DA'}:raise HTTPException(422,'Aktif bir yetkili seçin')
            if person.id==case.target_user_id:raise HTTPException(403,'Dosya hedefe atanamaz')
        before=case.assigned_id
        if before==assignee_id:return serialize(case,db)
        case.assigned_id=assignee_id;add_event(db,case,user,'assigned',{'from':before,'to':case.assigned_id,'note':payload.note})
        notify(db,[case.assigned_id],'Olay dosyası atandı',f'Olay #{case.id} size atandı.',user.id)
        db.commit();return serialize(case,db)

    @router.post('/{case_id}/notes',status_code=201)
    def note(case_id:int,payload:CaseNote,db:Session=Depends(get_db),user:User=Depends(current_user)):
        case,_=require_case(db,user,case_id,1,True);open_only(case);add_event(db,case,user,'note',{'note':payload.note});db.commit();return {'recorded':True}

    @router.post('/{case_id}/evidence',status_code=201)
    def evidence(case_id:int,payload:EvidenceReference,db:Session=Depends(get_db),user:User=Depends(current_user)):
        case,_=require_case(db,user,case_id,1,True);open_only(case)
        if '://' in payload.reference or payload.reference.startswith('/'):raise HTTPException(422,'Yalnızca dahili kanıt kimlikleri kabul edilir')
        add_event(db,case,user,'evidence_reference',payload.model_dump());db.commit();return {'recorded':True}

    @router.post('/{case_id}/evidence-upload',status_code=201)
    def upload(case_id:int,payload:EvidenceUpload,db:Session=Depends(get_db),user:User=Depends(current_user)):
        case,_=require_case(db,user,case_id,1,True);open_only(case);mime,data=image_bytes(payload.image)
        digest=hashlib.sha256(data).hexdigest()
        existing=db.scalar(select(ManagementEvidence).where(ManagementEvidence.case_id==case.id,ManagementEvidence.sha256==digest))
        if existing:return {'id':existing.id,'duplicate':True}
        item=ManagementEvidence(case_id=case.id,actor_id=user.id,mime=mime,data=base64.b64encode(data).decode(),sha256=digest,description=payload.description)
        db.add(item);db.flush();add_event(db,case,user,'evidence_uploaded',{'evidence_id':item.id,'description':payload.description,'sha256':digest,'url':f'/v1/admin/cases/{case.id}/evidence/{item.id}'})
        db.commit();return {'id':item.id,'duplicate':False}

    @router.get('/{case_id}/evidence/{evidence_id}')
    def proof(case_id:int,evidence_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_case(db,user,case_id);item=db.get(ManagementEvidence,evidence_id)
        if not item or item.case_id!=case_id:raise HTTPException(404,'Kanıt bulunamadı')
        audit(db,user,'case_evidence_viewed',{'case_id':case_id,'evidence_id':evidence_id});db.commit()
        return Response(base64.b64decode(item.data),media_type=item.mime,headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"})

    @router.post('/{case_id}/sanction-request',status_code=201)
    def sanction(case_id:int,payload:CaseSanction,db:Session=Depends(get_db),user:User=Depends(current_user)):
        case,role=require_case(db,user,case_id,2,True);open_only(case)
        if role not in {'UA','DA'}:raise HTTPException(403,'Yaptırım talebini UA veya üst yönetim oluşturur')
        if 'days' not in payload.model_fields_set:raise HTTPException(422,'Süre seçin')
        target=db.get(User,case.target_user_id) if case.target_user_id else None
        if not target:raise HTTPException(422,'Önce hedef kullanıcısı olan olay dosyası açın')
        evidence_event=db.scalar(select(ManagementCaseEvent.id).where(ManagementCaseEvent.case_id==case.id,ManagementCaseEvent.event.in_(['evidence_reference','evidence_uploaded'])).limit(1))
        if not evidence_event:raise HTTPException(422,'Önce dosyaya kanıt ekleyin')
        from .ban_workflow import EvidencePayload,submit
        from .admin_models import BanApproval
        for event in db.scalars(select(ManagementCaseEvent).where(ManagementCaseEvent.case_id==case.id,ManagementCaseEvent.event=='sanction_requested')):
            details=json.loads(event.details);request=db.get(BanApproval,details.get('request_id'))
            if request and request.status=='pending':raise HTTPException(409,'Bu dosyada bekleyen yaptırım talebi var')
        images=list(db.scalars(select(ManagementEvidence).where(ManagementEvidence.case_id==case.id).order_by(ManagementEvidence.id.desc()).limit(3)))
        proof=['data:'+e.mime+';base64,'+e.data for e in images]
        result=submit(db,user,target,EvidencePayload(days=payload.days,reason=f'Olay #{case.id}: '+payload.note[:1900],evidence=proof),payload.kind,independent=True,commit_transaction=False)
        case.status='awaiting_decision';add_event(db,case,user,'sanction_requested',{'request_id':result['id'],'kind':payload.kind,'days':payload.days,'note':payload.note})
        db.commit();return {'request_id':result['id'],'status':'pending','case_id':case.id}

    @router.post('/{case_id}/status')
    def status(case_id:int,payload:CaseTransition,db:Session=Depends(get_db),user:User=Depends(current_user)):
        case,role=require_case(db,user,case_id,2,True);open_only(case)
        if payload.status not in STATUSES:raise HTTPException(422,'Geçersiz durum')
        if payload.expected_status and case.status!=payload.expected_status:raise HTTPException(409,'Dosya başka bir işlemle değişti; yenileyin')
        if payload.status in CLOSED:
            if role not in {'FA','DA'}:raise HTTPException(403,'Nihai karar FA veya üst yönetim yetkisi gerektirir')
            if not independent_decider(db,case,user):raise HTTPException(403,'Nihai karar bağımsız bir yetkili tarafından verilmelidir')
            if any(r['status']=='pending' for r in sanctions(db,case)):raise HTTPException(409,'Önce dosyaya bağlı yaptırım talebini karar kuyruğunda sonuçlandırın')
        if case.status==payload.status:return serialize(case,db)
        before=case.status;case.status=payload.status;add_event(db,case,user,'status_changed',{'from':before,'to':case.status,'note':payload.note})
        recipients=reviewers(db) if case.status=='awaiting_decision' else [case.reporter_id,case.assigned_id]
        notify(db,recipients,'Olay dosyası güncellendi',f'Olay #{case.id}: {case.status}.',user.id)
        db.commit();return serialize(case,db)
    return router
