from sqlalchemy import ForeignKey,Integer
from sqlalchemy.orm import Mapped,mapped_column
from .db import Base

class ChatBanRequestBinding(Base):
    __tablename__='chat_ban_request_bindings'
    id: Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    approval_id: Mapped[int]=mapped_column(ForeignKey('ban_approvals.id'),unique=True,nullable=False)
    ban_id: Mapped[int|None]=mapped_column(ForeignKey('chat_bans.id'),unique=True,nullable=True)
