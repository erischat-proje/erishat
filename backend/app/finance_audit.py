"""Read-only, DA-scoped financial oversight. This is NOT an accounting ledger."""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from .admin_models import AdminRole, AdminAuditLog
from .purchase_models import LidyaOperation, LidyaOrder
from .platform_models import VipStatus
from .models import User
from .purchase_routes import decode_document
from .management_events import audit
from .finance_metrics import snapshot

router = APIRouter(prefix='/v1/admin/finance-audit', tags=['admin-finance-audit'])

def require_da(db, user):
    r = db.get(AdminRole,user.id)
    if not user.is_active or not r or r.role!='DA':
        raise HTTPException(status_code=403,detail='DA finansal denetim yetkisi gerekli')

def register_auth(current_user):
    @router.get('/live-snapshot')
    def live_snapshot(response:Response,days:int=Query(7,ge=1,le=90),target:str=Query('',max_length=64),db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);response.headers['Cache-Control']='private, no-store';response.headers['Vary']='Authorization'
        return snapshot(db,days,target.strip())

    @router.get('/overview')
    def overview(response:Response,days:int=Query(7,ge=1,le=90),target:str=Query('',max_length=64),db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);response.headers['Cache-Control']='private, no-store';response.headers['Vary']='Authorization'
        data=snapshot(db,days,target.strip())
        return {'period_days':days,'generated_at':data['generated_at'],'period_start':data['period_start'],'period_end':data['period_end'],'sampled':False,'truncated':False,
            'lidya_added':data['manual']['added'],'lidya_removed':data['manual']['removed'],'scanned_operations':data['manual']['count'],
            'vip_accounts':data['vip_accounts'],'manual_operation_count':db.scalar(select(func.count()).select_from(LidyaOperation).where(LidyaOperation.user_id.in_(select(User.id).where(User.public_id==target.strip())) if target.strip() else True)),
            'order_count':db.scalar(select(func.count()).select_from(LidyaOrder).where(LidyaOrder.user_id.in_(select(User.id).where(User.public_id==target.strip())) if target.strip() else True)),
            'note':data['note']}

    @router.get('/manual-operations')
    def manual_operations(limit:int=Query(50,ge=1,le=100), before:str|None=None,target:str=Query('',max_length=64),db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user)
        q=select(LidyaOperation).order_by(LidyaOperation.created_at.desc(),LidyaOperation.id.desc())
        if target:q=q.where(LidyaOperation.public_id==target)
        if before:
            cursor=db.get(LidyaOperation,before)
            if not cursor: raise HTTPException(404,'Cursor bulunamadı')
            q=q.where((LidyaOperation.created_at<cursor.created_at)|((LidyaOperation.created_at==cursor.created_at)&(LidyaOperation.id<cursor.id)))
        rows=db.scalars(q.limit(limit+1)).all()
        def view(x):
            return {'id':x.id,'admin_role':x.admin_role,'admin_id':x.admin_id,'target_public_id':x.public_id,'operation':x.operation,'amount':str(x.amount),'before':str(x.before),'after':str(x.after),'balanced':(x.after-x.before)==(x.amount if x.operation=='EKLEME' else -x.amount),'evidence_present':bool(x.evidence),'exemption_sha_present':bool(x.exemption_sha),'created_at':x.created_at.isoformat() if x.created_at else None}
        return {'items':[view(x) for x in rows[:limit]],'next_cursor':rows[limit-1].id if len(rows)>limit else None}

    @router.get('/manual-operations/{operation_id}')
    def operation_detail(operation_id:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);row=db.get(LidyaOperation,operation_id)
        if not row:raise HTTPException(404,'İşlem bulunamadı')
        return {'id':row.id,'target_public_id':row.public_id,'admin_id':row.admin_id,'admin_name':row.admin_name,'operation':row.operation,
          'amount':str(row.amount),'before':str(row.before),'after':str(row.after),'balanced':row.after-row.before==(row.amount if row.operation=='EKLEME' else -row.amount),
          'evidence_url':f'/v1/admin/finance-audit/manual-operations/{row.id}/evidence' if row.evidence else None,'created_at':row.created_at.isoformat() if row.created_at else None}

    @router.get('/manual-operations/{operation_id}/evidence')
    def operation_evidence(operation_id:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);row=db.get(LidyaOperation,operation_id)
        if not row or not row.evidence:raise HTTPException(404,'İşlem kanıtı bulunamadı')
        try:data,mime=decode_document(row.evidence)
        except ValueError:raise HTTPException(422,'Eski kanıt dosyası görüntülenemiyor')
        audit(db,user,'management_operation_evidence_viewed',{'operation_id':row.id},row.user_id);db.commit()
        return Response(data,media_type=mime,headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"})

    @router.get('/orders')
    def order_history(limit:int=Query(30,ge=1,le=100),before:str|None=None,target:str=Query('',max_length=64),db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);query=select(LidyaOrder)
        if target:query=query.where(LidyaOrder.user_id.in_(select(User.id).where(User.public_id==target)))
        if before:
            cursor=db.get(LidyaOrder,before)
            if not cursor:raise HTTPException(404,'Önceki sipariş kaydı bulunamadı')
            query=query.where((LidyaOrder.created_at<cursor.created_at)|((LidyaOrder.created_at==cursor.created_at)&(LidyaOrder.id<cursor.id)))
        rows=list(db.scalars(query.order_by(LidyaOrder.created_at.desc(),LidyaOrder.id.desc()).limit(limit+1)))
        items=[]
        for row in rows[:limit]:
            person=db.get(User,row.user_id)
            items.append({'id':row.id,'public_id':person.public_id if person else None,'nickname':person.nickname if person else None,'status':row.status,'total':str(row.total),'created_at':row.created_at.isoformat() if row.created_at else None,'decided_at':row.decided_at.isoformat() if row.decided_at else None})
        return {'items':items,'next_cursor':rows[limit-1].id if len(rows)>limit else None}

    @router.get('/vip')
    def vip_history(limit:int=Query(30,ge=1,le=100),before:str|None=None,target:str=Query('',max_length=64),db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);query=select(VipStatus).where(VipStatus.level>0)
        if target:query=query.where(VipStatus.user_id.in_(select(User.id).where(User.public_id==target)))
        if before:query=query.where(VipStatus.user_id>before)
        rows=list(db.scalars(query.order_by(VipStatus.user_id).limit(limit+1)))
        items=[]
        for row in rows[:limit]:
            person=db.get(User,row.user_id)
            items.append({'public_id':person.public_id if person else None,'nickname':person.nickname if person else None,'level':row.level,'updated_at':row.updated_at.isoformat() if row.updated_at else None})
        return {'items':items,'next_cursor':rows[limit-1].user_id if len(rows)>limit else None}

    @router.get('/alerts')
    def alerts(db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user)
        recent=db.scalars(select(LidyaOperation).order_by(LidyaOperation.created_at.desc()).limit(500)).all()
        findings=[]
        for op in recent:
            expected=op.amount if op.operation=='EKLEME' else -op.amount
            if op.after-op.before!=expected:
                findings.append({'operation_id':op.id,'kind':'amount_mismatch','severity':'high'})
            if not op.evidence and not op.exemption_sha:
                findings.append({'operation_id':op.id,'kind':'missing_evidence_reference','severity':'review'})
            if op.admin_role!='DA':
                findings.append({'operation_id':op.id,'kind':'legacy_non_da_operation','severity':'review'})
        return {'findings':findings[:100], 'scanned':len(recent),'truncated':len(recent)==500,'note':'Indicators require human review; historical operations may predate current policy.'}
    return router
