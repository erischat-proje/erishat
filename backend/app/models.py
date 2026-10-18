from datetime import datetime
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base
from sqlalchemy.ext.hybrid import hybrid_property
from . import staff_identity

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    public_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    _nickname: Mapped[str] = mapped_column("nickname", String(32), nullable=False)
    _avatar: Mapped[str] = mapped_column("avatar", String(16), default="🦊", nullable=False)
    gender: Mapped[str] = mapped_column(String(16), default="unspecified", server_default="unspecified", nullable=False)
    _avatar_asset: Mapped[str | None] = mapped_column("avatar_asset", String(255), nullable=True)
    _frame_asset: Mapped[str | None] = mapped_column("frame_asset", String(255), nullable=True)
    bubble_asset: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title_asset: Mapped[str | None] = mapped_column(String(255), nullable=True)
    profile_asset: Mapped[str | None] = mapped_column(String(255), nullable=True)
    wallpaper_asset: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    lidya: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0", nullable=False)
    lidya_gem: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0", nullable=False)
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    device_info: Mapped[str | None] = mapped_column(String(512), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    google_email: Mapped[str | None] = mapped_column(String(320), index=True, nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    birth_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(300), nullable=True)
    profile_completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    terms_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    terms_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    welcome_gift_claimed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    cosmetics: Mapped[list["UserCosmetic"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    auth_identities: Mapped[list["AuthIdentity"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    @hybrid_property
    def nickname(self):
        return staff_identity.effective(self, '_nickname', staff_identity.NAME)

    @nickname.setter
    def nickname(self, value):
        staff_identity.set_value(self, '_nickname', value)

    @nickname.expression
    def nickname(cls):
        return staff_identity.expression(cls, '_nickname', staff_identity.NAME, 'nickname')

    @hybrid_property
    def avatar(self):
        return staff_identity.effective(self, '_avatar', '💠')

    @avatar.setter
    def avatar(self, value):
        staff_identity.set_value(self, '_avatar', value)

    @avatar.expression
    def avatar(cls):
        return staff_identity.expression(cls, '_avatar', '💠', 'avatar')

    @hybrid_property
    def avatar_asset(self):
        return staff_identity.effective(self, '_avatar_asset', staff_identity.AVATAR)

    @avatar_asset.setter
    def avatar_asset(self, value):
        staff_identity.set_value(self, '_avatar_asset', value)

    @avatar_asset.expression
    def avatar_asset(cls):
        return staff_identity.expression(cls, '_avatar_asset', staff_identity.AVATAR, 'avatar_asset')

    @hybrid_property
    def frame_asset(self):
        return staff_identity.effective(self, '_frame_asset', staff_identity.FRAME)

    @frame_asset.setter
    def frame_asset(self, value):
        staff_identity.set_value(self, '_frame_asset', value)

    @frame_asset.expression
    def frame_asset(cls):
        return staff_identity.expression(cls, '_frame_asset', staff_identity.FRAME, 'frame_asset')

    @property
    def admin_role(self):
        return staff_identity.role_for(self)

    @property
    def management_locked(self):
        return bool(self.admin_role)

    @property
    def management_badges(self):
        return [self.admin_role] if self.management_locked else []

class UserCosmetic(Base):
    __tablename__ = "user_cosmetics"
    __table_args__ = (UniqueConstraint("user_id", "cosmetic_type", "asset_key", name="uq_user_cosmetic"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    cosmetic_type: Mapped[str] = mapped_column(String(32), nullable=False)
    asset_key: Mapped[str] = mapped_column(String(255), nullable=False)
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user: Mapped[User] = relationship(back_populates="cosmetics")

class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    type: Mapped[str] = mapped_column(String(12), default="dm", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_ephemeral: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    members: Mapped[list["ConversationMember"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")

class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (UniqueConstraint("conversation_id", "user_id", name="uq_conversation_member"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    conversation: Mapped["Conversation"] = relationship(back_populates="members")

class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

class AuthOTP(Base):
    __tablename__ = "auth_otps"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    identifier: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class AuthIdentity(Base):
    __tablename__ = "auth_identities"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_subject: Mapped[str | None] = mapped_column(String(320), nullable=True)
    identifier: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)
    secret_hash: Mapped[str | None] = mapped_column(String(512), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="auth_identities")

    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_subject",
            name="uq_auth_identity_provider_subject",
        ),
        UniqueConstraint(
            "provider",
            "identifier",
            name="uq_auth_identity_provider_identifier",
        ),
    )

# Preserve confirmed identity on detached websocket/background user objects.
staff_identity.install_load_hints(User)

