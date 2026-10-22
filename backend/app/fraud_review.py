"""DA-only review signals based on real persisted manual Lidya operations.
These are not accusations, sanctions, or complete financial reconciliation.
"""
from collections import Counter
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .purchase_models import LidyaOperation
from .finance_audit import require_da

router = APIRouter(prefix="/v1/admin/fraud-review", tags=["admin-fraud-review"])

def analyze(operations):
    """Pure deterministic analysis for a bounded sample. No account mutation."""
    findings=[]
    counts=Counter((o.admin_id,o.user_id) for o in operations)
    for o in operations:
        base={"operation_id":o.id,"target_public_id":o.public_id,"admin_id":o.admin_id}
        if o.amount <= 0:
            findings.append({**base,"type":"nonpositive_amount","level":"review"})
        if o.operation not in ("EKLEME","ÇIKARMA"):
            findings.append({**base,"type":"unknown_operation","level":"review"})
        elif (o.after-o.before) != (o.amount if o.operation=="EKLEME" else -o.amount):
            findings.append({**base,"type":"balance_delta_mismatch","level":"high"})
        if not o.evidence and not o.exemption_sha:
            findings.append({**base,"type":"missing_evidence_reference","level":"review"})
    for (admin_id,user_id),count in counts.items():
        if count>=10:
            representative=next(o for o in operations if o.admin_id==admin_id and o.user_id==user_id)
            findings.append({"operation_id":representative.id,"target_public_id":representative.public_id,"admin_id":admin_id,"target_user_id":user_id,"count_in_sample":count,"type":"repeated_pair_operations","level":"review"})
    return findings

def register_auth(current_user):
    @router.get("/signals")
    def signals(limit:int=Query(500,ge=1,le=1000), db:Session=Depends(get_db), user:User=Depends(current_user)):
        require_da(db,user)
        since=datetime.now(timezone.utc)-timedelta(days=7)
        rows=db.scalars(select(LidyaOperation).where(LidyaOperation.created_at>=since).order_by(LidyaOperation.created_at.desc()).limit(limit+1)).all()
        selected=rows[:limit]
        findings=analyze(selected)
        return {"period_days":7,"scanned":len(selected),"truncated":len(rows)>limit,"findings":findings[:200],"findings_truncated":len(findings)>200,"note":"Only manual operations in bounded sample; human review required. No automatic penalties."}
    return router
