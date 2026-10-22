"""Durable independent role-change requests; snapshots survive account removal."""
from datetime import datetime
from sqlalchemy import DateTime,Integer,String,func
from sqlalchemy.orm import Mapped,mapped_column
from .db import Base

class ManagementRoleRequest(Base):
    __tablename__='management_role_requests'
    id:Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    request_key:Mapped[str]=mapped_column(String(64),unique=True)
    requester_id:Mapped[str]=mapped_column(String(64),index=True)
    target_id:Mapped[str]=mapped_column(String(64),index=True)
    target_public_id:Mapped[str]=mapped_column(String(64))
    target_name:Mapped[str]=mapped_column(String(128))
    previous_role:Mapped[str|None]=mapped_column(String(2),nullable=True)
    requested_role:Mapped[str|None]=mapped_column(String(2),nullable=True)
    snapshot:Mapped[str]=mapped_column(String(64))
    reason:Mapped[str]=mapped_column(String(2000))
    status:Mapped[str]=mapped_column(String(16),default='pending',index=True)
    reviewer_id:Mapped[str|None]=mapped_column(String(64),nullable=True)
    decision_note:Mapped[str|None]=mapped_column(String(2000),nullable=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now(),index=True)
    decided_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
