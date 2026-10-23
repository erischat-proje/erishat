"""Private profile editing and owned-post management. No wallet mutation."""
import base64
import json
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr, model_validator
from sqlalchemy import select, func, update, delete, and_, or_, Integer, String
from .db import get_db
from .models import User
from .platform_models import SocialPost
from .staff_identity import require_editable, role_for
from .moderation import require_chat_write
from . import explore_feed

FIELDS={'first_name':64,'last_name':64,'bio':300}
def utc(t):return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t
def now():return datetime.now(timezone.utc)
def snapshot(user):
    return {'id':user.id,'public_id':user.public_id,'nickname':user.nickname,'management_locked':bool(role_for(user)),
        'first_name':user.first_name or '', 'last_name':user.last_name or '', 'bio':user.bio or ''}

class InfoPatch(BaseModel):
    model_config=ConfigDict(extra='forbid')
    changes:dict[str,StrictStr]=Field(min_length=1,max_length=3)
    expected:dict[str,StrictStr]=Field(min_length=1,max_length=3)
    @model_validator(mode='after')
    def validate_fields(self):
        if self.changes.keys()!=self.expected.keys() or not set(self.changes).issubset(FIELDS):raise ValueError('Yalnızca ad, soyad ve biyografi alanları düzenlenebilir.')
        for key,value in self.changes.items():
            value=value.replace('\r\n','\n').replace('\r','\n').strip()
            if len(value)>FIELDS[key] or any(ord(c)<32 and not(key=='bio' and c in '\n\t') or ord(c)==127 for c in value):raise ValueError('Profil alanı geçersiz veya çok uzun.')
            if len(self.expected[key])>FIELDS[key]:raise ValueError('Önceki profil değeri çok uzun.')
            self.changes[key]=value
        return self

