from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict, Any, Optional
from pydantic import BaseModel
from .auth import get_current_user
from .db import get_db
from .oyunlar.registry import get_engine, is_room_game, is_private_game

router = APIRouter(prefix="/games", tags=["games"])

class PlayRequest(BaseModel):
    room_id: Optional[str] = None
    choice: Optional[str] = "auto"
    stake: Optional[int] = 0

class ActionRequest(BaseModel):
    action: str

@router.post("/{game_type}/play")
async def play_game(game_type: str, req: PlayRequest, user: Dict[str, Any] = Depends(get_current_user), db = Depends(get_db)):
    try:
        engine = get_engine(game_type)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    user_id = user.get("id") or user.get("username")
    stake = max(0, int(req.stake or 0))
    
    # Bakiye kontrolü (Eğer bahis varsa)
    if stake > 0:
        cursor = db.cursor()
        cursor.execute("SELECT lidya FROM users WHERE id = ? OR username = ?", (user_id, user_id))
        row = cursor.fetchone()
        current_balance = row[0] if row else 0
        if current_balance < stake:
            raise HTTPException(status_code=400, detail="Yetersiz Lidya bakiyesi.")
        cursor.execute("UPDATE users SET lidya = lidya - ? WHERE id = ? OR username = ?", (stake, user_id, user_id))
        db.commit()

    # Oyun motorunu çalıştır
    try:
        if hasattr(engine, "play"):
            result = engine.play(user_id=user_id, choice=req.choice, stake=stake, room_id=req.room_id, db=db)
        else:
            # Standart simülasyon/oyun çalıştırma mantığı
            result = {"result": req.choice, "payout": stake * 2 if stake > 0 else 0, "data": {}}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Oyun hatası: {str(err)}")

    # Kazanç ekleme
    payout = result.get("payout", 0)
    if payout > 0 and stake > 0:
        cursor = db.cursor()
        cursor.execute("UPDATE users SET lidya = lidya + ? WHERE id = ? OR username = ?", (payout, user_id, user_id))
        db.commit()

    return {
        "status": "success",
        "game": game_type,
        "result": result.get("result"),
        "stake": stake,
        "payout": payout,
        "data": result.get("data", {})
    }

@router.post("/blackjack/{round_id}/action")
async def blackjack_action(round_id: str, req: ActionRequest, user: Dict[str, Any] = Depends(get_current_user), db = Depends(get_db)):
    try:
        engine = get_engine("blackjack")
        if not hasattr(engine, "handle_action"):
            raise HTTPException(status_code=400, detail="Blackjack aksiyonları desteklenmiyor.")
        
        user_id = user.get("id") or user.get("username")
        res = engine.handle_action(round_id=round_id, action=req.action, user_id=user_id, db=db)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
