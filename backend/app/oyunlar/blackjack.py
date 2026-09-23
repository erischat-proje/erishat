from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import random
from .db import get_db
from .session import get_user_from_token
from .game_economy import debit_bet, settle_bet

router = APIRouter(prefix="/v1/games/blackjack", tags=["Blackjack Game"])

class BlackjackStartRequest(BaseModel):
    round_id: str
    amount: int

class BlackjackActionRequest(BaseModel):
    round_id: str
    action: str  # "hit" veya "stand"

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

@router.post("/start")
def start_blackjack(payload: BlackjackStartRequest, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    
    try:
        bet = debit_bet(db, user.id, payload.round_id, "blackjack_start", payload.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    db.commit()
    
    # İlk kartlar (Örn: Oyuncu 15, Dealer 17)
    player_cards = [random.randint(2, 10), random.randint(2, 10)]
    dealer_cards = [random.randint(6, 10), random.randint(2, 10)]
    
    return {
        "status": "success",
        "round_id": payload.round_id,
        "user_id": user.id,
        "player_cards": player_cards,
        "player_score": sum(player_cards),
        "dealer_card": dealer_cards[0],
        "message": "Blackjack eli başladı. Hit veya Stand yapabilirsiniz.",
        "new_balance": int(user.lidya or 0)
    }

@router.post("/action")
def blackjack_action(payload: BlackjackActionRequest, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    
    if payload.action not in ["hit", "stand"]:
        raise HTTPException(status_code=400, detail="Geçersiz aksiyon (hit veya stand olmalı)")
        
    # Bahis kaydını bul ve %50 şans dengesiyle sonuçlandır
    from sqlalchemy import select
    from .platform_models import GameBet
    
    bet = db.scalar(
        select(GameBet)
        .where(GameBet.round_id == payload.round_id, GameBet.user_id == user.id)
        .order_by(GameBet.id.desc())
        .limit(1)
    )
    if not bet:
        raise HTTPException(status_code=404, detail="Bu round için aktif bahis bulunamadı")
        
    is_win = random.random() < 0.50
    multiplier = 2.0 if is_win else 0.0
    
    payout = 0
    if is_win:
        payout = settle_bet(db, bet, multiplier)
        
    db.commit()
    
    return {
        "status": "success",
        "round_id": payload.round_id,
        "user_id": user.id,
        "action": payload.action,
        "is_win": is_win,
        "multiplier": multiplier,
        "payout": payout,
        "new_balance": int(user.lidya or 0)
    }