class SelectedPost(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:int=Field(ge=1,le=2147483647)
    updated_at:datetime
class PostAction(BaseModel):
    model_config=ConfigDict(extra='forbid')
    action:Literal['hide','show','public','followers','delete']
    items:list[SelectedPost]=Field(min_length=1,max_length=20)
    confirm_delete:StrictBool=False
    @model_validator(mode='after')
    def unique(self):
        if len({x.id for x in self.items})!=len(self.items):raise ValueError('Gönderiler tekrar edemez.')
        if self.action=='delete' and not self.confirm_delete:raise ValueError('Kalıcı silme onayı gerekli.')
        return self

def counts(db,uid):
    total,hidden,followers,media=db.execute(select(func.count(),func.coalesce(func.sum(SocialPost.is_hidden.cast(Integer)),0),
        func.coalesce(func.sum(and_(SocialPost.audience=='followers',SocialPost.is_hidden.is_(False)).cast(Integer)),0),
        func.coalesce(func.sum(SocialPost.image_bytes.is_not(None).cast(Integer)),0)).where(SocialPost.user_id==uid)).one()
    return dict(total=int(total),hidden=int(hidden),visible=int(total-hidden),followers=int(followers),media=int(media))

def cursor_pack(value):return base64.urlsafe_b64encode(json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()).decode().rstrip('=')
def cursor_read(value,filters):
    try:
        anchor,last,rank,old=json.loads(base64.b64decode(value+'='*(-len(value)%4),altchars=b'-_',validate=True))
        if old!=filters or type(anchor)!=int or type(last)!=int or not 0<last<=anchor<=2147483647 or type(rank)!=int or rank not in (0,1):raise ValueError()
        return anchor,last,rank
    except (ValueError,TypeError,UnicodeError,OverflowError):raise HTTPException(422,'Gönderi sayfa anahtarı geçersiz; listeyi yenileyin.')

def posts(db,user,scope='all',media='all',q='',order='newest',limit=20,cursor=None):
    q=q.strip();filters=[user.id,scope,media,q,order];query=select(SocialPost,User,SocialPost.image_bytes.is_not(None)).join(User,User.id==SocialPost.user_id).where(SocialPost.user_id==user.id)
    if scope=='hidden':query=query.where(SocialPost.is_hidden.is_(True))
    elif scope!='all':query=query.where(SocialPost.is_hidden.is_(False),SocialPost.audience==scope)
    if media=='text':query=query.where(SocialPost.image_bytes.is_(None))
    elif media!='all':query=query.where(SocialPost.image_bytes.is_not(None),SocialPost.mime_type.like(media+'/%'))
    if q:query=query.where(SocialPost.caption.icontains(q,autoescape=True))
    anchor=db.scalar(select(func.max(SocialPost.id)).where(SocialPost.user_id==user.id)) or 0
    if cursor:
        anchor,last,rank=cursor_read(cursor,filters)
        older=SocialPost.id<last if order=='newest' else SocialPost.id>last
        query=query.where(or_(and_(SocialPost.is_pinned==bool(rank),older),SocialPost.is_pinned.is_(False)) if rank else and_(SocialPost.is_pinned.is_(False),older))
    rows=list(db.execute(query.where(SocialPost.id<=anchor).order_by(SocialPost.is_pinned.desc(),SocialPost.id.desc() if order=='newest' else SocialPost.id.asc()).limit(limit+1)));more=len(rows)>limit;rows=rows[:limit]
    items=explore_feed.serialize(db,rows,user)
    for item,(post,_,_) in zip(items,rows):item['is_hidden']=bool(post.is_hidden)
    return {'items':items,'has_more':more,'next_cursor':cursor_pack([anchor,rows[-1][0].id,int(rows[-1][0].is_pinned),filters]) if rows and more else None}

def apply_action(db,user,data):
    if data.action!='delete':require_chat_write(db,user.id)
    expected={x.id:utc(x.updated_at) for x in data.items}
    records=list(db.execute(select(SocialPost,SocialPost.updated_at.cast(String).label("stored_version")).where(SocialPost.user_id==user.id,SocialPost.id.in_(expected)).order_by(SocialPost.id).with_for_update()))
    rows=[row for row,_ in records];stored_versions={row.id:version for row,version in records}
    if len(rows)!=len(expected):raise HTTPException(404,'Seçilen gönderilerden biri bulunamadı veya size ait değil; işlem yapılmadı.')
    if any(utc(row.updated_at)!=expected[row.id] for row in rows):raise HTTPException(409,'Seçilen bir gönderi değişti; listeyi yenileyip yeniden seçin. Hiçbir değişiklik uygulanmadı.')
    try:
        at=now()
        for row in rows:
            # SQLite's server-default timestamps omit .000000; compare its exact
            # stored text so old and new formats both retain full CAS precision.
            version=(SocialPost.updated_at.cast(String)==stored_versions[row.id]) if db.get_bind().dialect.name=='sqlite' else SocialPost.updated_at==row.updated_at
            condition=and_(SocialPost.id==row.id,SocialPost.user_id==user.id,version)
            if data.action=='delete':result=db.execute(delete(SocialPost).where(condition))
            else:
                values={'updated_at':at}
                if data.action in ('hide','show'):values['is_hidden']=data.action=='hide'
                else:values['audience']=data.action
                result=db.execute(update(SocialPost).where(condition).values(**values))
            if result.rowcount!=1:raise HTTPException(409,'Gönderiler işlem sırasında değişti; hiçbir değişiklik uygulanmadı.')
        db.commit()
    except Exception:db.rollback();raise
    return {'count':len(rows),'action':data.action,'counts':counts(db,user.id)}

def register_auth(auth):
    router=APIRouter(prefix='/v1/profile-workspace',tags=['profile-workspace'])
    def private(response:Response):response.headers['Cache-Control']='private, no-store';response.headers['Vary']='Authorization'
    router.dependencies.append(Depends(private))
    @router.get('')
    def overview(db=Depends(get_db),user=Depends(auth)):
        return {'profile':snapshot(user),'posts':counts(db,user.id)}
    @router.patch('/info')
    def edit_info(data:InfoPatch,db=Depends(get_db),user=Depends(auth)):
        require_editable(user)
        conditions=[User.id==user.id]+[func.coalesce(getattr(User,key),'')==value for key,value in data.expected.items()]
        values={key:(value or None) for key,value in data.changes.items()}
        result=db.execute(update(User).where(*conditions).values(**values))
        if result.rowcount!=1:db.rollback();raise HTTPException(409,'Profilin başka bir yerde değişti. Yazdıkların korunuyor; güncel bilgileri açıp karşılaştır.')
        db.commit();db.refresh(user);return snapshot(user)
    @router.get('/posts')
    def list_posts(scope:str=Query('all',pattern='^(all|public|followers|hidden)$'),media:str=Query('all',pattern='^(all|text|image|video)$'),q:str=Query('',max_length=100),order:str=Query('newest',pattern='^(newest|oldest)$'),limit:int=Query(20,ge=1,le=50),cursor:str|None=Query(None,max_length=2048),db=Depends(get_db),user=Depends(auth)):
        return posts(db,user,scope,media,q,order,limit,cursor)
    @router.post('/posts/action')
    def bulk(data:PostAction,db=Depends(get_db),user=Depends(auth)):
        return apply_action(db,user,data)
    return router
