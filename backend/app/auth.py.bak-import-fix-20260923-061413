from uuid import uuid4
import requests
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from .config import settings

from .models import User, AuthIdentity
from .system_data import UserIdRegistry
from .system_logs import record
from .repositories import UserRepository

import jwt



def verify_apple_authorization_code(code: str) -> dict:
    """Apple authorization code'unu Apple sunucusunda doğrular."""
    code = code.strip()

    if not code:
        raise ValueError("Apple authorization code boş olamaz")

    if not settings.apple_client_id or not settings.apple_client_secret:
        raise ValueError("Apple giriş servisi henüz yapılandırılmadı")

    data = {
        "client_id": settings.apple_client_id,
        "client_secret": settings.apple_client_secret,
        "code": code,
        "grant_type": "authorization_code",
    }

    if settings.apple_redirect_uri:
        data["redirect_uri"] = settings.apple_redirect_uri

    try:
        response = requests.post(
            "https://appleid.apple.com/auth/token",
            data=data,
            timeout=10,
        )
    except requests.RequestException as exc:
        raise ValueError("Apple doğrulama servisine ulaşılamadı") from exc

    if response.status_code != 200:
        raise ValueError("Apple authorization code geçersiz veya süresi dolmuş")

    try:
        payload = response.json()
    except ValueError as exc:
        raise ValueError("Apple doğrulama yanıtı geçersiz") from exc

    id_token = payload.get("id_token")
    if not id_token:
        raise ValueError("Apple identity token alınamadı")

    try:
        # Apple'ın /auth/token cevabındaki ID token imzasını doğrulamak
        # için Apple JWK endpointinden anahtarları alıyoruz.
        keys_response = requests.get(
            "https://appleid.apple.com/auth/keys",
            timeout=10,
        )
        keys_response.raise_for_status()
        jwks = keys_response.json()

        header = jwt.get_unverified_header(id_token)
        key = next(
            (
                item
                for item in jwks.get("keys", [])
                if item.get("kid") == header.get("kid")
            ),
            None,
        )

        if not key:
            raise ValueError("Apple signing key bulunamadı")

        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)

        claims = jwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=settings.apple_client_id,
            issuer="https://appleid.apple.com",
        )
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Apple identity token doğrulanamadı") from exc

    subject = str(claims.get("sub") or "").strip()
    if not subject:
        raise ValueError("Apple kullanıcı kimliği alınamadı")

    email = claims.get("email")
    if email:
        email = str(email).strip().lower()

    return {
        "sub": subject,
        "email": email,
        "email_verified": claims.get("email_verified") in (True, "true", "1"),
    }


