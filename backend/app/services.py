import hashlib
import secrets
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models import User, Room, Message, VipReward, CosmeticItem

class AuthService:
    @staticmethod
    def hash_password(password: str) -> str:
        return hashlib.sha256(password.encode()).hexdigest()

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        return AuthService.hash_password(plain_password) == hashed_password

class EconomyService:
    @staticmethod
    def add_balance(db: Session, user_id: int, amount: int):
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.balance = getattr(user, 'balance', 0) + amount
            db.commit()
            db.refresh(user)
        return user

class VipService:
    @staticmethod
    def claim_vip_reward(db: Session, user_id: int, reward_key: str) -> bool:
        # Çift ödül koruması (Double-award prevention)
        existing = db.query(VipReward).filter(
            VipReward.user_id == user_id, 
            VipReward.reward_key == reward_key
        ).first()
        
        if existing:
            return False # Zaten alınmış
        
        new_reward = VipReward(user_id=user_id, reward_key=reward_key, claimed_at=datetime.utcnow())
        db.add(new_reward)
        db.commit()
        return True
