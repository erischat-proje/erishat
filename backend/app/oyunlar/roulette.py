from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import random
from .db import get_db
from .session import get_user_from_token
from .game_economy import debit_bet, settle_bet

router = APIRouter(prefix="/v1/games/roulette", tags=["Roulette Game"])

class RouletteBetRequest(BaseModel):
    round_id: str
    choice: str  # "red", "black", "green" veya sayı
    amount: int

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

@router.post("/spin")
def spin_roulette(payload: RouletteBetRequest, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    
    try:
        # Double-spend korumalı bakiye düşme ve bahis kaydı
        bet = debit_bet(db, user.id, payload.round_id, payload.choice, payload.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # %50'ye 50 şans dengesi (Örn: Red/Black için %50 kazanma olasılığı)
    is_win = random.random() < 0.50
    multiplier = 2.0 if is_win else 0.0
    
    winning_choice = payload.choice if is_win else ("black" if payload.choice == "red" else "red")
    
    payout = 0
    if is_win:
        payout = settle_bet(db, bet, multiplier)
        
    db.commit()
    
    return {
        "status": "success",
        "round_id": payload.round_id,
        "user_id": user.id,
        "choice": payload.choice,
        "winning_choice": winning_choice,
        "is_win": is_win,
        "multiplier": multiplier,
        "payout": payout,
        "new_balance": int(user.lidya or 0)
    }
