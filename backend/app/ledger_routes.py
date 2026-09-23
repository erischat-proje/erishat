from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .session import get_user_from_token
from .platform_models import Ledger

router = APIRouter(prefix="/v1/ledger", tags=["Ledger & Economy Audit"])

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

@router.get("/history")
def get_ledger_history(authorization: str | None = None, db: Session = Depends(get_db), limit: int = 50):
    user = get_current_user(authorization, db)
    
    entries = db.scalars(
        select(Ledger)
        .where((Ledger.user_id == user.id) | (Ledger.target_user_id == user.id))
        .order_by(Ledger.created_at.desc())
        .limit(limit)
    ).all()
    
    return {
        "status": "success",
        "user_id": user.id,
        "current_balance": int(user.lidya or 0),
        "transactions": [
            {
                "id": e.id,
                "idempotency_key": e.idempotency_key,
                "module": e.module,
                "action": e.action,
                "amount": e.amount,
                "balance_before": e.balance_before,
                "balance_after": e.balance_after,
                "description": e.description,
                "created_at": str(e.created_at)
            }
            for e in entries
        ]
    }
