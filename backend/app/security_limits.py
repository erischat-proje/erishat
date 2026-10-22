"""Atomic abuse counters shared by all API processes using the same database."""
import hashlib
import logging
import secrets
import time
from fastapi import HTTPException
from sqlalchemy import BigInteger, Integer, String, delete
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.exc import SQLAlchemyError
from .db import Base, engine

log=logging.getLogger('lidyachat.security')
class SecurityCounter(Base):
    __tablename__='security_counters'
    key:Mapped[str]=mapped_column(String(64),primary_key=True)
    window:Mapped[int]=mapped_column(BigInteger,primary_key=True)
    count:Mapped[int]=mapped_column(Integer,nullable=False)
    expires:Mapped[int]=mapped_column(BigInteger,index=True,nullable=False)

def enforce_limit(actor,bucket,limit,seconds=60,bind=None,at=None):
    """Consume before doing sensitive work; rejected business transactions cannot undo it."""
    bind=bind or engine;now=int(time.time() if at is None else at);window=now//seconds
    key=hashlib.sha256((bucket+'\0'+actor).encode()).hexdigest()
    dialect=bind.dialect.name
    if dialect=='postgresql':from sqlalchemy.dialects.postgresql import insert
    elif dialect=='sqlite':from sqlalchemy.dialects.sqlite import insert
    else:raise RuntimeError('Unsupported security counter database')
    statement=insert(SecurityCounter).values(key=key,window=window,count=1,expires=(window+2)*seconds)
    statement=statement.on_conflict_do_update(index_elements=['key','window'],set_={'count':SecurityCounter.count+1},where=SecurityCounter.count<=limit).returning(SecurityCounter.count)
    try:
        with bind.begin() as connection:
            consumed=connection.execute(statement).scalar_one_or_none()
            # Cleanup runs at a low, deterministic rate, not once per API request.
            if consumed==1 and secrets.randbelow(127)==0:
                connection.execute(delete(SecurityCounter).where(SecurityCounter.expires<now))
    except SQLAlchemyError:
        log.error('security_counter_unavailable bucket=%s',bucket)
        raise HTTPException(503,'Güvenlik denetimi şu anda kullanılamıyor. Yeniden deneyin.') from None
    if consumed is None or consumed>limit:
        if consumed is not None:log.warning('rate_limited bucket=%s actor_hash=%s',bucket,key[:12])
        raise HTTPException(429,'Çok fazla deneme. Biraz bekleyip yeniden deneyin.',headers={'Retry-After':str(seconds-now%seconds)})

def enforce_account(user_id,request):
    if request is None:return
    path=request.url.path;method=request.method
    bucket=None;limit=0
    if path.startswith('/v1/me/security/') and method=='DELETE':bucket,limit='session_revoke',20
    elif path.startswith('/v1/me/account-deletion/') and method=='POST':bucket,limit='account_deletion',8
    elif '/dm-vault' in path and method in ('POST','PUT'):bucket,limit='vault',8
    elif path.startswith('/v1/admin/users/') and method=='GET':bucket,limit='admin_identity_lookup',20
    elif path.startswith('/v1/users/') and method=='GET' or path in ('/v1/role-badges','/v1/search/users'):
        bucket,limit='public_identity_lookup',90
    elif method in ('POST','PUT','PATCH','DELETE') and path.startswith('/v1/admin/'):
        bucket,limit='admin_write',60
    elif method=='POST' and ('/games/' in path or '/wallet/' in path):bucket,limit='financial_action',180
    if bucket:enforce_limit('account:'+user_id,bucket,limit)
