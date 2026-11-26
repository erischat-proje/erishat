"""Time-limited personal nobility avatars."""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey,
    LargeBinary, String, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class NobilityAnimatedAvatar(Base):
    __tablename__ = "nobility_animated_avatars"

    __table_args__ = (
        CheckConstraint(
            "expires_at > granted_at",
            name="ck_nobility_avatar_period",
        ),
        CheckConstraint(
            "mime_type IN ('image/gif', 'image/webp')",
            name="ck_nobility_avatar_mime",
        ),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    asset_id: Mapped[str] = mapped_column(
        String(36), unique=True, nullable=False,
    )

    granted_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    mime_type: Mapped[str] = mapped_column(
        String(32), nullable=False,
    )

    media: Mapped[bytes] = mapped_column(
        LargeBinary, nullable=False,
    )

    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
