from uuid import uuid4

from sqlalchemy.orm import Session

from .models import User
from .system_data import UserIdRegistry
from .repositories import UserRepository


def create_anonymous_user(
    db: Session,
    nickname: str,
    avatar: str = "👤",
    gender: str = "",
) -> User:
    nickname = nickname.strip()[:32]
    if not nickname:
        raise ValueError("nickname boş olamaz")
    if gender not in {"female", "male"}:
        raise ValueError("Kayıt sırasında kadın veya erkek seçilmelidir")

    while True:
        public_id = f"{uuid4().int % 10_000_000_000:010d}"
        existing = db.query(User).filter(User.public_id == public_id).first()
        registry = db.query(UserIdRegistry).filter(UserIdRegistry.public_id == public_id).first()
        if not existing and not registry:
            break

    user = User(
        id=uuid4().hex,
        public_id=public_id,
        nickname=nickname,
        avatar=avatar[:16],
        gender=gender,
    )
    created = UserRepository(db).create(user)
    db.add(UserIdRegistry(user_id=created.id, public_id=created.public_id))
    db.commit()
    return created


# Import after the auth definitions so the family route bootstrap can safely
# wrap platform route registration without changing main.py.
from . import family_bootstrap as _family_bootstrap  # noqa: E402,F401
