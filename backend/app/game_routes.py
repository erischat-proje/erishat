from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .auth import get_current_user
from .oyunlar.registry import GameRegistry

router = APIRouter(prefix="/api/games", tags=["games"])

class GamePlayRequest(BaseModel):
    game_id: str
    bet_amount: float
    choice: Optional[Any] = None
    mode: Optional[str] = "room"

@router.post("/play")
def play_game(payload: GamePlayRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if payload.bet_amount <= 0:
        raise HTTPException(status_code=400, detail="Geçersiz bahis miktarı.")
        
    if current_user.balance < payload.bet_amount:
        raise HTTPException(status_code=400, detail="Yetersiz bakiye.")

    # Bahis düşülür
    current_user.balance -= payload.bet_amount

    # Oyun motoru çağrılır (Asla hata patlatmaz, tüm seçimleri ve modları esnek işler)
    outcome = GameRegistry.process_game(payload.game_id, payload.bet_amount, payload.choice, payload.mode)

    if outcome["result"] == "win":
        current_user.balance += outcome["payout"]

    db.commit()
    db.refresh(current_user)

    return {
        "success": True,
        "result": outcome["result"],
        "payout": outcome["payout"],
        "new_balance": current_user.balance,
        "details": outcome["details"]
    }
