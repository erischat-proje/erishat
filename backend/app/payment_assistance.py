"""DA payment assistance: transactional claims, two-party readiness, private receipts."""
import base64
import hashlib
import json
from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import uuid4
from zoneinfo import ZoneInfo
from PIL import Image, ImageOps
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, select, update, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .admin_models import AdminRole, AdminAuditLog
from .purchase_models import LidyaOperation, LidyaOrder
from . import purchase_routes as purchases
from .payment_assistance_models import PaymentRequest, PaymentMessage, PaymentEvent, PaymentPresence, PaymentReview, PaymentReviewClosure

router=APIRouter(prefix='/v1/payment-assistance',tags=['payment-assistance'])
LIVE=('pending','connecting','chat','rejecting','finishing')
ASSIGNED=('connecting','chat','rejecting','finishing')
TERMINAL=('approved','rejected','cancelled')
KEY=dict(min_length=16,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')
QUEUE_NOTICE='Şu anda sistem yoğunluğundan dolayı görevliler diğer müşteriler ile ilgilenmektedir. Size en kısa sürede dönüş yapılacaktır. Ödeme kaydınız oluşturulmuştur.'

def now():return datetime.now(timezone.utc)
def aware(t):return t.replace(tzinfo=timezone.utc) if t and not t.tzinfo else t

def require_da(db,user,lock=False):
    if not user.is_active:raise HTTPException(403,'Hesap aktif değil')
    q=select(AdminRole).where(AdminRole.user_id==user.id)
    if lock:q=q.with_for_update().execution_options(populate_existing=True)
    row=db.scalar(q)
    if not row or row.role!='DA':raise HTTPException(403,'Bu işlem yalnızca DA yetkililerine açıktır.')
    return row

def get(db,identifier,lock=False):
    q=select(PaymentRequest).where(PaymentRequest.id==identifier)
    if lock:q=q.with_for_update().execution_options(populate_existing=True)
    row=db.scalar(q)
    if not row:raise HTTPException(404,'Ödeme isteği bulunamadı.')
    return row

def side(db,user,row):
    if row.user_id==user.id:return 'customer'
    require_da(db,user)
    if row.assigned_to!=user.id:raise HTTPException(403,'Bu görüşme size atanmamış.')
    return 'agent'

def assigned(db,user,identifier):
    require_da(db,user,True)
    row=get(db,identifier,True)
    if row.assigned_to!=user.id:raise HTTPException(403,'İstek başka bir DA yetkilisinde.')
    return row

def event(db,row,user,action,**details):
    actor=db.get(AdminRole,user.id);details={'actor_role':actor.role if actor else 'USER','status':row.status,**details}
    db.add(PaymentEvent(request_id=row.id,actor_id=user.id,actor_public_id=user.public_id,action=action,details=json.dumps(details,ensure_ascii=False)))
    db.add(AdminAuditLog(admin_id=user.id,action='payment_'+action,target_user_id=row.user_id,details=json.dumps({'request_id':row.id,**details},ensure_ascii=False)))
    row.updated_at=now()

def flush(db):
    try:db.flush()
    except IntegrityError:
        db.rollback();raise HTTPException(409,'Bu istek veya işlem başka bir oturumda tamamlandı. Kaydı yenileyin.')

def commit(db):
    try:db.commit()
    except IntegrityError:
        db.rollback();raise HTTPException(409,'İstek veya ödeme referansı zaten kullanılmış. Kaydı yenileyin.')

def note(db,uid,title,body):purchases.notify(db,uid,title,body)

def free_da_count(db,exclude=None):
    busy=select(PaymentRequest.assigned_to).where(PaymentRequest.status.in_(ASSIGNED),PaymentRequest.assigned_to.is_not(None))
    q=select(func.count()).select_from(PaymentPresence).join(AdminRole,AdminRole.user_id==PaymentPresence.user_id).join(User,User.id==PaymentPresence.user_id).where(AdminRole.role=='DA',User.is_active.is_(True),PaymentPresence.seen_at>now()-timedelta(seconds=45),PaymentPresence.user_id.not_in(busy))
    if exclude:q=q.where(PaymentPresence.user_id!=exclude)
    return int(db.scalar(q) or 0)

def recoverable(db,row):
    if row.status not in ASSIGNED or not row.assigned_to:return False
    user=db.get(User,row.assigned_to);role=db.get(AdminRole,row.assigned_to);presence=db.get(PaymentPresence,row.assigned_to)
    if not user or not user.is_active or not role or role.role!='DA':return True
    seen=max((aware(t) for t in [row.accepted_at,row.created_at,presence.seen_at if presence else None] if t),default=now())
    return seen<now()-timedelta(minutes=10)

def summary(row,user_id=None):
    return {'id':row.id,'public_id':row.public_id,'nickname':row.nickname,'package_id':row.package_id,'price_try':row.price_try,'base':row.base,'bonus':row.bonus,'total':row.total,'status':row.status,'assigned_to':row.assigned_to,'agent_public_id':row.agent_public_id,'customer_ack':row.customer_ack,'agent_ack':row.agent_ack,'created_at':row.created_at,'accepted_at':row.accepted_at,'updated_at':row.updated_at,'closed_at':row.closed_at,'reason':row.reason,'credited':bool(row.credit_operation_id),'credit_operation_id':row.credit_operation_id,'own':row.user_id==user_id}

def active_da_ids(db):
    return set(db.scalars(select(AdminRole.user_id).join(User,User.id==AdminRole.user_id).where(AdminRole.role=='DA',User.is_active.is_(True))))

def review_states(db,rows,user):
    ids=[r.id for r in rows]
    if not ids:return {}
    required=active_da_ids(db)
    reviews={rid:set() for rid in ids}
    for rid,uid in db.execute(select(PaymentReview.request_id,PaymentReview.user_id).where(PaymentReview.request_id.in_(ids))):reviews[rid].add(uid)
    closures={r.request_id:r for r in db.scalars(select(PaymentReviewClosure).where(PaymentReviewClosure.request_id.in_(ids)))}
    numbers=dict(db.execute(select(PaymentEvent.request_id,func.min(PaymentEvent.id)).where(PaymentEvent.request_id.in_(ids),PaymentEvent.action=='requested').group_by(PaymentEvent.request_id)).all())
    result={}
    for r in rows:
        closure=closures.get(r.id)
        roster=set(json.loads(closure.required_da_ids)) if closure else required
        result[r.id]={'transaction_number':numbers.get(r.id) or r.id,'reviewed':user.id in reviews[r.id],'reviewed_count':len(reviews[r.id]&roster),'required_count':len(roster),'review_archived':bool(closure),'can_review':r.status in TERMINAL and not closure}
    return result

def idle(db,user,row):
    other=db.scalar(select(PaymentRequest.id).where(PaymentRequest.assigned_to==user.id,PaymentRequest.status.in_(ASSIGNED),PaymentRequest.id!=row.id).limit(1))
    if other:raise HTTPException(409,'Önce üstlendiğiniz ödeme görüşmesini tamamlayın veya kuyruğa bırakın.')
    if user.id==row.user_id:raise HTTPException(409,'Kendi ödeme isteğinizi üstlenemezsiniz.')

def latest_customer_receipt(db,row):
    return db.scalar(select(PaymentMessage).where(PaymentMessage.request_id==row.id,PaymentMessage.sender_id==row.user_id,PaymentMessage.sender_side=='customer',PaymentMessage.photo_sha.is_not(None)).order_by(PaymentMessage.id.desc()).limit(1))

def require_visible_photo(image):
    # Reject a truly blank white image, not a mostly white receipt with text.
    # Sample for speed but use the full extrema before rejecting tiny markings.
    gray=image.convert('L')
    low,high=gray.getextrema()
    if low>=245 and high-low<=8:
        raise HTTPException(422,'Fotoğrafın içeriği boş/beyaz görünüyor. Galeride açıp kontrol edin ve asıl dekontu yeniden seçin. Ekran görüntüsü yerine bankadan indirdiğiniz dekont fotoğrafını kullanabilirsiniz.')

def image_bytes(value):
    try:
        raw,mime=purchases.decode_document(value)
        with Image.open(BytesIO(raw)) as src:
            frame=ImageOps.exif_transpose(src);require_visible_photo(frame);frame.thumbnail((2048,2048))
            if frame.mode in ('RGBA','LA'):
                rgba=frame.convert('RGBA');img=Image.new('RGB',rgba.size,'white');img.paste(rgba,mask=rgba.getchannel('A'))
            else:img=frame.convert('RGB')
            out=BytesIO();img.save(out,'JPEG',quality=90,optimize=True);result=out.getvalue()
            if len(result)>3_000_000:raise ValueError('Fotoğraf 3 MB sınırını aşıyor.')
            return result,hashlib.sha256(raw).hexdigest()
    except (ValueError,TypeError,OSError,SyntaxError,Image.DecompressionBombError) as exc:raise HTTPException(422,'Geçerli JPEG, PNG veya WebP fotoğraf gerekli (en fazla 3 MB).') from exc

class Create(BaseModel):
    package_id:int=Field(ge=1,le=16,strict=True)
    request_key:str=Field(**KEY)

class Message(BaseModel):
    message:str=Field(default='',max_length=2000)
    photo:str=Field(default='',max_length=4_100_000)
    request_key:str=Field(**KEY)
    @field_validator('message')
    @classmethod
    def clean(cls,v):return purchases.ChatMessage(message=v).message if v.strip() else ''
    @model_validator(mode='after')
    def nonempty(self):
        if not self.message.strip() and not self.photo:raise ValueError('Mesaj veya fotoğraf gerekli.')
        return self

class Reason(BaseModel):
    reason:str=Field(min_length=3,max_length=300)
    @field_validator('reason')
    @classmethod
    def clean(cls,v):
        v=v.strip()
        if len(v)<3:raise ValueError('Ret/açıklama nedeni en az 3 karakter olmalı.')
        return v

class Credit(BaseModel):
    photo_message_id:int|None=Field(default=None,gt=0)
    transaction_reference:str=Field(min_length=6,max_length=100)
    verified:bool=False
    @field_validator('transaction_reference')
    @classmethod
    def clean(cls,v):
        value=purchases.Decision(approve=True,transaction_reference=v).transaction_reference
        if len(value)<6:raise ValueError('Banka/sağlayıcı işlem referansı zorunludur (6–100 karakter).')
        return value

class Read(BaseModel):
    message_id:int=Field(ge=0)


def register_auth(current_user):
    @router.get('/catalog')
    def catalog(db:Session=Depends(get_db),user:User=Depends(current_user)):
        legacy=list(db.scalars(select(LidyaOrder).where(LidyaOrder.user_id==user.id,LidyaOrder.status.in_(['awaiting','pending','active'])).limit(50)))
        return {'packages':purchases.PACKAGES,'mode':'da_assistance','legacy_pending':[{'id':r.id,'price_try':r.price_try,'total':r.total,'status':r.status} for r in legacy]}

    @router.post('/legacy/{identifier}/cancel')
    def legacy_cancel(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=purchases.get_order(db,identifier,True)
        if row.user_id!=user.id:raise HTTPException(403,'Eski ödeme kaydı size ait değil.')
        if row.status=='cancelled':return {'ok':True}
        if row.status not in ('awaiting','pending','active'):raise HTTPException(409,'Bu eski ödeme kaydı kapanmış.')
        purchases.audit(db,user,'legacy_payment_cancelled',{'order_id':row.id,'previous_status':row.status},user.id)
        row.status='cancelled';commit(db);return {'ok':True}

    @router.post('/presence')
    def presence(db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user,True);row=db.get(PaymentPresence,user.id)
        if not row:row=PaymentPresence(user_id=user.id);db.add(row)
        row.seen_at=now();commit(db);return {'ok':True}

    @router.get('/state')
    def state(db:Session=Depends(get_db),user:User=Depends(current_user)):
        role=db.get(AdminRole,user.id);da=bool(role and role.role=='DA')
        own=list(db.scalars(select(PaymentRequest).where(PaymentRequest.user_id==user.id,PaymentRequest.status.in_(LIVE)).order_by(PaymentRequest.created_at)))
        mine=list(db.scalars(select(PaymentRequest).where(PaymentRequest.assigned_to==user.id,PaymentRequest.status.in_(ASSIGNED)).order_by(PaymentRequest.created_at))) if da else []
        rows=own+mine;unread={}
        for r in rows:
            read=r.customer_read if r.user_id==user.id else r.agent_read
            unread[r.id]=int(db.scalar(select(func.count()).select_from(PaymentMessage).where(PaymentMessage.request_id==r.id,PaymentMessage.sender_id!=user.id,PaymentMessage.id>read)) or 0)
        pending_query=select(PaymentRequest).where(PaymentRequest.status=='pending',PaymentRequest.user_id!=user.id)
        pending=list(db.scalars(pending_query.order_by(PaymentRequest.created_at.desc(),PaymentRequest.id.desc()).limit(50))) if da else []
        return {'is_da':da,'own':[summary(r,user.id) for r in own],'assigned':[summary(r,user.id) for r in mine],'unread':unread,'pending_count':int(db.scalar(select(func.count()).select_from(PaymentRequest).where(PaymentRequest.status=='pending',PaymentRequest.user_id!=user.id)) or 0) if da else 0,'pending_alerts':[{'id':r.id,'created_at':r.created_at} for r in pending]}


    @router.post('/requests')
    def create(payload:Create,db:Session=Depends(get_db),user:User=Depends(current_user)):
        purchases.lock_user(db,user.id)
        existing=db.scalar(select(PaymentRequest).where(PaymentRequest.user_id==user.id,PaymentRequest.request_key==payload.request_key))
        if existing:
            if existing.package_id!=payload.package_id:raise HTTPException(409,'İstek anahtarı başka paket için kullanılmış.')
            return {**summary(existing,user.id),'available_da':free_da_count(db,user.id)}
        live=db.scalar(select(PaymentRequest).where(PaymentRequest.user_id==user.id,PaymentRequest.status.in_(LIVE)).limit(1))
        if live:raise HTTPException(409,{'message':'Mevcut ödeme isteğinizi mesaj kutunuzdan takip edin.','request_id':live.id})
        legacy=db.scalar(select(LidyaOrder.id).where(LidyaOrder.user_id==user.id,LidyaOrder.status.in_(['awaiting','pending','active'])).limit(1))
        if legacy:raise HTTPException(409,'Önce eski ödeme kaydınızı iptal edin. Önceden yaptığınız ödeme için DA ile iletişime geçin.')
        p=purchases.PACKAGES[payload.package_id-1]
        row=PaymentRequest(id=str(uuid4()),user_id=user.id,public_id=user.public_id,nickname=user.nickname,request_key=payload.request_key,status='pending',customer_ack=False,agent_ack=False,customer_read=0,agent_read=0,reason='',package_id=p['id'],price_try=p['price_try'],base=p['base'],bonus=p['bonus'],total=p['total'])
        # Package's numeric id is distinct from the UUID request identifier.
        db.add(row);flush(db)
        event(db,row,user,'requested',price_try=row.price_try,base=row.base,bonus=row.bonus,total=row.total)
        for uid in db.scalars(select(AdminRole.user_id).where(AdminRole.role=='DA',AdminRole.user_id!=user.id)):
            note(db,uid,'Yükleme isteği',f'İşlem: Ödeme İsteği • ID {row.public_id} • {row.price_try} TL • {row.total} Lidya')
        commit(db);return {**summary(row,user.id),'available_da':free_da_count(db,user.id)}

    @router.get('/requests')
    def mine(before:str|None=None,db:Session=Depends(get_db),user:User=Depends(current_user)):
        q=select(PaymentRequest).where(PaymentRequest.user_id==user.id)
        if before:
            cursor=get(db,before)
            if cursor.user_id!=user.id:raise HTTPException(403,'Kayıt size ait değil.')
            q=q.where((PaymentRequest.created_at<cursor.created_at)|((PaymentRequest.created_at==cursor.created_at)&(PaymentRequest.id<cursor.id)))
        rows=list(db.scalars(q.order_by(PaymentRequest.created_at.desc(),PaymentRequest.id.desc()).limit(51)))
        return {'items':[summary(r,user.id) for r in rows[:50]],'next':rows[49].id if len(rows)>50 else None}

    @router.get('/history')
    def customer_history(page:int=Query(1,ge=1,le=1_000_000),db:Session=Depends(get_db),user:User=Depends(current_user)):
        q=select(PaymentRequest).where(PaymentRequest.user_id==user.id)
        total=int(db.scalar(select(func.count()).select_from(q.subquery())) or 0);pages=max(1,(total+19)//20);page=min(page,pages)
        rows=list(db.scalars(q.order_by(PaymentRequest.created_at.desc(),PaymentRequest.id.desc()).offset((page-1)*20).limit(20)))
        numbers=dict(db.execute(select(PaymentEvent.request_id,func.min(PaymentEvent.id)).where(PaymentEvent.request_id.in_([r.id for r in rows]),PaymentEvent.action=='requested').group_by(PaymentEvent.request_id)).all()) if rows else {}
        return {'items':[{**summary(r,user.id),'transaction_number':numbers.get(r.id) or r.id} for r in rows],'page':page,'pages':pages,'page_size':20,'total':total}

    @router.get('/history/{identifier}')
    def customer_history_detail(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get(db,identifier)
        if row.user_id!=user.id:raise HTTPException(403,'Bu ödeme kaydı size ait değil.')
        number=db.scalar(select(func.min(PaymentEvent.id)).where(PaymentEvent.request_id==row.id,PaymentEvent.action=='requested'))
        return {**summary(row,user.id),'transaction_number':number or row.id}

    @router.get('/admin/requests')
    def queue(before:str|None=None,records:bool=False,q:str=Query('',max_length=100),status:str=Query('all',pattern='^(all|pending|connecting|chat|rejecting|finishing|approved|rejected|cancelled)$'),assignment:str=Query('all',pattern='^(all|mine|unassigned)$'),days:int|None=Query(None,ge=1,le=365),db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);search=q;q=select(PaymentRequest)
        if search:q=q.where(or_(PaymentRequest.public_id==search,PaymentRequest.id==search,PaymentRequest.transaction_reference==search))
        if status!='all':q=q.where(PaymentRequest.status==status)
        if assignment=='mine':q=q.where(PaymentRequest.assigned_to==user.id)
        elif assignment=='unassigned':q=q.where(PaymentRequest.assigned_to.is_(None))
        if days:q=q.where(PaymentRequest.created_at>=now()-timedelta(days=days))
        if not records:q=q.where(PaymentRequest.status.in_(LIVE))
        if before:
            cursor=get(db,before)
            q=q.where(((PaymentRequest.created_at<cursor.created_at)|((PaymentRequest.created_at==cursor.created_at)&(PaymentRequest.id<cursor.id))) if records else ((PaymentRequest.created_at>cursor.created_at)|((PaymentRequest.created_at==cursor.created_at)&(PaymentRequest.id>cursor.id))))
        rows=list(db.scalars(q.order_by(PaymentRequest.created_at.desc() if records else PaymentRequest.created_at.asc(),PaymentRequest.id.desc() if records else PaymentRequest.id.asc()).limit(51)))
        return {'items':[{**summary(r,user.id),'recoverable':recoverable(db,r)} for r in rows[:50]],'next':rows[49].id if len(rows)>50 else None}

    @router.get('/requests/{identifier}')
    def detail(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get(db,identifier);side(db,user,row);return summary(row,user.id)

    @router.post('/requests/{identifier}/accept')
    def accept(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user,True);row=get(db,identifier,True)
        if row.assigned_to==user.id and row.status in ASSIGNED:return summary(row,user.id)
        if row.status!='pending':raise HTTPException(409,'Bu istek başka bir DA tarafından üstlenildi veya kapandı.')
        idle(db,user,row)
        try:
            changed=db.execute(update(PaymentRequest).where(PaymentRequest.id==row.id,PaymentRequest.status=='pending').values(assigned_to=user.id,agent_public_id=user.public_id,accepted_at=now(),status='connecting',customer_ack=False,agent_ack=False).execution_options(synchronize_session=False)).rowcount
        except IntegrityError:
            db.rollback();raise HTTPException(409,'Başka bir görüşme veya yetkili bu işlemi üstlendi.')
        if changed!=1:raise HTTPException(409,'Bu istek başka bir DA tarafından üstlenildi.')
        db.refresh(row)
        event(db,row,user,'accepted');note(db,row.user_id,'Ödeme isteğiniz kabul edildi','Yönetim ekibi ile iletişime geçiyorsunuz. Lütfen uygulamadaki bilgilendirme penceresini kapatın.');commit(db);return summary(row,user.id)

    @router.post('/requests/{identifier}/ready')
    def ready(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get(db,identifier,True);who=side(db,user,row)
        if row.status=='chat':return summary(row,user.id)
        if row.status!='connecting':raise HTTPException(409,'Bağlantı onayı bu aşamada alınamaz.')
        field='customer_ack' if who=='customer' else 'agent_ack'
        if not getattr(row,field):setattr(row,field,True);event(db,row,user,'ready',side=who)
        flush(db)
        opened=db.execute(update(PaymentRequest).where(PaymentRequest.id==row.id,PaymentRequest.status=='connecting',PaymentRequest.customer_ack.is_(True),PaymentRequest.agent_ack.is_(True)).values(status='chat').execution_options(synchronize_session=False)).rowcount
        db.refresh(row)
        if opened:
            event(db,row,user,'chat_opened')
            for uid in (row.user_id,row.assigned_to):note(db,uid,'Mesaj kutunuzu kontrol edin','Ödeme görüşmeniz hazır. Mesaj kutunuzu kontrol edin.')
        commit(db);return summary(row,user.id)

    @router.post('/requests/{identifier}/cancel')
    def cancel(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get(db,identifier,True)
        if row.user_id!=user.id:raise HTTPException(403,'İstek size ait değil.')
        if row.status=='cancelled':return summary(row,user.id)
        if row.status!='pending':raise HTTPException(409,'DA tarafından üstlenilen istek burada iptal edilemez.')
        row.status='cancelled';row.closed_at=now();event(db,row,user,'cancelled');commit(db);return summary(row,user.id)

    @router.post('/requests/{identifier}/release')
    def release(identifier:str,payload:Reason,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=assigned(db,user,identifier)
        if row.status not in ('connecting','chat') or row.credit_operation_id:raise HTTPException(409,'Bu aşamada istek kuyruğa bırakılamaz.')
        event(db,row,user,'released',reason=payload.reason);row.status='pending';row.assigned_to=None;row.agent_public_id=None;row.customer_ack=False;row.agent_ack=False
        note(db,row.user_id,'Ödeme isteği sırada','İsteğiniz başka bir DA tarafından devam ettirilmek üzere kuyruğa alındı.');commit(db);return summary(row,user.id)

    @router.post('/requests/{identifier}/recover')
    def recover(identifier:str,payload:Reason,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user,True);row=get(db,identifier,True)
        if not recoverable(db,row):raise HTTPException(409,'DA halen aktif; istek devralınamaz.')
        idle(db,user,row);previous=row.agent_public_id;row.assigned_to=user.id;row.agent_public_id=user.public_id;row.accepted_at=now()
        if row.status in ('connecting','chat'):row.status='connecting';row.customer_ack=False;row.agent_ack=False
        event(db,row,user,'recovered',previous_agent=previous,reason=payload.reason)
        note(db,row.user_id,'Ödeme isteği devralındı','İsteğiniz başka bir DA tarafından devam ettiriliyor. Mesaj kutunuzu kontrol edin.');commit(db);return summary(row,user.id)

    @router.get('/requests/{identifier}/messages')
    def messages(identifier:str,after:int=Query(0,ge=0),db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get(db,identifier);side(db,user,row)
        if row.status not in ('chat','finishing'):raise HTTPException(409,'Görüşme henüz hazır değil veya kapatıldı.')
        return message_page(db,row,after)

    @router.post('/requests/{identifier}/messages')
    def send(identifier:str,payload:Message,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get(db,identifier,True);who=side(db,user,row)
        if row.status!='chat' or not row.customer_ack or not row.agent_ack:raise HTTPException(409,'İki taraf bağlantıyı onaylamalı; görüşme açık olmalı.')
        old=db.scalar(select(PaymentMessage).where(PaymentMessage.request_id==row.id,PaymentMessage.sender_id==user.id,PaymentMessage.request_key==payload.request_key))
        if old:
            incoming_sha=image_bytes(payload.photo)[1] if payload.photo else None
            if old.message!=payload.message or old.photo_sha!=incoming_sha:raise HTTPException(409,'Mesaj anahtarı daha önce kullanıldı.')
            return {'id':old.id}
        last=db.scalar(select(PaymentMessage).where(PaymentMessage.request_id==row.id,PaymentMessage.sender_id==user.id).order_by(PaymentMessage.id.desc()).limit(1))
        if last and aware(last.created_at)>now()-timedelta(seconds=1):raise HTTPException(429,'Yeni mesaj için bir saniye bekleyin.')
        if (db.scalar(select(func.count()).select_from(PaymentMessage).where(PaymentMessage.request_id==row.id)) or 0)>=1000:raise HTTPException(409,'Görüşme 1000 mesaj sınırına ulaştı.')
        if payload.photo and who!='customer':raise HTTPException(403,'Dekont fotoğrafını yalnızca müşteri gönderebilir.')
        raw=None;sha=None
        if payload.photo:
            if (db.scalar(select(func.count()).select_from(PaymentMessage).where(PaymentMessage.request_id==row.id,PaymentMessage.photo_sha.is_not(None))) or 0)>=30:raise HTTPException(409,'Görüşmede en fazla 30 fotoğraf saklanabilir.')
            raw,sha=image_bytes(payload.photo)
        msg=PaymentMessage(request_id=row.id,sender_id=user.id,sender_public_id=user.public_id,sender_side=who,request_key=payload.request_key,message=payload.message,photo=raw,photo_sha=sha)
        db.add(msg);flush(db);event(db,row,user,'message_sent',message_id=msg.id,has_photo=bool(raw));commit(db);return {'id':msg.id}

    @router.post('/requests/{identifier}/read')
    def read(identifier:str,payload:Read,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get(db,identifier,True);who=side(db,user,row)
        if row.status not in ('chat','finishing'):raise HTTPException(409,'Görüşme kapalı.')
        msg=db.get(PaymentMessage,payload.message_id) if payload.message_id else None
        if payload.message_id and (not msg or msg.request_id!=row.id):raise HTTPException(422,'Mesaj bu görüşmeye ait değil.')
        key='customer_read' if who=='customer' else 'agent_read';setattr(row,key,max(getattr(row,key),payload.message_id));commit(db);return {'ok':True}

    @router.get('/requests/{identifier}/photos/{message_id}')
    def photo(identifier:str,message_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get(db,identifier);side(db,user,row)
        if row.status not in ('chat','finishing'):raise HTTPException(403,'Görüşme fotoğrafları kapatıldı.')
        return photo_response(db,row,message_id)

    @router.get('/requests/{identifier}/credit-evidence')
    def credit_evidence(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=assigned(db,user,identifier)
        if row.status not in ('chat','finishing'):raise HTTPException(409,'Görüşme açık değil.')
        msg=latest_customer_receipt(db,row)
        if row.credit_operation_id:
            msg=db.scalar(select(PaymentMessage).where(PaymentMessage.request_id==row.id,PaymentMessage.sender_id==row.user_id,PaymentMessage.photo_sha==row.receipt_sha).order_by(PaymentMessage.id.desc()).limit(1))
        return {'photo_message_id':msg.id if msg else None,'created_at':msg.created_at if msg else None,'credited':bool(row.credit_operation_id)}

    @router.post('/requests/{identifier}/credit')
    def credit(identifier:str,payload:Credit,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=assigned(db,user,identifier)
        if row.credit_operation_id:
            if row.transaction_reference!=payload.transaction_reference:raise HTTPException(409,'Bu talep farklı referansla yüklenmiş.')
            return summary(row,user.id)
        if row.status!='chat':raise HTTPException(409,'Önce çift taraflı görüşme başlamalı.')
        if not payload.verified:raise HTTPException(422,'Ödeme tutarını ve banka/sağlayıcı referansını kontrol ettiğinizi onaylayın.')
        msg=db.get(PaymentMessage,payload.photo_message_id) if payload.photo_message_id else latest_customer_receipt(db,row)
        if not msg or msg.request_id!=row.id or msg.sender_id!=row.user_id or msg.sender_side!='customer' or not msg.photo:raise HTTPException(422,'Müşterinin bu görüşmeye gönderdiği dekont bekleniyor.')
        with Image.open(BytesIO(msg.photo)) as image:require_visible_photo(image)
        reference=payload.transaction_reference
        if db.scalar(select(PaymentRequest.id).where(PaymentRequest.transaction_reference==reference)) or db.scalar(select(LidyaOrder.id).where(LidyaOrder.transaction_reference==reference)):
            raise HTTPException(409,'Bu ödeme referansı başka bir yüklemede kullanılmış.')
        if db.scalar(select(PaymentRequest.id).where(PaymentRequest.receipt_sha==msg.photo_sha)) or db.scalar(select(LidyaOrder.id).where(LidyaOrder.approved_document_sha==msg.photo_sha)):
            raise HTTPException(409,'Bu dekont başka bir ödeme için kullanılmış.')
        target=purchases.lock_user(db,row.user_id);before=int(target.lidya or 0)
        if before+row.total>purchases.LIMIT:raise HTTPException(422,'Bakiye üst sınırı aşılıyor.')
        row.transaction_reference=reference;row.receipt_sha=msg.photo_sha
        flush(db)  # Reserve unique payment evidence before changing any balance.
        operation_id=str(uuid4())
        db.info.update(lidya_operation='payment_assistance_credit',lidya_actor_id=user.id,lidya_reference_id=row.id,lidya_details=f'total={row.total}; package={row.package_id}')
        evidence='data:image/jpeg;base64,'+base64.b64encode(msg.photo).decode()
        db.add(LidyaOperation(id=operation_id,request_key='assisted-'+row.id,admin_id=user.id,admin_role='DA',admin_name=user.nickname,user_id=row.user_id,public_id=row.public_id,amount=row.total,before=before,after=before+row.total,operation='EKLEME',evidence=evidence,exemption_sha=''))
        flush(db)
        row.credit_operation_id=operation_id;target.lidya=before+row.total
        from .vip_membership import record_purchase
        record_purchase(db,target.id,int(row.total),"assisted",row.id)
        event(db,row,user,'credited',operation_id=operation_id,before=str(before),after=str(target.lidya),total=row.total,transaction_reference=reference,photo_message_id=msg.id)
        note(db,row.user_id,'Lidya yüklendi',f'Bonus dahil {row.total} Lidya hesabınıza yüklendi.');commit(db);return summary(row,user.id)

    @router.post('/requests/{identifier}/approve')
    def approve(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=assigned(db,user,identifier)
        if row.status in ('finishing','approved'):return summary(row,user.id)
        if row.status!='chat' or not row.credit_operation_id:raise HTTPException(409,'Önce bu isteğe bağlı Lidya yüklemesini tamamlayın.')
        row.status='finishing';event(db,row,user,'approved');commit(db);return summary(row,user.id)

    @router.post('/requests/{identifier}/finish')
    def finish(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=assigned(db,user,identifier)
        if row.status=='approved':return summary(row,user.id)
        if row.status!='finishing':raise HTTPException(409,'Önce işlem onaylanmalı.')
        row.status='approved';row.closed_at=now();event(db,row,user,'closed');note(db,row.user_id,'Ödeme işlemi tamamlandı','Ödeme görüşmeniz kapatıldı. Bonus dahil Lidya yüklemeniz tamamlandı.');commit(db);return summary(row,user.id)

    @router.post('/requests/{identifier}/begin-rejection')
    def begin_rejection(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=assigned(db,user,identifier)
        if row.status=='rejecting':return summary(row,user.id)
        if row.status not in ('connecting','chat') or row.credit_operation_id:raise HTTPException(409,'Lidya yüklenen veya tamamlanan işlem reddedilemez.')
        row.status='rejecting';event(db,row,user,'rejection_started');commit(db);return summary(row,user.id)

    @router.post('/requests/{identifier}/reject')
    def reject(identifier:str,payload:Reason,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=assigned(db,user,identifier)
        if row.status=='rejected' and row.reason==payload.reason:return summary(row,user.id)
        if row.status!='rejecting' or row.credit_operation_id:raise HTTPException(409,'Ret beyanı bu aşamada kaydedilemez.')
        row.status='rejected';row.reason=payload.reason;row.closed_at=now();event(db,row,user,'rejected',reason=payload.reason)
        note(db,row.user_id,'Ödeme isteğiniz reddedildi',payload.reason);commit(db);return summary(row,user.id)

    @router.get('/admin/records')
    def records_index(page:int=Query(1,ge=1,le=1_000_000),archive:bool=False,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user)
        q=select(PaymentRequest)
        if not archive:q=q.where(~select(PaymentReviewClosure.request_id).where(PaymentReviewClosure.request_id==PaymentRequest.id).exists())
        total=int(db.scalar(select(func.count()).select_from(q.subquery())) or 0)
        pages=max(1,(total+19)//20);page=min(page,pages)
        rows=list(db.scalars(q.order_by(PaymentRequest.created_at.desc(),PaymentRequest.id.desc()).offset((page-1)*20).limit(20)))
        states=review_states(db,rows,user)
        return {'items':[{**summary(r,user.id),**states[r.id]} for r in rows],'total':total,'page':page,'page_size':20,'pages':pages,'archive':archive}

    @router.post('/admin/records/{identifier}/review')
    def review_record(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);row=get(db,identifier,True)
        if row.status not in TERMINAL:raise HTTPException(409,'İnceleme onayı yalnızca tamamlanmış, reddedilmiş veya iptal edilmiş işlemlerde verilir.')
        closure=db.get(PaymentReviewClosure,row.id)
        if closure:return {**summary(row,user.id),**review_states(db,[row],user)[row.id]}
        if not db.scalar(select(PaymentEvent.id).where(PaymentEvent.request_id==row.id,PaymentEvent.actor_id==user.id,PaymentEvent.action=='record_viewed').limit(1)):
            raise HTTPException(409,'Önce ödeme kaydını ve konuşmayı açıp inceleyin.')
        if not db.get(PaymentReview,(row.id,user.id)):
            db.add(PaymentReview(request_id=row.id,user_id=user.id));flush(db)
            event(db,row,user,'review_confirmed')
        required=active_da_ids(db)
        reviewed=set(db.scalars(select(PaymentReview.user_id).where(PaymentReview.request_id==row.id)))
        if required and required<=reviewed:
            db.add(PaymentReviewClosure(request_id=row.id,required_da_ids=json.dumps(sorted(required))))
            event(db,row,user,'review_archived',reviewers=sorted(required))
        commit(db)
        return {**summary(row,user.id),**review_states(db,[row],user)[row.id]}

    @router.get('/admin/records/{identifier}')
    def record(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);row=get(db,identifier);event(db,row,user,'record_viewed');commit(db)
        operation=db.get(LidyaOperation,row.credit_operation_id) if row.credit_operation_id else None
        return {**summary(row,user.id),**review_states(db,[row],user)[row.id],'transaction_reference':row.transaction_reference,'operation':purchases.operation_view(operation) if operation else None}

    @router.get('/admin/records/{identifier}/messages')
    def archive_messages(identifier:str,after:int=Query(0,ge=0),db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);return message_page(db,get(db,identifier),after)

    @router.get('/admin/records/{identifier}/events')
    def archive_events(identifier:str,after:int=Query(0,ge=0),db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);row=get(db,identifier)
        rows=list(db.scalars(select(PaymentEvent).where(PaymentEvent.request_id==row.id,PaymentEvent.id>after).order_by(PaymentEvent.id).limit(201)))
        return {'items':[{'id':e.id,'actor_public_id':e.actor_public_id,'action':e.action,'details':json.loads(e.details),'created_at':e.created_at} for e in rows[:200]],'next':rows[199].id if len(rows)>200 else None}

    @router.get('/admin/records/{identifier}/photos/{message_id}')
    def archive_photo(identifier:str,message_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_da(db,user);return photo_response(db,get(db,identifier),message_id)


def message_page(db,row,after):
    # Use row tuples; do not fetch private image bytes with every chat refresh.
    rows=list(db.execute(select(PaymentMessage.id,PaymentMessage.sender_side,PaymentMessage.sender_public_id,PaymentMessage.message,PaymentMessage.created_at,PaymentMessage.photo_sha).where(PaymentMessage.request_id==row.id,PaymentMessage.id>after).order_by(PaymentMessage.id).limit(101)))
    return {'items':[{'id':m.id,'sender_side':m.sender_side,'sender_public_id':m.sender_public_id,'message':m.message,'created_at':m.created_at,'has_photo':bool(m.photo_sha)} for m in rows[:100]],'next':rows[99].id if len(rows)>100 else None}

def photo_response(db,row,message_id):
    msg=db.get(PaymentMessage,message_id)
    if not msg or msg.request_id!=row.id or not msg.photo:raise HTTPException(404,'Fotoğraf bulunamadı.')
    try:
        with Image.open(BytesIO(msg.photo)) as image:require_visible_photo(image)
    except (OSError,ValueError,SyntaxError,Image.DecompressionBombError) as exc:
        raise HTTPException(422,'Kaydedilmiş fotoğraf okunamıyor. Asıl dekontu yeniden gönderin.') from exc
    return Response(msg.photo,media_type='image/jpeg',headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="dekont.jpg"'})





