from uuid import uuid4
from datetime import datetime, timezone

from sqlalchemy.orm import Session
# Google id_token imported lazily

from .config import settings

from .models import User, AuthIdentity
from .system_data import UserIdRegistry
from .system_logs import record
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
    record("user_id", "user_public_id_created", user_id=created.id, public_id=created.public_id, nickname=created.nickname)
    db.commit()
    return created



def create_or_login_verified_identity(
    db: Session,
    provider: str,
    identifier: str,
    ip: str | None = None,
    device_info: str | None = None,
) -> User:
    identifier = identifier.strip().lower() if provider == "email" else identifier.strip()

    identity = (
        db.query(AuthIdentity)
        .filter(
            AuthIdentity.provider == provider,
            AuthIdentity.identifier == identifier,
        )
        .first()
    )

    if identity is not None:
        user = db.get(User, identity.user_id)
        if user is None or not user.is_active:
            raise ValueError("Hesap bulunamadı veya devre dışı")

        identity.verified_at = datetime.now(timezone.utc)
        user.last_ip = ip
        user.device_info = device_info
        db.commit()
        db.refresh(user)
        return user

    nickname = (
        identifier.split("@", 1)[0]
        if provider == "email"
        else f"Eris Kullanıcısı {identifier[-4:]}"
    )
    nickname = nickname.strip()[:32] or "Eris Kullanıcısı"

    user = User(
        id=uuid4().hex,
        public_id="",
        nickname=nickname,
        avatar="👤",
        gender="unspecified",
        last_ip=ip,
        device_info=device_info,
    )

    while True:
        public_id = f"{uuid4().int % 10_000_000_000:010d}"
        if (
            not db.query(User).filter(User.public_id == public_id).first()
            and not db.query(UserIdRegistry).filter(UserIdRegistry.public_id == public_id).first()
        ):
            user.public_id = public_id
            break

    db.add(user)
    db.flush()

    db.add(
        AuthIdentity(
            id=uuid4().hex,
            user_id=user.id,
            provider=provider,
            provider_subject=identifier,
            identifier=identifier,
            verified_at=datetime.now(timezone.utc),
        )
    )
    db.add(UserIdRegistry(user_id=user.id, public_id=user.public_id))

    record(
        "user_id",
        f"{provider}_user_created",
        user_id=user.id,
        public_id=user.public_id,
        nickname=user.nickname,
        identifier=identifier,
    )

    db.commit()
    db.refresh(user)
    return user

# Import after the auth definitions so the family route bootstrap can safely
# wrap platform route registration without changing main.py.
from . import family_bootstrap as _family_bootstrap  # noqa: E402,F401


def create_or_login_google_user(
    db: Session,
    credential: str,
    ip: str | None = None,
    device_info: str | None = None,
) -> User:
    if not settings.google_client_id:
        raise ValueError("Google kayıt sistemi henüz yapılandırılmadı")
    try:

        claims = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception as exc:
        raise ValueError("Google kimlik doğrulaması geçersiz") from exc

    google_sub = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip().lower()
    if not google_sub or not email:
        raise ValueError("Google hesabından gerekli kimlik bilgileri alınamadı")
    if claims.get("email_verified") is False:
        raise ValueError("Google e-posta adresi doğrulanmamış")

    user = db.query(User).filter(User.google_sub == google_sub).first()
    if user is None:
        nickname = str(claims.get("name") or email.split("@", 1)[0]).strip()[:32] or "Eris Kullanıcısı"
        user = User(
            id=uuid4().hex,
            public_id="",
            nickname=nickname,
            avatar="👤",
            gender="unspecified",
            google_sub=google_sub,
            google_email=email,
            last_ip=ip,
            device_info=device_info,
        )
        while True:
            public_id = f"{uuid4().int % 10_000_000_000:010d}"
            if not db.query(User).filter(User.public_id == public_id).first() and not db.query(UserIdRegistry).filter(UserIdRegistry.public_id == public_id).first():
                user.public_id = public_id
                break
        db.add(user)
        db.add(AuthIdentity(id=uuid4().hex, user_id=user.id, provider="google", provider_subject=google_sub, identifier=email, verified_at=datetime.now(timezone.utc)))
        db.flush()
        db.add(UserIdRegistry(user_id=user.id, public_id=user.public_id))
        record("user_id", "google_user_created", user_id=user.id, public_id=user.public_id, nickname=user.nickname, google_email=email)
    else:
        if not user.is_active:
            raise ValueError("Hesap devre dışı")
        if not db.query(AuthIdentity).filter(AuthIdentity.provider == "google", AuthIdentity.provider_subject == google_sub).first():
            db.add(AuthIdentity(id=uuid4().hex, user_id=user.id, provider="google", provider_subject=google_sub, identifier=email, verified_at=datetime.now(timezone.utc)))
        user.google_email = email
        user.last_ip = ip
        user.device_info = device_info

    allowed = {x.strip().lower() for x in settings.initial_da_google_emails.split(",") if x.strip()}
    if email in allowed:
        from .admin_models import AdminRole
        role = db.get(AdminRole, user.id)
        if not role:
            db.add(AdminRole(user_id=user.id, role="DA"))
            record("role", "google_initial_da_grant", target_user_id=user.id, google_email=email, role="DA")

    db.commit()
    db.refresh(user)
    return user
