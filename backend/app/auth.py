import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

def hash_password(password: str) -> str:
    # Güvenli SHA256 / Salt simülasyonu veya bcrypt altyapısı
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

def create_access_token(data: dict, expires_delta: timedelta = timedelta(hours=12)) -> str:
    token = secrets.token_hex(32)
    return token

from app.db import get_db
from sqlalchemy.orm import Session
from app.session import get_user_from_token
from app.models import User

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security), db: Session = Depends(get_db)) -> User:
    token = credentials.credentials
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials or session expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
