"""Private notification history, bounded pagination and explicit read operations."""
import base64
import json
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, model_validator
from sqlalchemy import select, func, update, or_, not_
from .db import get_db
from .platform_models import Notification

Category=Literal['all','messages','social','gifts','family','rooms','system']
ReadState=Literal['all','unread','read']
CATEGORIES={'all','messages','social','gifts','family','rooms','system'}
STATES={'all','unread','read'}

def category_conditions():
    kind=Notification.kind
    return {'messages':kind.in_(['dm_message','message_request','message_group_invite','message_group_reply']),
        'social':or_(kind.in_(['follow','story_like']),kind.startswith('relationship_',autoescape=True),kind.in_(['confession','marriage'])),
        'gifts':kind.in_(['gift','dm_gift','couple_gift','donation','ring_credit']),
        'family':kind.startswith('family_',autoescape=True),
        'rooms':kind.in_(['room_invite','room_level'])}

def filtered(uid,category='all',state='all',q=''):
    conditions=[Notification.user_id==uid]
    groups=category_conditions()
    if category=='system':conditions.append(not_(or_(*groups.values())))
    elif category!='all':conditions.append(groups[category])
    if state!='all':conditions.append(Notification.read.is_(state=='read'))
    if q:conditions.append(or_(Notification.title.icontains(q,autoescape=True),Notification.body.icontains(q,autoescape=True)))
    return conditions

def pack(data):return base64.urlsafe_b64encode(json.dumps(data,separators=(',',':'),ensure_ascii=False).encode()).decode().rstrip('=')
def unpack(value):
    try:return json.loads(base64.b64decode(value+'='*(-len(value)%4),altchars=b'-_',validate=True))
    except (ValueError,TypeError,UnicodeError):raise HTTPException(422,'Bildirim sayfa anahtarı geçersiz; listeyi yenileyin.')
def snapshot_read(value,uid):
    data=unpack(value)
    if not isinstance(data,list) or len(data)!=5:raise HTTPException(422,'Bildirim seçimi geçersiz.')
    owner,category,state,q,anchor=data
    if owner!=uid or not isinstance(category,str) or category not in CATEGORIES or not isinstance(state,str) or state not in STATES or not isinstance(q,str) or len(q)>100 or type(anchor)!=int or not 0<=anchor<=2147483647:raise HTTPException(422,'Bildirim seçimi geçersiz.')
    return data

def counts(db,uid):
    total=int(db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id==uid)) or 0)
    unread=int(db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id==uid,Notification.read.is_(False))) or 0)
    return {'total':total,'unread':unread}
def require_enabled(user):
    if not user.notifications_enabled:raise HTTPException(409,'Bildirimler kapalı. Ayarlar’dan açıp yeniden deneyin.')

class Selection(BaseModel):
    model_config=ConfigDict(extra='forbid')
    ids:list[StrictInt]=Field(min_length=1,max_length=50)
    read:StrictBool
    @model_validator(mode='after')
    def unique(self):
        if len(set(self.ids))!=len(self.ids) or any(type(i)!=int or not 0<i<=2147483647 for i in self.ids):raise ValueError('Geçersiz bildirim seçimi.')
        return self
class Matching(BaseModel):
    model_config=ConfigDict(extra='forbid')
    snapshot:str=Field(min_length=1,max_length=2048)

def register_auth(auth):
    router=APIRouter(prefix='/v1/notification-center',tags=['notification-center'])
    def private(response:Response):response.headers['Cache-Control']='private, no-store';response.headers['Vary']='Authorization'
    router.dependencies.append(Depends(private))

    @router.get('')
    def history(category:Category='all',state:ReadState='all',q:str=Query('',max_length=100),limit:int=Query(20,ge=1,le=50),cursor:str|None=Query(None,max_length=2048),db=Depends(get_db),user=Depends(auth)):
        if not user.notifications_enabled:return {'enabled':False,'items':[],'counts':{'total':0,'unread':0},'matched':0,'matched_unread':0,'snapshot':None,'anchor':0,'has_more':False,'next_cursor':None}
        q=q.strip();anchor=int(db.scalar(select(func.max(Notification.id)).where(Notification.user_id==user.id)) or 0);last=None
        if cursor:
            data=unpack(cursor)
            if not isinstance(data,list) or len(data)!=2:raise HTTPException(422,'Bildirim sayfa anahtarı geçersiz.')
            snap,last=data
            owner,cat,st,query,anchor=snapshot_read(snap,user.id)
            if [cat,st,query]!=[category,state,q] or type(last)!=int or not 0<last<=anchor:raise HTTPException(422,'Bildirim sayfa anahtarı bu filtreye ait değil.')
        conditions=filtered(user.id,category,state,q)+[Notification.id<=anchor]
        matched=int(db.scalar(select(func.count()).select_from(Notification).where(*conditions)) or 0)
        unread=int(db.scalar(select(func.count()).select_from(Notification).where(*conditions,Notification.read.is_(False))) or 0)
        rows=list(db.scalars(select(Notification).where(*conditions,*([Notification.id<last] if last else [])).order_by(Notification.id.desc()).limit(limit+1)))
        more=len(rows)>limit;rows=rows[:limit];snap=pack([user.id,category,state,q,anchor])
        return {'enabled':True,'items':[{'id':r.id,'kind':r.kind,'title':r.title,'body':r.body,'read':r.read,'created_at':r.created_at} for r in rows],
            'counts':counts(db,user.id),'matched':matched,'matched_unread':unread,'snapshot':snap,'anchor':anchor,'has_more':more,'next_cursor':pack([snap,rows[-1].id]) if rows and more else None}

    @router.post('/read')
    def selected(data:Selection,db=Depends(get_db),user=Depends(auth)):
        require_enabled(user)
        found=list(db.scalars(select(Notification.id).where(Notification.user_id==user.id,Notification.id.in_(data.ids)).order_by(Notification.id).with_for_update()))
        if len(found)!=len(data.ids):raise HTTPException(404,'Seçilen bildirimlerden biri bulunamadı; işlem yapılmadı.')
        result=db.execute(update(Notification).where(Notification.user_id==user.id,Notification.id.in_(found)).values(read=data.read))
        if result.rowcount!=len(found):db.rollback();raise HTTPException(409,'Bildirim seçimi değişti; listeyi yenileyin.')
        db.commit()
        return {'count':len(found),'read':data.read,'counts':counts(db,user.id)}

    @router.post('/read-matching')
    def matching(data:Matching,db=Depends(get_db),user=Depends(auth)):
        require_enabled(user);owner,category,state,q,anchor=snapshot_read(data.snapshot,user.id)
        result=db.execute(update(Notification).where(*filtered(user.id,category,state,q),Notification.id<=anchor,Notification.read.is_(False)).values(read=True))
        changed=result.rowcount;db.commit();return {'count':changed,'read':True,'counts':counts(db,user.id)}
    return router
