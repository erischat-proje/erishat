"""Private settings with conflict checks and bounded block management."""
import base64,json
from datetime import datetime,timezone
from fastapi import APIRouter,Depends,HTTPException,Query,Response
from pydantic import BaseModel,ConfigDict,StrictBool,StrictInt,Field,model_validator
from sqlalchemy import select,update,delete,func,or_,and_,String
from .db import get_db
from .models import User
from .platform_models import UserPrivacy,UserSocialPrivacy,PrivateProfileSetting,UserBlock
VIP=('hide_vip_badge','hide_vip_neon','hide_vip_entry','hide_vip_title')
GROUPS=((UserPrivacy,('hide_vip',*VIP,'hide_location')),(UserSocialPrivacy,('hide_fans','hide_received_gifts')),(PrivateProfileSetting,('is_private',)))
FIELDS={k for _,keys in GROUPS for k in keys}|{'hide_notifications'}
def state(db,user):
    result={}
    for model,keys in GROUPS:
        row=db.get(model,user.id);result.update({k:bool(getattr(row,k,False)) for k in keys})
    return {**result,'hide_notifications':not user.notifications_enabled}
class Patch(BaseModel):
    model_config=ConfigDict(extra='forbid')
    changes:dict[str,StrictBool]=Field(min_length=1,max_length=10)
    expected:dict[str,StrictBool]=Field(min_length=1,max_length=10)
    @model_validator(mode='after')
    def validate_fields(self):
        if self.changes.keys()!=self.expected.keys() or not set(self.changes)<=FIELDS:raise ValueError('Geçersiz alanlar')
        if 'hide_vip' in self.changes and any(self.changes.get(k)!=self.changes['hide_vip'] for k in VIP):raise ValueError('VIP alt seçimleri birlikte gönderilmeli')
        return self
class Version(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:StrictInt=Field(ge=1)
    created_at:datetime
class Selection(BaseModel):
    model_config=ConfigDict(extra='forbid')
    items:list[Version]=Field(min_length=1,max_length=20)
    confirm:StrictBool
    @model_validator(mode='after')
    def validate_items(self):
        if not self.confirm or len({x.id for x in self.items})!=len(self.items):raise ValueError('Onay ve farklı kayıtlar gerekli')
        return self

def register_auth(auth):
    r=APIRouter(prefix='/v1/privacy-center',tags=['privacy-center'])
    def private(response:Response):response.headers['Cache-Control']='private, no-store';response.headers['Vary']='Authorization'
    r.dependencies.append(Depends(private))
    @r.get('')
    def get(db=Depends(get_db),user=Depends(auth)):return state(db,user)
    @r.patch('')
    def save(data:Patch,db=Depends(get_db),user=Depends(auth)):
        db.scalar(select(User).where(User.id==user.id).with_for_update().execution_options(populate_existing=True))
        current=state(db,user)
        if any(current[k]!=v for k,v in data.expected.items()):raise HTTPException(409,'Ayarlar başka bir yerde değişti. Taslağın korunuyor; yenileyip karşılaştır.')
        if current['hide_vip'] and 'hide_vip' not in data.changes and set(data.changes)&set(VIP):raise HTTPException(422,'Önce ana VIP seçimini kapat.')
        try:
            for model,keys in GROUPS:
                values={k:v for k,v in data.changes.items() if k in keys}
                if not values:continue
                row=db.get(model,user.id)
                if row is None:db.add(model(user_id=user.id,**values));db.flush()
                else:
                    result=db.execute(update(model).where(model.user_id==user.id,*[getattr(model,k)==data.expected[k] for k in values]).values(**values))
                    if result.rowcount!=1:raise HTTPException(409,'Ayarlar değişti; işlem uygulanmadı.')
            if 'hide_notifications' in data.changes:
                result=db.execute(update(User).where(User.id==user.id,User.notifications_enabled==(not data.expected['hide_notifications'])).values(notifications_enabled=not data.changes['hide_notifications']))
                if result.rowcount!=1:raise HTTPException(409,'Bildirim ayarı değişti; işlem uygulanmadı.')
            db.commit();db.refresh(user);return state(db,user)
        except Exception:db.rollback();raise
    @r.get('/blocks')
    def blocks(q:str=Query('',max_length=100),cursor:str|None=Query(None,max_length=2048),limit:int=Query(20,ge=1,le=50),db=Depends(get_db),user=Depends(auth)):
        q=q.strip();anchor=int(db.scalar(select(func.max(UserBlock.id)).where(UserBlock.blocker_id==user.id)) or 0);last=None
        if cursor:
            try:
                uid,query,anchor,last=json.loads(base64.b64decode(cursor+'='*(-len(cursor)%4),altchars=b'-_',validate=True))
                if uid!=user.id or query!=q or type(anchor)!=int or type(last)!=int or not 0<last<=anchor<=2147483647:raise ValueError()
            except (ValueError,TypeError,UnicodeError):raise HTTPException(422,'Sayfa anahtarı geçersiz; yenile.')
        query=select(UserBlock,User).join(User,User.id==UserBlock.blocked_id).where(UserBlock.blocker_id==user.id,UserBlock.id<=anchor)
        if q:query=query.where(User.nickname.icontains(q,autoescape=True))
        if last:query=query.where(UserBlock.id<last)
        rows=list(db.execute(query.order_by(UserBlock.id.desc()).limit(limit+1)));more=len(rows)>limit;rows=rows[:limit]
        next_cursor=base64.urlsafe_b64encode(json.dumps([user.id,q,anchor,rows[-1][0].id]).encode()).decode() if rows and more else None
        return {'items':[{'id':b.id,'user_id':u.id,'nickname':u.nickname,'created_at':b.created_at} for b,u in rows],'has_more':more,'next_cursor':next_cursor}
    @r.post('/blocks/unblock')
    def unblock(data:Selection,db=Depends(get_db),user=Depends(auth)):
        db.scalar(select(User).where(User.id==user.id).with_for_update())
        utc=lambda t:t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t
        expected={x.id:utc(x.created_at) for x in data.items}
        rows=list(db.execute(select(UserBlock,UserBlock.created_at.cast(String).label('version')).where(UserBlock.blocker_id==user.id,UserBlock.id.in_(expected)).order_by(UserBlock.id).with_for_update()))
        if len(rows)!=len(expected) or any(utc(b.created_at)!=expected[b.id] for b,_ in rows):raise HTTPException(409,'Engeller değişti. Listeyi yenileyip yeniden seç; hiçbir engel kaldırılmadı.')
        conditions=[and_(UserBlock.id==b.id,UserBlock.created_at.cast(String)==v if db.get_bind().dialect.name=='sqlite' else UserBlock.created_at==b.created_at) for b,v in rows]
        result=db.execute(delete(UserBlock).where(UserBlock.blocker_id==user.id,or_(*conditions)))
        if result.rowcount!=len(rows):db.rollback();raise HTTPException(409,'Engeller değişti; işlem uygulanmadı.')
        targets=[b.blocked_id for b,_ in rows];db.commit();return {'count':len(rows),'user_ids':targets}
    return r
