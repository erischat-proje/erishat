from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    nickname: str = Field(min_length=1, max_length=32)
    avatar: str = Field(default="👤", min_length=1, max_length=16)


class UserUpdate(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=32)
    avatar: str | None = Field(default=None, min_length=1, max_length=16)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    public_id: str
    nickname: str
    avatar: str
    is_active: bool
    created_at: datetime


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
