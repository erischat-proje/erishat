"""Private, additive discovery preferences. No changes to posts or follows."""
from datetime import datetime
from sqlalchemy import ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class SavedPost(Base):
    __tablename__ = 'explore_saved_posts'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey('social_posts.id', ondelete='CASCADE'), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class HiddenPost(Base):
    __tablename__ = 'explore_hidden_posts'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey('social_posts.id', ondelete='CASCADE'), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class MutedAuthor(Base):
    __tablename__ = 'explore_muted_authors'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    author_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
