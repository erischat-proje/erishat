"""Operational annotations, source-to-case links, feedback workflow and publication drafts."""
from datetime import datetime
from sqlalchemy import DateTime,ForeignKey,Integer,String,Text,UniqueConstraint,Index,func
from sqlalchemy.orm import Mapped,mapped_column
from .db import Base

class OperationHistory(Base):
    __tablename__='management_operation_history'
    __table_args__=(Index('ix_management_operation_source','kind','source_id','id'),)
    id:Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    kind:Mapped[str]=mapped_column(String(20),index=True)
    source_id:Mapped[str]=mapped_column(String(64),index=True)
    actor_id:Mapped[str]=mapped_column(ForeignKey('users.id'))
    action:Mapped[str]=mapped_column(String(40))
    note:Mapped[str]=mapped_column(Text)
    request_key:Mapped[str|None]=mapped_column(String(64),nullable=True,unique=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class OperationCaseLink(Base):
    __tablename__='management_source_cases'
    __table_args__=(UniqueConstraint('kind','source_id'),)
    id:Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    kind:Mapped[str]=mapped_column(String(20))
    source_id:Mapped[str]=mapped_column(String(64))
    case_id:Mapped[int]=mapped_column(ForeignKey('management_cases.id'),index=True)
    created_by:Mapped[str]=mapped_column(ForeignKey('users.id'))
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class FeedbackWork(Base):
    __tablename__='management_feedback_work'
    suggestion_id:Mapped[int]=mapped_column(ForeignKey('user_suggestions.id'),primary_key=True)
    status:Mapped[str]=mapped_column(String(20),default='triage',index=True)
    assignee_id:Mapped[str|None]=mapped_column(ForeignKey('users.id'),nullable=True,index=True)
    revision:Mapped[int]=mapped_column(Integer,default=1)
    updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now(),onupdate=func.now())

class AnnouncementDraft(Base):
    __tablename__='management_announcement_drafts'
    id:Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    author_id:Mapped[str]=mapped_column(ForeignKey('users.id'),index=True)
    request_key:Mapped[str]=mapped_column(String(64),unique=True)
    message:Mapped[str]=mapped_column(Text)
    revision:Mapped[int]=mapped_column(Integer,default=1)
    status:Mapped[str]=mapped_column(String(16),default='draft')
    announcement_id:Mapped[int|None]=mapped_column(ForeignKey('system_announcements.id',ondelete='SET NULL'),nullable=True,unique=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())
    updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now(),onupdate=func.now())
