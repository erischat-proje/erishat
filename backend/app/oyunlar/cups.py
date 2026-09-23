from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import random
from .db import get_db
from .session import get_user_from_token
from .game_economy import debit_bet, settle_bet

router = APIRouter(prefix="/v1/games/cups", tags=["Cups Game"])

class CupsBetRequest(BaseModel):
    round_id: str
    choice: int  # 1, 2, 3 veya 4 (Seçilen kupa)
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
def play_cups(payload: CupsBetRequest, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    
    if payload.choice not in [1, 2, 3, 4]:
        raise HTTPException(status_code=400, detail="Geçersiz kupa seçimi (1-4 arası olmalı)")
    
    try:
        bet = debit_bet(db, user.id, payload.round_id, str(payload.choice), payload.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # %50 kazanma ihtimali için 2 kupadan birini doğru yapma simülasyonu
    is_win = random.random() < 0.50
    winning_cup = payload.choice if is_win else random.choice([c for c in [1, 2, 3, 4] if c != payload.choice])
    
    multiplier = 2.0 if is_win else 0.0
    payout = 0
    if is_win:
        payout = settle_bet(db, bet, multiplier)
        
    db.commit()
    
    return {
        "status": "success",
        "round_id": payload.round_id,
        "user_id": user.id,
        "chosen_cup": payload.choice,
        "winning_cup": winning_cup,
        "is_win": is_win,
        "multiplier": multiplier,
        "payout": payout,
        "new_balance": int(user.lidya or 0)
    }
