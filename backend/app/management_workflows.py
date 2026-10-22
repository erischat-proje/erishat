"""Independent financial review, signal disposition and searchable staff audit."""
import base64,json
from datetime import datetime,timezone,timedelta
from fastapi import APIRouter,Depends,HTTPException,Query,Response
from pydantic import Field
from sqlalchemy import select,func,or_
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .admin_models import AdminRole,AdminAuditLog,FaActionLog
from .case_models import ManagementCase
from .case_routes import TextModel,CaseNote,access,require_case,add_event,open_only
from .management_workflow_models import ManagementFinanceRequest,ManagementSignalReview
from .management_events import audit,notify,reviewers
from .purchase_models import LidyaOperation
from .purchase_routes import ManualAmount,manual_change,commit,decode_document,LIMIT
from .fraud_review import analyze
router=APIRouter(prefix='/v1/admin/management',tags=['management-workflows'])

def at():return datetime.now(timezone.utc)
def stamp(d):return d.isoformat() if d else None
class FinanceCreate(ManualAmount,TextModel):
    target_public_id:str=Field(min_length=5,max_length=64)
    operation:str=Field(pattern='^(EKLEME|ÇIKARMA)$')
    reason:str=Field(min_length=20,max_length=2000)
    evidence:str=Field(min_length=24,max_length=4_100_000)
    request_key:str=Field(min_length=16,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')
class Review(CaseNote):
    approve:bool
class SignalReview(CaseNote):
    operation_id:str=Field(min_length=1,max_length=36)
    signal_type:str=Field(min_length=1,max_length=64)
    status:str=Field(pattern='^(investigating|cleared|escalated)$')
    case_id:int|None=Field(default=None,ge=1)

def finance_row(db,rid,lock=False):
    q=select(ManagementFinanceRequest).where(ManagementFinanceRequest.id==rid)
    if lock:q=q.with_for_update().execution_options(populate_existing=True)
    row=db.scalar(q)
    if not row:raise HTTPException(404,'Mali talep bulunamadı')
    return row

def finance_view(db,row,user,role):
    target=db.get(User,row.target_id)
    name=lambda uid:db.get(User,uid).nickname if uid and db.get(User,uid) else None
    independent=user.id not in {row.requester_id,row.target_id}
    return {'id':row.id,'requester_id':row.requester_id,'requester_name':name(row.requester_id),'target_public_id':target.public_id if target else None,
      'target_name':target.nickname if target else None,'operation':row.operation,'amount':str(row.amount),'reason':row.reason,'status':row.status,
      'reviewer_id':row.reviewer_id,'reviewer_name':name(row.reviewer_id),'review_note':row.review_note,'reviewed_at':stamp(row.reviewed_at),
      'approver_name':name(row.approver_id),'decision_note':row.decision_note,'operation_id':row.operation_id,'created_at':stamp(row.created_at),'decided_at':stamp(row.decided_at),
      'can_review':row.status=='pending_review' and independent,
      'can_execute':row.status=='reviewed' and role=='DA' and independent and user.id!=row.reviewer_id,
      'can_cancel':row.requester_id==user.id and row.status in {'pending_review','reviewed'},
      'evidence_url':f'/v1/admin/management/finance-requests/{row.id}/evidence'}

def register_auth(current_user):
    @router.get('/finance-requests')
    def finance_list(limit:int=Query(30,ge=1,le=100),before:int|None=Query(None,ge=1),status:str|None=None,target:str=Query('',max_length=64),db:Session=Depends(get_db),user:User=Depends(current_user)):
        role=access(db,user,3);q=select(ManagementFinanceRequest)
        if status:
            if status not in {'pending_review','reviewed','rejected','executed','cancelled'}:raise HTTPException(422,'Geçersiz durum')
            q=q.where(ManagementFinanceRequest.status==status)
        if before:q=q.where(ManagementFinanceRequest.id<before)
        if target:q=q.where(ManagementFinanceRequest.target_id.in_(select(User.id).where(User.public_id==target)))
        rows=list(db.scalars(q.order_by(ManagementFinanceRequest.id.desc()).limit(limit+1)))
        return {'items':[finance_view(db,r,user,role) for r in rows[:limit]],'next_before':rows[limit-1].id if len(rows)>limit else None}

    @router.post('/finance-requests',status_code=201)
    def finance_create(payload:FinanceCreate,db:Session=Depends(get_db),user:User=Depends(current_user)):
        role=access(db,user,3)
        # Reuse existing limits and document validation; no exemption bypass.
        ManualAmount(amount=payload.amount,request_key=payload.request_key,evidence=payload.evidence)
        target=db.scalar(select(User).where(User.public_id==payload.target_public_id))
        if not target:raise HTTPException(404,'Hedef kullanıcı bulunamadı')
        if target.id==user.id:raise HTTPException(403,'Kendi hesabınız için mali talep oluşturamazsınız')
        # Serialize duplicate creation by requester as well as the unique request key.
        db.scalar(select(User.id).where(User.id==user.id).with_for_update())
        existing=db.scalar(select(ManagementFinanceRequest).where(ManagementFinanceRequest.request_key==payload.request_key))
        if existing:
            if (existing.requester_id,existing.target_id,existing.amount,existing.operation,existing.reason,existing.evidence)!=(user.id,target.id,payload.amount,payload.operation,payload.reason,payload.evidence):raise HTTPException(409,'İstek anahtarı başka bir taleple kullanılmış')
            return finance_view(db,existing,user,role)
        row=ManagementFinanceRequest(request_key=payload.request_key,requester_id=user.id,target_id=target.id,amount=payload.amount,operation=payload.operation,reason=payload.reason,evidence=payload.evidence,status='pending_review')
        db.add(row);db.flush();audit(db,user,'management_finance_requested',{'finance_request_id':row.id,'amount':row.amount,'operation':row.operation},target.id)
        notify(db,reviewers(db),'Mali inceleme talebi',f'Mali talep #{row.id} bağımsız inceleme bekliyor.',user.id)
        db.commit();return finance_view(db,row,user,role)

    @router.get('/finance-requests/{request_id}')
    def finance_detail(request_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        role=access(db,user,3);return finance_view(db,finance_row(db,request_id),user,role)

    @router.get('/finance-requests/{request_id}/evidence')
    def finance_evidence(request_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,3);row=finance_row(db,request_id)
        data,mime=decode_document(row.evidence)
        audit(db,user,'management_finance_evidence_viewed',{'finance_request_id':row.id},row.target_id);db.commit()
        return Response(data,media_type=mime,headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"})

    @router.post('/finance-requests/{request_id}/review')
    def finance_review(request_id:int,payload:Review,db:Session=Depends(get_db),user:User=Depends(current_user)):
        role=access(db,user,3);row=finance_row(db,request_id,True)
        if user.id in {row.requester_id,row.target_id}:raise HTTPException(403,'Bağımsız inceleyen gerekli')
        if row.status!='pending_review':raise HTTPException(409,'Talep inceleme aşamasında değil')
        row.reviewer_id=user.id;row.review_note=payload.note;row.reviewed_at=at();row.status='reviewed' if payload.approve else 'rejected'
        audit(db,user,'management_finance_reviewed',{'finance_request_id':row.id,'approved':payload.approve,'note':payload.note},row.target_id)
        recipients=db.scalars(select(AdminRole.user_id).where(AdminRole.role=='DA')).all() if payload.approve else [row.requester_id]
        notify(db,recipients,'Mali talep incelendi',f'Mali talep #{row.id}: '+('son onay bekliyor.' if payload.approve else 'reddedildi.'),user.id)
        db.commit();return finance_view(db,row,user,role)

    @router.post('/finance-requests/{request_id}/decision')
    def finance_decision(request_id:int,payload:Review,db:Session=Depends(get_db),user:User=Depends(current_user)):
        role=access(db,user,4);row=finance_row(db,request_id,True)
        if user.id in {row.requester_id,row.target_id,row.reviewer_id}:raise HTTPException(403,'Son onay talebi açan, hedef ve inceleyenden farklı bir yönetici gerektirir')
        if row.status=='executed' and payload.approve:return finance_view(db,row,user,role)
        if row.status!='reviewed':raise HTTPException(409,'Önce bağımsız inceleme tamamlanmalı')
        row.approver_id=user.id;row.decision_note=payload.note
        if payload.approve:
            target=db.get(User,row.target_id)
            result=manual_change(db,user,target,ManualAmount(amount=row.amount,request_key='management_finance_'+str(row.id),evidence=row.evidence),row.operation,approval_id=row.id,commit_transaction=False)
            row.operation_id=result['id'];row.status='executed'
        else:row.status='rejected'
        row.decided_at=at();audit(db,user,'management_finance_decided',{'finance_request_id':row.id,'approved':payload.approve,'operation_id':row.operation_id,'note':payload.note},row.target_id)
        notify(db,[row.requester_id,row.reviewer_id],'Mali talep sonuçlandı',f'Mali talep #{row.id}: '+('uygulandı.' if payload.approve else 'reddedildi.'),user.id)
        # Wallet mutation, receipt, state and audit are one transaction.
        commit(db);return finance_view(db,row,user,role)

    @router.post('/finance-requests/{request_id}/cancel')
    def finance_cancel(request_id:int,payload:CaseNote,db:Session=Depends(get_db),user:User=Depends(current_user)):
        role=access(db,user,3);row=finance_row(db,request_id,True)
        if row.requester_id!=user.id:raise HTTPException(403,'Yalnız talebi açan geri çekebilir')
        if row.status=='cancelled':return finance_view(db,row,user,role)
        if row.status not in {'pending_review','reviewed'}:raise HTTPException(409,'Sonuçlanmış talep geri çekilemez')
        row.status='cancelled';row.decision_note=payload.note;row.decided_at=at();audit(db,user,'management_finance_cancelled',{'finance_request_id':row.id,'note':payload.note},row.target_id)
        db.commit();return finance_view(db,row,user,role)

    @router.get('/audit')
    def staff_audit(limit:int=Query(30,ge=1,le=100),before:int|None=Query(None,ge=1),role:str|None=None,actor:str=Query('',max_length=64),action:str=Query('',max_length=64),days:int=Query(30,ge=1,le=365),source:str=Query('audit',pattern='^(audit|fa_legacy)$'),db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4);model=FaActionLog if source=='fa_legacy' else AdminAuditLog;q=select(model).where(model.created_at>=at()-timedelta(days=days))
        if source=='fa_legacy' and role not in {None,'','FA'}:raise HTTPException(422,'Eski FA kayıtları yalnız FA rolüyle filtrelenebilir')
        if role:
            if role not in {'SA','UA','FA','DA'}:raise HTTPException(422,'Geçersiz rol')
            if source=='audit':q=q.where(or_(model.details.contains('"actor_role": "'+role+'"'),model.details.contains('"actor_role":"'+role+'"')))
        if actor:q=q.where(model.admin_id.in_(select(User.id).where(or_(User.public_id==actor,User.id==actor))))
        if action:q=q.where(model.action.contains(action,autoescape=True))
        if before:q=q.where(model.id<before)
        rows=list(db.scalars(q.order_by(model.id.desc()).limit(limit+1)));items=[]
        for row in rows[:limit]:
            person=db.get(User,row.admin_id)
            try:details=json.loads(row.details or '{}')
            except ValueError:details={'note':'Eski biçimli kayıt'}
            if not isinstance(details,dict):details={'note':'Eski biçimli kayıt'}
            # Never return inline proof/credentials in an audit summary.
            details={k:v for k,v in details.items() if not any(x in k.lower() for x in ('token','secret','password','evidence','credential'))}
            items.append({'id':row.id,'actor_id':row.admin_id,'actor_name':person.nickname if person else None,'actor_public_id':person.public_id if person else None,'role':'FA' if source=='fa_legacy' else details.get('actor_role'),'source':source,'action':row.action,'target_id':row.target_user_id or row.target_room_id or getattr(row,'target_id',None),'details':details,'created_at':stamp(row.created_at)})
        return {'items':items,'next_before':rows[limit-1].id if len(rows)>limit else None}

    @router.get('/signal-reviews')
    def signal_reviews(limit:int=Query(100,ge=1,le=200),db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4)
        return [{'operation_id':r.operation_id,'signal_type':r.signal_type,'status':r.status,'note':r.note,'case_id':r.case_id,'actor_id':r.actor_id,'updated_at':stamp(r.updated_at)} for r in db.scalars(select(ManagementSignalReview).order_by(ManagementSignalReview.updated_at.desc()).limit(limit))]

    @router.post('/signal-reviews')
    def review_signal(payload:SignalReview,db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4)
        operation=db.scalar(select(LidyaOperation).where(LidyaOperation.id==payload.operation_id).with_for_update())
        if not operation:raise HTTPException(404,'İşlem bulunamadı')
        if payload.signal_type not in {x['type'] for x in analyze([operation])} and payload.signal_type!='repeated_pair_operations':raise HTTPException(422,'Bu işlemde belirtilen gösterge bulunmuyor')
        if payload.signal_type=='repeated_pair_operations':
            count=db.scalar(select(func.count()).select_from(LidyaOperation).where(LidyaOperation.admin_id==operation.admin_id,LidyaOperation.user_id==operation.user_id,LidyaOperation.created_at>=at()-timedelta(days=7)))
            if count<10:raise HTTPException(422,'Tekrarlı işlem göstergesi doğrulanamadı')
        if payload.status=='escalated' and not payload.case_id:raise HTTPException(422,'İleri inceleme için olay dosyası seçin')
        if payload.case_id:
            case,_=require_case(db,user,payload.case_id,lock=True);open_only(case)
            if case.target_user_id!=operation.user_id:raise HTTPException(409,'Dosya ve işlem hedefleri eşleşmiyor')
        if payload.status=='cleared' and operation.admin_id==user.id:raise HTTPException(403,'Kendi işleminizin göstergesini bağımsız bir yönetici sonuçlandırmalıdır')
        key=payload.operation_id+':'+payload.signal_type
        row=db.scalar(select(ManagementSignalReview).where(ManagementSignalReview.signal_key==key))
        if row and (row.status,row.note,row.case_id,row.actor_id)==(payload.status,payload.note,payload.case_id,user.id):return {'recorded':True}
        if not row:row=ManagementSignalReview(signal_key=key,operation_id=operation.id,signal_type=payload.signal_type);db.add(row)
        row.status=payload.status;row.note=payload.note;row.case_id=payload.case_id;row.actor_id=user.id;row.updated_at=at()
        audit(db,user,'management_signal_reviewed',{'operation_id':operation.id,'signal_type':payload.signal_type,'status':payload.status,'case_id':payload.case_id,'note':payload.note},operation.user_id)
        if payload.case_id:add_event(db,case,user,'financial_signal',{'operation_id':operation.id,'signal_type':payload.signal_type,'note':payload.note})
        db.commit();return {'recorded':True}
    return router
