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


class UserUpdate(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=32)
    avatar: str | None = Field(default=None, min_length=1, max_length=16)
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
    created_at: datetime


class CosmeticOut(BaseModel):
    cosmetic_type: Literal["avatar", "frame"]
    asset_key: str
    gender: str | None = None
    price: int = 1000
    vip: bool = False


class CosmeticPurchase(BaseModel):
    cosmetic_type: Literal["avatar", "frame"]
    asset_key: str = Field(min_length=1, max_length=255)


class CosmeticApply(BaseModel):
    cosmetic_type: Literal["avatar", "frame"]
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
