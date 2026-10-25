"""Account-private contact names, keyed by immutable user IDs."""
import unicodedata
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import ForeignKey, String, select, func, delete
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base, get_db
from .models import User

class ContactAlias(Base):
    __tablename__ = 'contact_aliases'
    owner_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    target_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    alias: Mapped[str] = mapped_column(String(64), nullable=False)

class AliasInput(BaseModel):
    alias: str = Field(min_length=1,max_length=64)
    @field_validator('alias')
    @classmethod
    def clean(cls,value):
        value=value.strip()
        if not value or any(unicodedata.category(c).startswith('C') for c in value):
            raise ValueError('Takma ad boş olamaz; kontrol karakteri içeremez.')
        return value

def register_auth(auth):
    router=APIRouter(prefix='/v1/me/contact-aliases',tags=['contact aliases'])
    @router.get('')
    def listing(response:Response,db=Depends(get_db),user=Depends(auth)):
        response.headers['Cache-Control']='private, no-store'
        return {'aliases':{r.target_id:r.alias for r in db.scalars(select(ContactAlias).where(ContactAlias.owner_id==user.id))}}
    @router.put('/{target_id}')
    def save(target_id:str,data:AliasInput,db=Depends(get_db),user=Depends(auth)):
        db.scalar(select(User).where(User.id==user.id).with_for_update())
        target=db.get(User,target_id)
        if not target or not target.is_active:raise HTTPException(404,'Kullanıcı bulunamadı.')
        if target_id==user.id:raise HTTPException(400,'Kendine kişi takma adı veremezsin.')
        row=db.get(ContactAlias,(user.id,target_id))
        if not row:
            if db.scalar(select(func.count()).select_from(ContactAlias).where(ContactAlias.owner_id==user.id))>=1000:raise HTTPException(409,'En fazla 1000 kişiye takma ad verebilirsin.')
            row=ContactAlias(owner_id=user.id,target_id=target_id,alias=data.alias);db.add(row)
        else:row.alias=data.alias
        db.commit()
        return {'user_id':target_id,'alias':row.alias}
    @router.delete('/{target_id}')
    def remove(target_id:str,db=Depends(get_db),user=Depends(auth)):
        db.scalar(select(User).where(User.id==user.id).with_for_update())
        db.execute(delete(ContactAlias).where(ContactAlias.owner_id==user.id,ContactAlias.target_id==target_id));db.commit()
        return {'user_id':target_id,'alias':None}
    return router
