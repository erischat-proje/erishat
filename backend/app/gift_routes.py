from __future__ import annotations
from .ledger_models import LedgerEntry
from .models import Wallet
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .ledger_engine import process_ledger_transaction
from .gift_models import GiftItem, GiftTransaction, UserProfileGift, GiftAuditLog

router = APIRouter(prefix="/gifts", tags=["Gift System"])

class SendGiftRequest(BaseModel):
    sender_id: int
    receiver_id: int
    gift_id: int
    quantity: int = 1
    room_id: int | None = None
    idempotency_key: str | None = None

@router.on_event("startup")
def seed_gifts():
    # 200 Hediye Kataloğu Başlangıç Tohum Verisi (Genişletilmiş Kademe Mimarisi)
    db = next(get_db())
    try:
        count = db.query(GiftItem).count()
        if count < 200:
            # Temel başlangıç simülasyonu ile 200 çeşit hediye üretelim
            categories = [
                ("Gül", 10, 1, "none"),
                ("Kalp", 25, 2, "none"),
                ("Çikolata", 50, 3, "standard"),
                ("Ayıcık", 100, 4, "standard"),
                ("Parfüm", 250, 5, "standard"),
                ("Akıllı Saat", 500, 6, "high"),
                ("Spor Araba", 1000, 7, "high"),
                ("Yat", 2500, 8, "announcement"),
                ("Özel Jet", 5000, 9, "announcement"),
                ("Eris Kalesi", 10000, 10, "announcement")
            ]
            
            # 200 hediyeyi dinamik olarak türetelim
            gift_id_counter = 1
            for cat_name, base_price, tier, anim in categories:
                for i in range(1, 21): # Her kategoriden 20 varyasyon = 200 hediye
                    name = f"{cat_name} #{i}"
                    price = base_price * i
                    # Kademeye göre animasyon seviyesi
                    actual_tier = min(10, tier + (i // 5))
                    actual_anim = "announcement" if actual_tier >= 8 else ("high" if actual_tier >= 6 else ("standard" if actual_tier >= 3 else "none"))
                    
                    existing = db.query(GiftItem).filter(GiftItem.name == name).first()
                    if not existing:
                        item = GiftItem(
                            name=name,
                            price=price,
                            tier=actual_tier,
                            animation_level=actual_anim
                        )
                        db.add(item)
            db.commit()
    finally:
        db.close()

@router.get("/catalog")
def get_gift_catalog(db: Session = Depends(get_db)):
    gifts = db.query(GiftItem).all()
    return {"status": "success", "count": len(gifts), "catalog": [{"id": g.id, "name": g.name, "price": g.price, "tier": g.tier, "animation_level": g.animation_level} for g in gifts]}

@router.post("/send")
def send_gift(payload: SendGiftRequest, db: Session = Depends(get_db)):
    # 70. Kendine hediye gönderme engeli
    if payload.sender_id == payload.receiver_id:
        raise HTTPException(status_code=400, detail="Kendinize hediye gönderemezsiniz.")
        
    if payload.quantity < 1 or payload.quantity > 99:
        raise HTTPException(status_code=400, detail="Hediye adedi 1 ile 99 arasında olmalıdır.")

    # 90. Tekrar işlenmeyi önleme (Idempotency Key kontrolü)
    if payload.idempotency_key:
        existing_tx = db.query(GiftTransaction).filter(GiftTransaction.idempotency_key == payload.idempotency_key).first()
        if existing_tx:
            return {"status": "success", "message": "Bu hediye işlemi daha önce zaten gerçekleştirildi.", "transaction_id": existing_tx.id}

    # Hediyeyi ve fiyatı doğrula
    gift = db.query(GiftItem).filter(GiftItem.id == payload.gift_id).first()
    if not gift:
        raise HTTPException(status_code=404, detail="Hediye bulunamadı.")

    total_cost = gift.price * payload.quantity

    # Gönderen cüzdanı kontrol et (Wallet & Row-Level Locking)
    sender_wallet = db.query(Wallet).filter(Wallet.user_id == payload.sender_id).with_for_update().first()
    if not sender_wallet or sender_wallet.balance < total_cost:
        raise HTTPException(status_code=400, detail="Yetersiz bakiye.")

    receiver_wallet = db.query(Wallet).filter(Wallet.user_id == payload.receiver_id).with_for_update().first()
    if not receiver_wallet:
        # Alıcının cüzdanı yoksa otomatik oluştur
        receiver_wallet = Wallet(user_id=payload.receiver_id, balance=0)
        db.add(receiver_wallet)
        db.flush()

    # Bakiye transferleri
    sender_wallet.balance -= total_cost
    receiver_wallet.balance += total_cost # Veya komisyonlu model

    # Transaction kaydı
    tx = GiftTransaction(
        sender_id=payload.sender_id,
        receiver_id=payload.receiver_id,
        room_id=payload.room_id,
        gift_id=payload.gift_id,
        quantity=payload.quantity,
        total_price=total_cost,
        idempotency_key=payload.idempotency_key
    )
    db.add(tx)
    db.flush()

    # Ledger (Defter) kayıtları
    ledger_sender = LedgerEntry(user_id=payload.sender_id, amount=-total_cost, description=f"Hediye Gönderildi: {gift.name} x{payload.quantity}")
    ledger_receiver = LedgerEntry(user_id=payload.receiver_id, amount=total_cost, description=f"Hediye Alındı: {gift.name} x{payload.quantity}")
    db.add(ledger_sender)
    db.add(ledger_receiver)

    # Profil Hediyeleri Güncellemesi
    profile_gift = db.query(UserProfileGift).filter(
        UserProfileGift.user_id == payload.receiver_id,
        UserProfileGift.user_id == payload.receiver_id, # user_id ve gift_id
        UserProfileGift.gift_id == payload.gift_id
    ).first()
    
    if profile_gift:
        profile_gift.count += payload.quantity
    else:
        new_pg = UserProfileGift(user_id=payload.receiver_id, gift_id=payload.gift_id, count=payload.quantity)
        db.add(new_pg)

    # 91. Audit Log
    audit = GiftAuditLog(
        transaction_id=tx.id,
        details=f"Sender: {payload.sender_id}, Receiver: {payload.receiver_id}, Gift: {gift.name}, Total: {total_cost}"
    )
    db.add(audit)
    db.commit()

    # Kademe ve Duyuru Bilgisi
    announcement_required = gift.tier >= 8

    return {
        "status": "success",
        "message": f"{gift.name} x{payload.quantity} başarıyla gönderildi!",
        "transaction_id": tx.id,
        "tier": gift.tier,
        "animation_level": gift.animation_level,
        "special_announcement": announcement_required
    }

@router.get("/profile/{user_id}")
def get_user_profile_gifts(user_id: int, db: Session = Depends(get_db)):
    gifts = db.query(UserProfileGift).filter(UserProfileGift.user_id == user_id).all()
    return {"status": "success", "profile_gifts": [{"gift_id": g.gift_id, "count": g.count} for g in gifts]}