def verify_facebook_access_token(access_token: str) -> dict:
    """Facebook access tokenını Meta Graph API üzerinden doğrular."""
    access_token = access_token.strip()

    if not access_token:
        raise ValueError("Facebook access token boş olamaz")

    if not settings.facebook_app_id or not settings.facebook_app_secret:
        raise ValueError("Facebook giriş servisi henüz yapılandırılmadı")

    app_access_token = (
        f"{settings.facebook_app_id}|{settings.facebook_app_secret}"
    )

    try:
        debug_response = requests.get(
            "https://graph.facebook.com/debug_token",
            params={
                "input_token": access_token,
                "access_token": app_access_token,
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        raise ValueError("Facebook doğrulama servisine ulaşılamadı") from exc

    if debug_response.status_code != 200:
        raise ValueError("Facebook access token doğrulanamadı")

    try:
        debug_data = debug_response.json().get("data", {})
    except ValueError as exc:
        raise ValueError("Facebook doğrulama yanıtı geçersiz") from exc

    if not debug_data.get("is_valid"):
        raise ValueError("Facebook access token geçersiz")

    if str(debug_data.get("app_id") or "") != str(settings.facebook_app_id):
        raise ValueError("Facebook token farklı bir uygulamaya ait")

    provider_subject = str(debug_data.get("user_id") or "").strip()
    if not provider_subject:
        raise ValueError("Facebook kullanıcı kimliği alınamadı")

    try:
        user_response = requests.get(
            f"https://graph.facebook.com/{provider_subject}",
            params={
                "fields": "id,name,email",
                "access_token": access_token,
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        raise ValueError("Facebook kullanıcı bilgisi alınamadı") from exc

    if user_response.status_code != 200:
        raise ValueError("Facebook kullanıcı bilgisi doğrulanamadı")

    try:
        user_data = user_response.json()
    except ValueError as exc:
        raise ValueError("Facebook kullanıcı yanıtı geçersiz") from exc

    if str(user_data.get("id") or "") != provider_subject:
        raise ValueError("Facebook kullanıcı kimliği doğrulanamadı")

    email = user_data.get("email")
    if email:
        email = str(email).strip().lower()

    return {
        "sub": provider_subject,
        "email": email,
        "nickname": str(user_data.get("name") or "").strip()[:32] or None,
    }


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


def create_or_login_external_identity(
    db: Session,
    *,
    provider: str,
    provider_subject: str,
    email: str | None = None,
    nickname: str | None = None,
    ip: str | None = None,
    device_info: str | None = None,
) -> User:
    """
    Doğrulanmış harici kimlik sağlayıcıları için ortak giriş/kayıt noktası.

    provider_subject sağlayıcının kalıcı kullanıcı kimliğidir.
    Email yalnızca sağlayıcı tarafından doğrulanmışsa hesap eşleştirmesinde
    yardımcı kimlik olarak kullanılır.
    """
    provider = provider.strip().lower()
    provider_subject = provider_subject.strip()
    email = email.strip().lower() if email else None

    if not provider or not provider_subject:
        raise ValueError("Geçersiz provider kimliği")

    identity = (
        db.query(AuthIdentity)
        .filter(
            AuthIdentity.provider == provider,
            AuthIdentity.provider_subject == provider_subject,
        )
        .first()
    )

    now = datetime.now(timezone.utc)

    # Aynı provider hesabı daha önce bağlandıysa doğrudan mevcut kullanıcıya dön.
    if identity is not None:
        user = db.get(User, identity.user_id)
        if user is None:
            raise ValueError("Auth identity kullanıcısı bulunamadı")

        identity.verified_at = now
        if email:
            identity.identifier = email

        db.commit()
        db.refresh(user)
        return user

    # Doğrulanmış email ile mevcut hesap varsa yeni provider'ı o hesaba bağla.
    user = None

    if email:
        user = (
            db.query(User)
            .join(AuthIdentity, AuthIdentity.user_id == User.id)
            .filter(AuthIdentity.identifier == email)
            .first()
        )

    if user is None and email:
        user = (
            db.query(User)
            .filter(User.google_email == email)
            .first()
        )

    if user is None:
        safe_nickname = (nickname or "").strip()[:32]

        if not safe_nickname:
            safe_nickname = (
                email.split("@", 1)[0][:32]
                if email and "@" in email
                else "Eris Kullanıcısı"
            )

        user = User(
            id=uuid4().hex,
            public_id=uuid4().hex[:10],
            nickname=safe_nickname,
            avatar="👤",
            gender="male",
            is_active=True,
        )

        # ÖNEMLİ:
        # UserRepository.create() kullanmıyoruz çünkü kendi içinde commit ediyor.
        # User + registry + identity tek transaction içinde oluşturuluyor.
        db.add(user)
        db.flush()

        db.add(
            UserIdRegistry(
                user_id=user.id,
                public_id=user.public_id,
            )
        )

    # Provider kimliğini mevcut veya yeni kullanıcıya bağla.
    db.add(
        AuthIdentity(
            id=uuid4().hex,
            user_id=user.id,
            provider=provider,
            provider_subject=provider_subject,
            identifier=email,
            verified_at=now,
        )
    )

    record(
        "user_id",
        f"{provider}_user_created_or_linked",
        user_id=user.id,
        provider=provider,
        provider_subject=provider_subject,
        identifier=email,
    )

    db.commit()
    db.refresh(user)
    return user
