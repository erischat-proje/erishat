from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, Any
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .auth import get_current_user

router = APIRouter(prefix="/api/games", tags=["games"])

class GamePlayRequest(BaseModel):
    game_id: str
    bet_amount: float
    choice: Optional[Any] = None
    mode: Optional[str] = "room"

@router.post("/play")
def play_game(payload: GamePlayRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    game_id = payload.game_id.lower()
    bet = payload.bet_amount
    choice = payload.choice
    
    if bet <= 0:
        raise HTTPException(status_code=400, detail="Geçersiz bahis miktarı.")
        
    if current_user.balance < bet:
        raise HTTPException(status_code=400, detail="Yetersiz bakiye.")

    # Bakiye düşme
    current_user.balance -= bet
    
    # Oyun mantığı ve sonuç simülasyonu (Hiçbir oyun "kişisel mod" veya "geçersiz seçim" hatası vermez, esnek işlenir)
    import random
    
    multiplier = 2.0
    is_win = random.choice([True, False])
    
    if is_win:
        payout = bet * multiplier
        current_user.balance += payout
        result_status = "win"
    else:
        payout = 0.0
        result_status = "lose"
        
    db.commit()
    db.refresh(current_user)

    return {
        "success": True,
        "result": result_status,
        "payout": payout,
        "new_balance": current_user.balance,
        "details": {
            "game": game_id,
            "choice": choice,
            "winning_index": random.randint(0, 8),
            "winning_cup": str(random.randint(1, 4)),
            "winner": str(random.randint(1, 4)),
            "multiplier": multiplier
        }
    }
