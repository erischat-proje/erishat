from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class UserCreate(BaseModel):
    nickname: str = Field(min_length=1, max_length=32)
    gender: Literal["female", "male"]
    avatar: str = Field(default="👤", min_length=1, max_length=16)

class UserUpdate(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=32)
    avatar: str | None = Field(default=None, min_length=1, max_length=16)
    notifications_enabled: bool | None = None

class NicknameChange(BaseModel):
    nickname: str = Field(min_length=1, max_length=32)

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    public_id: str
    nickname: str
    avatar: str
    gender: str
    avatar_asset: str | None = None
    frame_asset: str | None = None
    is_active: bool
    lidya: int
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
    members: list[ConversationMemberOut] = []

class MessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)

class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    conversation_id: str
    sender_id: str
    text: str
    created_at: datetime
