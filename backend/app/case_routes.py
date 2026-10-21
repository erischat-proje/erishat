"""Role-scoped staff incident cases; metadata-only evidence references."""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .admin_models import AdminRole
from .case_models import ManagementCase, ManagementCaseEvent

router = APIRouter(prefix='/v1/admin/cases', tags=['management-cases'])
CATEGORIES = {'spam', 'harassment', 'threat', 'fraud', 'account_safety', 'room_abuse', 'other'}
STATUSES = {'open', 'investigating', 'awaiting_decision', 'resolved', 'dismissed'}

class CaseCreate(BaseModel):
    category: str
    summary: str = Field(min_length=12, max_length=3000)
    target_public_id: str | None = Field(default=None, max_length=64)

class CaseTransition(BaseModel):
    status: str
    note: str = Field(min_length=10, max_length=2000)

class EvidenceReference(BaseModel):
    reference: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=1000)

def access(db, user, minimum):
    role=db.get(AdminRole,user.id)
    rank={'SA':1,'UA':2,'FA':3,'DA':4}.get(role.role if role else None,0)
    if rank < minimum:raise HTTPException(403,'Yönetim yetkisi gerekli')
    return role.role

def allowed(role, user, case):
    return role in {'FA','DA'} or case.reporter_id==user.id or case.assigned_id==user.id

def require_case(db,user,cid,minimum=1):
    role=access(db,user,minimum)
    item=db.get(ManagementCase,cid)
    if not item:raise HTTPException(404,'Olay dosyasi bulunamadi')
    if not allowed(role,user,item):raise HTTPException(403,'Bu dosyaya erisim yok')
    return item,role

def serialize(case):
    return {'id':case.id,'category':case.category,'status':case.status,
      'summary':case.summary,'target_user_id':case.target_user_id,
      'reporter_id':case.reporter_id,'assigned_id':case.assigned_id,
      'created_at':case.created_at.isoformat() if case.created_at else None}

def add_event(db,case,user,kind,details):
    db.add(ManagementCaseEvent(case_id=case.id,actor_id=user.id,event=kind,
                               details=json.dumps(details,ensure_ascii=False)))

def register_auth(current_user):
    @router.post('',status_code=201)
    def create(payload:CaseCreate,db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,1)
        if payload.category not in CATEGORIES:raise HTTPException(422,'Gecersiz kategori')
        target=None
        if payload.target_public_id:
            target=db.scalar(select(User).where(User.public_id==payload.target_public_id))
            if not target:raise HTTPException(404,'Hedef kullanici bulunamadi')
        case=ManagementCase(category=payload.category,summary=payload.summary.strip(),
                           target_user_id=target.id if target else None,reporter_id=user.id,status='open')
        db.add(case);db.flush();add_event(db,case,user,'created',{'category':case.category})
        db.commit();db.refresh(case);return serialize(case)

    @router.get('')
    def index(limit:int=Query(30,ge=1,le=100),db:Session=Depends(get_db),user:User=Depends(current_user)):
        role=access(db,user,1)
        q=select(ManagementCase)
        if role not in {'FA','DA'}:
            from sqlalchemy import or_
            q=q.where(or_(ManagementCase.reporter_id==user.id,ManagementCase.assigned_id==user.id))
        return [serialize(c) for c in db.scalars(q.order_by(ManagementCase.id.desc()).limit(limit))]

    @router.get('/{case_id}')
    def detail(case_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        case,role=require_case(db,user,case_id)
        events=db.scalars(select(ManagementCaseEvent).where(ManagementCaseEvent.case_id==case_id)
                          .order_by(ManagementCaseEvent.id).limit(300)).all()
        return {'case':serialize(case),'history':[{'event':e.event,'actor_id':e.actor_id,
           'details':json.loads(e.details),'created_at':e.created_at.isoformat() if e.created_at else None} for e in events]}

    @router.post('/{case_id}/evidence',status_code=201)
    def evidence(case_id:int,payload:EvidenceReference,db:Session=Depends(get_db),user:User=Depends(current_user)):
        case,role=require_case(db,user,case_id)
        if case.status in {'resolved','dismissed'}:raise HTTPException(409,'Dosya kapali')
        # References are identifiers only; no remote URL fetching, raw DM access, or binary storage.
        if '://' in payload.reference or payload.reference.startswith('/'):
            raise HTTPException(422,'Yalnizca dahili kanit kimlikleri kabul edilir')
        add_event(db,case,user,'evidence_reference',payload.model_dump())
        db.commit();return {'recorded':True}

    @router.post('/{case_id}/status')
    def status(case_id:int,payload:CaseTransition,db:Session=Depends(get_db),user:User=Depends(current_user)):
        case,role=require_case(db,user,case_id,2)
        if payload.status not in STATUSES:raise HTTPException(422,'Gecersiz durum')
        if payload.status in {'resolved','dismissed'} and role not in {'FA','DA'}:
            raise HTTPException(403,'Nihai karar FA veya DA yetkisi gerektirir')
        if case.status in {'resolved','dismissed'}:raise HTTPException(409,'Kapali dosya yeniden acilamaz')
        before=case.status;case.status=payload.status
        add_event(db,case,user,'status_changed',{'from':before,'to':payload.status,'note':payload.note})
        db.commit();return serialize(case)
    return router
