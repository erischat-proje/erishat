from uuid import uuid4

from sqlalchemy.orm import Session

from .models import User
from .repositories import UserRepository


def create_anonymous_user(db: Session, nickname: str, avatar: str = "👤") -> User:
    nickname = nickname.strip()[:32]
    if not nickname:
        raise ValueError("nickname boş olamaz")

    while True:
        public_id = f"@eris_{uuid4().int % 100000:05d}"
        existing = db.query(User).filter(User.public_id == public_id).first()
        if not existing:
            break

    user = User(
        id=uuid4().hex,
        public_id=public_id,
        nickname=nickname,
        avatar=avatar[:16],
    )
    return UserRepository(db).create(user)
