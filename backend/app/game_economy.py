from __future__ import annotations
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import User
from .platform_models import GameBet
from .ledger_engine import process_ledger_transaction

def lock_user(db: Session, user_id: str) -> User:
    user = db.scalar(
        select(User)
        .where(User.id == user_id)
        .with_for_update()
    )
    if not user:
        raise ValueError("Kullanıcı bulunamadı")
    return user

def existing_bet(
    db: Session,
    round_id: str,
    user_id: str,
) -> GameBet | None:
    return db.scalar(
        select(GameBet)
        .where(
            GameBet.round_id == round_id,
            GameBet.user_id == user_id,
        )
        .order_by(GameBet.id.desc())
        .limit(1)
    )

def debit_bet(
    db: Session,
    user_id: str,
    round_id: str,
    choice: str,
    amount: int,
) -> GameBet:
    amount = int(amount)
    if amount < 1:
        raise ValueError("Geçersiz bahis miktarı")

    existing = existing_bet(db, round_id, user_id)
    if existing:
        raise ValueError("Bu round için zaten bahis verilmiş")

    # Merkezi Ledger üzerinden debit (borçlandırma) işlemi (Idempotent & Atomic)
    idempotency_key = f"game_debit_{round_id}_{user_id}"
    process_ledger_transaction(
        db=db,
        user_id=user_id,
        module="game",
        action="debit",
        amount=amount,
        idempotency_key=idempotency_key,
        description=f"Game round {round_id} bet"
    )

    bet = GameBet(
        round_id=round_id,
        user_id=user_id,
        choice=choice,
        amount=amount,
        payout=0,
    )
    db.add(bet)
    db.flush()
    return bet

def calculate_payout(amount: int, multiplier: float) -> int:
    amount = int(amount)
    multiplier = float(multiplier)
    if amount < 1:
        raise ValueError("Geçersiz bahis miktarı")
    if multiplier < 0:
        raise ValueError("Geçersiz çarpan")
    return int(round(amount * multiplier))

def settle_bet(
    db: Session,
    bet: GameBet,
    multiplier: float,
) -> int:
    payout = calculate_payout(bet.amount, multiplier)
    if payout > 0:
        idempotency_key = f"game_settle_{bet.round_id}_{bet.user_id}"
        process_ledger_transaction(
            db=db,
            user_id=bet.user_id,
            module="game",
            action="credit",
            amount=payout,
            idempotency_key=idempotency_key,
            description=f"Game round {bet.round_id} payout"
        )
    
    bet.payout = payout
    db.flush()
    return payout
