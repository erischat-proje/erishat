"""Read-only, DA-scoped financial oversight. This is NOT an accounting ledger."""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from .admin_models import AdminRole, AdminAuditLog
from .purchase_models import LidyaOperation, LidyaOrder
from .platform_models import VipStatus
from .models import User

router = APIRouter(prefix='/v1/admin/finance-audit', tags=['admin-finance-audit'])

def require_da(db, user):
    r = db.get(AdminRole,user.id)
    if not user.is_active or not r or r.role!='DA':
        raise HTTPException(status_code=403,detail='DA finansal denetim yetkisi gerekli')

def register_auth(current_user):
    @router.get('/overview')
    def overview(db: Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user)
        since=datetime.now(timezone.utc)-timedelta(days=7)
        ops=db.scalars(select(LidyaOperation).where(LidyaOperation.created_at>=since).order_by(LidyaOperation.created_at.desc()).limit(1000)).all()
        deposits=sum(x.amount for x in ops if x.operation=='EKLEME')
        withdrawals=sum(x.amount for x in ops if x.operation=='ÇIKARMA')
        return {'period_days':7,'scanned_operations':len(ops),'truncated':len(ops)==1000,'lidya_added_sample':deposits,'lidya_removed_sample':withdrawals,'vip_accounts':db.scalar(select(func.count()).select_from(VipStatus).where(VipStatus.level>0)), 'manual_operation_count':db.scalar(select(func.count()).select_from(LidyaOperation)), 'order_count':db.scalar(select(func.count()).select_from(LidyaOrder)),'note':'Sample values are NOT platform-wide aggregates or financial reconciliation.'}

    @router.get('/manual-operations')
    def manual_operations(limit:int=Query(50,ge=1,le=100), before:str|None=None,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user)
        q=select(LidyaOperation).order_by(LidyaOperation.created_at.desc(),LidyaOperation.id.desc())
        if before:
            cursor=db.get(LidyaOperation,before)
            if not cursor: raise HTTPException(404,'Cursor bulunamadı')
            q=q.where((LidyaOperation.created_at<cursor.created_at)|((LidyaOperation.created_at==cursor.created_at)&(LidyaOperation.id<cursor.id)))
        rows=db.scalars(q.limit(limit+1)).all()
        def view(x):
            return {'id':x.id,'admin_role':x.admin_role,'admin_id':x.admin_id,'target_public_id':x.public_id,'operation':x.operation,'amount':x.amount,'before':x.before,'after':x.after,'balanced':(x.after-x.before)==(x.amount if x.operation=='EKLEME' else -x.amount),'evidence_present':bool(x.evidence),'exemption_sha_present':bool(x.exemption_sha),'created_at':x.created_at.isoformat() if x.created_at else None}
        return {'items':[view(x) for x in rows[:limit]],'next_cursor':rows[limit-1].id if len(rows)>limit else None}

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
