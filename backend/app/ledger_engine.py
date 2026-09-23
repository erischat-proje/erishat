from __future__ import annotations
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import User
from .platform_models import Ledger

def process_ledger_transaction(
    db: Session,
    user_id: str,
    module: str,         # "gift", "vip", "room", "family", "music", "game"
    action: str,         # "debit", "credit", "transfer"
    amount: int,
    idempotency_key: str,
    target_user_id: str | None = None,
    description: str | None = None
) -> Ledger:
    amount = int(amount)
    if amount < 0:
        raise ValueError("İşlem miktarı negatif olamaz")
        
    # 1. Idempotency kontrolü (Mükerrer işlem engeli)
    existing = db.scalar(
        select(Ledger).where(Ledger.idempotency_key == idempotency_key)
    )
    if existing:
        return existing  # Daha önce yapılmış işlemi aynen döndür (Idempotent)
        
    # 2. Pessimistic locking ile kullanıcıyı kilitle
    user = db.scalar(
        select(User).where(User.id == user_id).with_for_update()
    )
    if not user:
        raise ValueError("Kullanıcı bulunamadı")
        
    current_balance = int(user.lidya or 0)
    
    # 3. İşlem türüne göre bakiye hesabı ve Negatif Bakiye / Double-spend kontrolü
    if action in ["debit", "transfer"]:
        if current_balance < amount:
            raise ValueError("Yetersiz Lidya (Negatif bakiye engellendi)")
        new_balance = current_balance - amount
    elif action == "credit":
        new_balance = current_balance + amount
    else:
        raise ValueError(f"Geçersiz ledger aksiyonu: {action}")
        
    user.lidya = new_balance
    
    # 4. Ledger kaydı oluştur (Audit Trail)
    ledger_entry = Ledger(
        idempotency_key=idempotency_key,
        user_id=user_id,
        target_user_id=target_user_id,
        module=module,
        action=action,
        amount=amount,
        balance_before=current_balance,
        balance_after=new_balance,
        description=description
    )
    
    db.add(ledger_entry)
    db.flush()
    return ledger_entry
