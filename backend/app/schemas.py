from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserCreate(BaseModel):
    nickname: str = Field(min_length=1, max_length=32)
    gender: Literal["female", "male"]
    avatar: str = Field(default="👤", min_length=1, max_length=16)

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("nickname boş olamaz")
        return value


class OnboardingRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=64)
    last_name: str = Field(min_length=1, max_length=64)
    birth_date: str = Field(min_length=10, max_length=10)
    gender: Literal["female", "male"]
    username: str = Field(min_length=3, max_length=32)
    bio: str = Field(default="", max_length=300)
    avatar_asset: str | None = Field(default=None, max_length=255)
    frame_asset: str | None = Field(default=None, max_length=255)

    @field_validator("first_name", "last_name", "username", "bio")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, value: str) -> str:
        from datetime import date
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("Doğum tarihi YYYY-AA-GG formatında olmalı") from exc
        if parsed > date.today():
            raise ValueError("Doğum tarihi gelecekte olamaz")
        return value

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, value: str) -> str:
        if len(value) > 300:
            raise ValueError("Biyografi en fazla 300 karakter olabilir")
        return value


class UserUpdate(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=32)
    avatar: str | None = Field(default=None, min_length=1, max_length=16)
    first_name: str | None = Field(default=None, min_length=1, max_length=64)
    last_name: str | None = Field(default=None, min_length=1, max_length=64)
    bio: str | None = Field(default=None, max_length=300)
    notifications_enabled: bool | None = None

    @field_validator("nickname")
    @classmethod
    def validate_optional_nickname(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("İsim boş olamaz")
        return value

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_profile_name(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Ad veya soyad boş olamaz")
        return value.strip() if value is not None else None

    @field_validator("bio")
    @classmethod
    def clean_profile_bio(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class NicknameChange(BaseModel):
    nickname: str = Field(min_length=1, max_length=32)

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("İsim boş olamaz")
        return value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    public_id: str
    nickname: str
    avatar: str
    gender: str
    avatar_asset: str | None = None
    frame_asset: str | None = None
    wallpaper_asset: str | None = None
    is_active: bool
    lidya: int
    lidya_gem: int = 0
    notifications_enabled: bool
    first_name: str | None = None
    last_name: str | None = None
    birth_date: str | None = None
    bio: str | None = None
    profile_completed: bool = False
    welcome_gift_claimed: bool = False
    created_at: datetime


class CosmeticOut(BaseModel):
    cosmetic_type: Literal["avatar", "frame", "wallpaper"]
    asset_key: str
    gender: str | None = None
    price: int = 1000
    vip: bool = False


class CosmeticPurchase(BaseModel):
    cosmetic_type: Literal["avatar", "frame", "wallpaper"]
    asset_key: str = Field(min_length=1, max_length=255)


class CosmeticApply(BaseModel):
    cosmetic_type: Literal["avatar", "frame", "wallpaper"]
    asset_key: str = Field(min_length=1, max_length=255)


class SessionOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ConversationCreate(BaseModel):
    participant_id: str = Field(min_length=1, max_length=64)


class ConversationMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    type: str
    created_at: datetime
    members: list[ConversationMemberOut] = Field(default_factory=list)


class MessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Mesaj boş olamaz")
        return value


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    conversation_id: str
    sender_id: str
    text: str
    created_at: datetime


class OTPRequest(BaseModel):
    provider: Literal["phone", "email"]
    identifier: str = Field(min_length=3, max_length=320)
    purpose: Literal["register", "login", "link"]


class OTPVerify(BaseModel):
    provider: Literal["phone", "email"]
    identifier: str = Field(min_length=3, max_length=320)
    purpose: Literal["register", "login", "link"]
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
