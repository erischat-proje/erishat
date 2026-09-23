from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import random
from .db import get_db
from .session import get_user_from_token
from .game_economy import debit_bet, settle_bet

router = APIRouter(prefix="/v1/games/crash", tags=["Crash Game"])

class CrashBetRequest(BaseModel):
    round_id: str
    target_multiplier: float  # Kullanıcının hedeflediği çarpan (örn. 2.0)
    amount: int

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

@router.post("/play")
def play_crash(payload: CrashBetRequest, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    
    if payload.target_multiplier < 1.01:
        raise HTTPException(status_code=400, detail="Hedef çarpan en az 1.01 olmalıdır")
        
    try:
        bet = debit_bet(db, user.id, payload.round_id, str(payload.target_multiplier), payload.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # %50 kazanma dengesi: %50 ihtimalle hedefe ulaşır, %50 ihtimalle 1.00 ile hedef arasında patlar
    is_win = random.random() < 0.50
    if is_win:
        crash_point = round(payload.target_multiplier + random.uniform(0.01, 2.0), 2)
        multiplier = payload.target_multiplier
    else:
        crash_point = round(max(1.00, payload.target_multiplier - random.uniform(0.01, payload.target_multiplier * 0.5)), 2)
        multiplier = 0.0
        
    payout = 0
    if is_win:
        payout = settle_bet(db, bet, multiplier)
        
    db.commit()
    
    return {
        "status": "success",
        "round_id": payload.round_id,
        "user_id": user.id,
        "target_multiplier": payload.target_multiplier,
        "crash_point": crash_point,
        "is_win": is_win,
        "multiplier": multiplier,
        "payout": payout,
        "new_balance": int(user.lidya or 0)
    }
