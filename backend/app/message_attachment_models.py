"""Metadata for new uploads; media bytes stay in the existing deferred column."""
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped,mapped_column
from .db import Base

class MessageAttachment(Base):
    __tablename__='message_attachment_details'
    message_id: Mapped[int]=mapped_column(ForeignKey('messages.id',ondelete='CASCADE'),primary_key=True)
    filename: Mapped[str]=mapped_column(String(160),nullable=False)
    size_bytes: Mapped[int]=mapped_column(Integer,nullable=False)
