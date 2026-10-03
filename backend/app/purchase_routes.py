"""Package prices and credit decisions are authoritative on the server."""
import base64
import hashlib
import json
import re
from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4
from zoneinfo import ZoneInfo
import requests
from PIL import Image
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .models import User
from .admin_models import AdminRole, AdminAuditLog, FaActionLog
from .platform_models import Notification
from .purchase_models import PaymentSettings, LidyaOrder, LidyaOperation, LidyaPurchaseMessage

router = APIRouter(tags=['lidya-purchases'])
MAIL_DA_ID = '1980629492'
LIMIT = 9_000_000_000_000_000_000
PACKAGES = [dict(id=i+1,price_try=p,base=b,bonus=x,total=b+x) for i,(p,b,x) in enumerate([
    (2,80,15),(7,320,79),(14,640,172),(28,1280,326),(42,1920,498),(73,3360,872),
    (105,4800,1245),(205,9000,2334),(305,13200,3423),(504,21600,5602),
    (856,37800,9800),(1209,54000,14000),(1813,81000,21000),(2418,108000,28000),
    (3022,135000,35000),(3627,162000,42000)])]
CARD_NOTICE = 'Bu görüşme yalnızca DA yetkili 1980629492 hesabıyla yapılır. Kart numarası, son kullanma tarihi ve CVV paylaşmayın. Belgelerde kart bilgilerini maskeleyin. Tahsilat yalnızca bankanın güvenli ödeme kanalı üzerinden yapılmalıdır.'

def role(db, uid):
    row=db.get(AdminRole,uid)
    return row.role if row else None

def require_admin(db,user):
    value=role(db,user.id)
    if value not in {'FA','DA'}: raise HTTPException(403,'Bu panel yalnızca FA ve DA yetkililerine açıktır.')
    return value

def require_mail_da(db,user):
    if user.public_id != MAIL_DA_ID or role(db,user.id) != 'DA':
        raise HTTPException(403,'Mail Order yalnızca DA yetkili 1980629492 hesabına açıktır.')

def valid_iban(value):
    value=re.sub(r'\s','',value).upper()
    if not re.fullmatch(r'TR\d{24}',value): return False
    numeric=''.join(str(ord(c)-55) if c.isalpha() else c for c in value[4:]+value[:4])
    return int(numeric)%97==1

def bank_settings(db):
    row=db.get(PaymentSettings,1)
    result={'iban':row.iban if row else settings.payment_iban,'account_name':row.account_name if row else settings.payment_account_name,'bank_name':row.bank_name if row else settings.payment_bank_name}
    result['iban']=re.sub(r'\s','',result['iban']).upper()
    result['enabled']=bool(valid_iban(result['iban']) and result['account_name'].strip())
    if not result['enabled']: result['iban']=''
    return result

def exemption(public_id):
    """No cached grant: every new operation reads GitHub; failure requires evidence."""
    headers={'Accept':'application/vnd.github+json','Cache-Control':'no-cache'}
    if settings.github_read_token: headers['Authorization']='Bearer '+settings.github_read_token
    try:
        # The existing repo document has no .txt suffix. Prefer the documented
        # name when created; only an actual 404 permits the legacy-name lookup.
        for filename in ('KANITGEREKMEYENID.txt','KANITGEREKMEYENID'):
            r=requests.get('https://api.github.com/repos/erischat-proje/erishat/contents/'+filename,
                params={'ref':settings.lidya_exempt_ref,'fresh':str(uuid4())},headers=headers,timeout=4)
            if r.status_code != 404: break
        r.raise_for_status(); data=r.json()
        raw=base64.b64decode(data['content'],validate=False).decode('utf-8-sig')
        ids={line.strip() for line in raw.splitlines() if re.fullmatch(r'\d{10}',line.strip())}
        return public_id in ids, data.get('sha','')
    except (requests.RequestException,ValueError,KeyError,TypeError): return False,''

def decode_document(value, pdf=False):
    match=re.fullmatch(r'data:(image/(?:png|jpeg|webp)|application/pdf);base64,([A-Za-z0-9+/]+={0,2})',value)
    if not match: raise ValueError('JPEG, PNG, WebP veya PDF dosyası gerekli.')
    raw=base64.b64decode(match[2],validate=True); mime=match[1]
    if not raw or len(raw)>3_000_000: raise ValueError('Dosya en fazla 3 MB olabilir.')
    if mime=='application/pdf':
        if not pdf or not raw.startswith(b'%PDF-'): raise ValueError('Bu işlem için fotoğraf kanıtı gerekli.')
    else:
        try:
            with Image.open(BytesIO(raw)) as img:
                if img.format not in {'JPEG','PNG','WEBP'} or img.width*img.height>20_000_000: raise ValueError('Geçersiz fotoğraf.')
                expected={'JPEG':'image/jpeg','PNG':'image/png','WEBP':'image/webp'}[img.format]
                if expected!=mime: raise ValueError('Fotoğraf türü eşleşmiyor.')
                img.verify()
        except Exception as exc: raise ValueError('Geçersiz fotoğraf.') from exc
    return raw,mime

class ManualAmount(BaseModel):
    amount: int = Field(gt=0,le=LIMIT)
    request_key: str = Field(min_length=16,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')
    evidence: str = Field(default='',max_length=4_100_000)
    @field_validator('amount',mode='before')
    @classmethod
    def integer_only(cls,value):
        if isinstance(value,bool) or not isinstance(value,(int,str)) or (isinstance(value,str) and not re.fullmatch(r'\d{1,19}',value)):
            raise ValueError('Lidya miktarı pozitif bir tam sayı olmalı.')
        return value
    @field_validator('evidence')
    @classmethod
    def check(cls,value):
        if value: decode_document(value)
        return value

class CreateOrder(BaseModel):
    package_id: int = Field(ge=1,le=16)
    method: str = Field(pattern=r'^(iban|mail_order)$')
    request_key: str = Field(min_length=16,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')

class Document(BaseModel):
    evidence: str = Field(min_length=1,max_length=4_100_000)
    masked_confirmed: bool = False
    @field_validator('evidence')
    @classmethod
    def check(cls,value): decode_document(value,True); return value

class Decision(BaseModel):
    approve: bool
    verified: bool = False
    transaction_reference: str = Field(default='',max_length=100)
    note: str = Field(default='',max_length=1000)
    @field_validator('transaction_reference')
    @classmethod
    def clean(cls,value):
        value=value.strip().upper()
        if value and not re.fullmatch(r'[A-Z0-9._:/-]{6,100}',value): raise ValueError('Banka/sağlayıcı işlem referansı 6–100 harf, rakam veya . _ : / - içermeli.')
        return value

class BankConfig(BaseModel):
    iban: str = Field(max_length=40)
    account_name: str = Field(max_length=160)
    bank_name: str = Field(default='',max_length=100)
    @field_validator('iban')
    @classmethod
    def check(cls,value):
        value=re.sub(r'\s','',value).upper()
        if value and not valid_iban(value): raise ValueError('Geçerli bir Türkiye IBAN numarası girin.')
        return value

class ChatMessage(BaseModel):
    message: str = Field(min_length=1,max_length=2000)
    @field_validator('message')
    @classmethod
    def check(cls,value):
        value=value.strip()
        if not value: raise ValueError('Mesaj boş olamaz.')
        if re.search(r'(?i)\b(cvv|cvc|kart\s*numarası|card\s*number)\s*[:=]?\s*\d',value):
            raise ValueError('Kart numarası/CVV sohbetten gönderilemez.')
        for found in re.finditer(r'(?<!\d)(?:\d[ -]?){13,19}(?!\d)',value):
            digits=[int(c) for c in found[0] if c.isdigit()]
            if 13<=len(digits)<=19:
                total=sum((d*2-9 if d*2>9 else d*2) if (len(digits)-i)%2==0 else d for i,d in enumerate(digits))
                if total%10==0: raise ValueError('Kart numarası sohbetten gönderilemez. Güvenli ödeme kanalını kullanın.')
        return value

def commit(db):
    try: db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(409,'İstek veya ödeme referansı daha önce kullanılmış. Güncel kayıtları kontrol edin.')

def lock_user(db,uid):
    result=db.scalar(select(User).where(User.id==uid).with_for_update().execution_options(populate_existing=True))
    if not result: raise HTTPException(404,'Kullanıcı bulunamadı.')
    return result

def audit(db,user,action,details,target=None):
    with db.no_autoflush:
        admin_role=role(db,user.id)
    data=json.dumps({**details,"actor_role":admin_role},ensure_ascii=False)
    db.add(AdminAuditLog(admin_id=user.id,action=action,target_user_id=target,details=data))
    if admin_role=='FA': db.add(FaActionLog(admin_id=user.id,action=action,target_user_id=target,details=data))

def operation_view(row):
    created=row.created_at or datetime.now(timezone.utc)
    if not created.tzinfo: created=created.replace(tzinfo=timezone.utc)
    stamp=created.astimezone(ZoneInfo('Europe/Istanbul')).strftime('%d.%m.%Y %H:%M:%S')
    proof=f'/v1/admin/purchases/operations/{row.id}/evidence' if row.evidence else 'Muaf (ID Listesi Dahilinde)'
    lines=['='*50,'[ERISCHAT LİDYA İŞLEMLERİ DENETİM LOGU]','='*50,
        f'İŞLEMİ YAPAN ADMİN : [Rütbe: {row.admin_role}] - {row.admin_name}',f'İŞLEM TARİHİ : {stamp}',
        f'LİDYA ID : {row.public_id}',f'LİDYA MİKTARI : {row.amount}',f'İŞLEM ÖNCESİ LİDYA MİKTARI : {row.before}',
        f'İŞLEM SONRASI LİDYA MİKTARI : {row.after}',f'YAPILAN İŞLEM : {row.operation}',f'KANIT : {proof}','='*50]
    return {'id':row.id,'admin_role':row.admin_role,'admin_name':row.admin_name,'public_id':row.public_id,'amount':str(row.amount),
        'before':str(row.before),'after':str(row.after),'operation':row.operation,'created_at':created.isoformat(),
        'evidence_url':proof if row.evidence else None,'exempt':not bool(row.evidence),'exemption_sha':row.exemption_sha,'log':'\n'.join(lines)}

def manual_change(db,user,target,payload,operation):
    admin_role=require_admin(db,user)
    existing=db.scalar(select(LidyaOperation).where(LidyaOperation.request_key==payload.request_key))
    if existing:
        if (existing.admin_id,existing.user_id,existing.amount,existing.operation)!=(user.id,target.id,payload.amount,operation):
            raise HTTPException(409,'İstek anahtarı başka bir işlem için kullanılmış.')
        return operation_view(existing)
    exempt,sha=exemption(target.public_id) if not payload.evidence else (False,'')
    if not payload.evidence and not exempt: raise HTTPException(422,'FA ve DA için fotoğraf kanıtı zorunludur. Muafiyet listesi doğrulanamadığında da kanıt gerekir.')
    target=lock_user(db,target.id); before=int(target.lidya or 0)
    after=before+payload.amount if operation=='EKLEME' else before-payload.amount
    if after<0: raise HTTPException(422,'Yetersiz Lidya bakiyesi. Çıkarma yapılmadı.')
    if after>LIMIT: raise HTTPException(422,'Bakiye üst sınırı aşılıyor.')
    identifier=str(uuid4())
    db.info.update(lidya_operation='admin_lidya_'+('add' if operation=='EKLEME' else 'remove'),lidya_actor_id=user.id,lidya_reference_id=identifier,lidya_details=f'amount={payload.amount}')
    target.lidya=after
    record=LidyaOperation(id=identifier,request_key=payload.request_key,admin_id=user.id,admin_role=admin_role,admin_name=user.nickname,
        user_id=target.id,public_id=target.public_id,amount=payload.amount,before=before,after=after,operation=operation,evidence=payload.evidence,exemption_sha=sha)
    db.add(record);audit(db,user,'lidya_'+operation.lower(),{'operation_id':identifier,'before':before,'after':after,'amount':payload.amount,'exemption_sha':sha},target.id)
    commit(db);return operation_view(record)

def get_order(db,identifier,lock=False):
    query=select(LidyaOrder).where(LidyaOrder.id==identifier)
    if lock: query=query.with_for_update().execution_options(populate_existing=True)
    row=db.scalar(query)
    if not row: raise HTTPException(404,'Ödeme kaydı bulunamadı.')
    return row

def access(db,user,row):
    if user.id==row.user_id: return
    if row.method=='mail_order': require_mail_da(db,user)
    else: require_admin(db,user)

def view(db,row):
    target=db.get(User,row.user_id)
    return {'id':row.id,'public_id':target.public_id,'nickname':target.nickname,'package_id':row.package_id,'price_try':row.price_try,
        'base':row.base,'bonus':row.bonus,'total':row.total,'method':row.method,'reference':row.reference,'status':row.status,
        'bank':json.loads(row.bank_json),'created_at':row.created_at,'decision_note':row.decision_note,
        'evidence_url':f'/v1/purchases/orders/{row.id}/evidence' if row.evidence else None,
        'accepted_by':row.accepted_by,'notice':CARD_NOTICE if row.method=='mail_order' else '',
        'messages':[{'id':m.id,'own':m.sender_id==row.user_id,'message':m.message,'created_at':m.created_at} for m in db.scalars(select(LidyaPurchaseMessage).where(LidyaPurchaseMessage.order_id==row.id).order_by(LidyaPurchaseMessage.id).limit(200))]}

def notify(db,uid,title,body):
    db.add(Notification(user_id=uid,kind='lidya_purchase',title=title,body=body))

def document_response(value):
    if not value: raise HTTPException(404,'Belge bulunamadı.')
    raw,mime=decode_document(value,True)
    return Response(raw,media_type=mime,headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':('attachment; filename="dekont.pdf"' if mime=='application/pdf' else 'inline; filename="kanit.'+{'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime]+'"')})

def register_auth(current_user):
    @router.get('/v1/purchases/catalog')
    def catalog(db:Session=Depends(get_db),user:User=Depends(current_user)):
        special=db.scalar(select(User).join(AdminRole,AdminRole.user_id==User.id).where(User.public_id==MAIL_DA_ID,AdminRole.role=='DA',User.is_active.is_(True)))
        return {'packages':PACKAGES,'bank':bank_settings(db),'mail_order_available':bool(special),'mail_order_notice':CARD_NOTICE}

    @router.get('/v1/admin/purchases/settings')
    def settings_get(db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_admin(db,user); return {'bank':bank_settings(db),'can_edit':role(db,user.id)=='DA','mail_da':user.public_id==MAIL_DA_ID and role(db,user.id)=='DA','exempt_ref':settings.lidya_exempt_ref}

    @router.put('/v1/admin/purchases/settings')
    def settings_put(payload:BankConfig,db:Session=Depends(get_db),user:User=Depends(current_user)):
        if role(db,user.id)!='DA': raise HTTPException(403,'Ödeme hesabını yalnızca DA düzenleyebilir.')
        if payload.iban and not payload.account_name.strip(): raise HTTPException(422,'Hesap sahibi zorunludur.')
        row=db.get(PaymentSettings,1)
        if not row: row=PaymentSettings(id=1);db.add(row)
        row.iban=payload.iban;row.account_name=payload.account_name.strip();row.bank_name=payload.bank_name.strip();row.updated_by=user.id
        audit(db,user,'lidya_payment_settings',{'iban_last4':payload.iban[-4:]});commit(db);return bank_settings(db)

    @router.get('/v1/admin/purchases/users/{public_id}')
    def lookup(public_id:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        admin_role=require_admin(db,user)
        target=db.scalar(select(User).where(User.public_id==public_id))
        if not target: raise HTTPException(404,'10 haneli profil ID bulunamadı.')
        return {'public_id':target.public_id,'nickname':target.nickname,'balance':str(target.lidya),'admin_role':admin_role,'admin_name':user.nickname}

    @router.get('/v1/admin/purchases/operations')
    def operations(admin_role:str=Query('FA',pattern='^(FA|DA)$'),db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_admin(db,user)
        return [operation_view(r) for r in db.scalars(select(LidyaOperation).where(LidyaOperation.admin_role==admin_role).order_by(LidyaOperation.created_at.desc()).limit(200))]

    @router.get('/v1/admin/purchases/operations/{identifier}/evidence')
    def operation_evidence(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_admin(db,user); row=db.get(LidyaOperation,identifier)
        if not row: raise HTTPException(404,'İşlem bulunamadı.')
        return document_response(row.evidence)

    @router.post('/v1/purchases/orders')
    def create(payload:CreateOrder,db:Session=Depends(get_db),user:User=Depends(current_user)):
        existing=db.scalar(select(LidyaOrder).where(LidyaOrder.user_id==user.id,LidyaOrder.request_key==payload.request_key))
        if existing:
            if (existing.package_id,existing.method)!=(payload.package_id,payload.method): raise HTTPException(409,'İstek anahtarı başka paket için kullanılmış.')
            return view(db,existing)
        lock_user(db,user.id) # Serializes concurrent customer orders and caps unpaid requests.
        if db.scalar(select(LidyaOrder).where(LidyaOrder.user_id==user.id,LidyaOrder.status.in_(['awaiting','pending','active']))) is not None:
            raise HTTPException(409,'Önce mevcut ödeme kaydını tamamlayın veya iptal edin.')
        bank=bank_settings(db)
        if payload.method=='iban' and not bank['enabled']: raise HTTPException(409,'Havale hesabı henüz yapılandırılmamış.')
        special=None
        if payload.method=='mail_order':
            special=db.scalar(select(User).join(AdminRole,AdminRole.user_id==User.id).where(User.public_id==MAIL_DA_ID,AdminRole.role=='DA',User.is_active.is_(True)))
            if not special: raise HTTPException(409,'Yetkili Mail Order hesabı şu anda kullanılabilir değil.')
        p=PACKAGES[payload.package_id-1]; identifier=str(uuid4())
        row=LidyaOrder(id=identifier,user_id=user.id,request_key=payload.request_key,package_id=p['id'],price_try=p['price_try'],base=p['base'],bonus=p['bonus'],total=p['total'],
            method=payload.method,reference='ERIS-LIDYA-'+identifier.replace('-','').upper(),status='awaiting' if payload.method=='iban' else 'pending',bank_json=json.dumps(bank if payload.method=='iban' else {}))
        db.add(row)
        if special: notify(db,special.id,'Mail Order bağlantı talebi',f'{user.nickname} ({user.public_id}) • {p["price_try"]} TL • {row.reference}')
        commit(db);return view(db,row)

    @router.get('/v1/purchases/orders')
    def mine(db:Session=Depends(get_db),user:User=Depends(current_user)):
        return [view(db,r) for r in db.scalars(select(LidyaOrder).where(LidyaOrder.user_id==user.id).order_by(LidyaOrder.created_at.desc()).limit(50))]

    @router.get('/v1/admin/purchases/orders')
    def inbox(history:bool=False,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_admin(db,user)
        methods=['iban','mail_order'] if user.public_id==MAIL_DA_ID and role(db,user.id)=='DA' else ['iban']
        return [view(db,r) for r in db.scalars(select(LidyaOrder).where(LidyaOrder.method.in_(methods),LidyaOrder.status.in_(['pending','active','approved','rejected','cancelled'] if history else ['pending','active'])).order_by(LidyaOrder.created_at.desc()).limit(100))]

    @router.get('/v1/purchases/orders/{identifier}')
    @router.get('/v1/admin/purchases/orders/{identifier}')
    def detail(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get_order(db,identifier); access(db,user,row);return view(db,row)

    @router.get('/v1/purchases/orders/{identifier}/evidence')
    @router.get('/v1/admin/purchases/orders/{identifier}/evidence')
    def evidence_get(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get_order(db,identifier);access(db,user,row);return document_response(row.evidence)

    @router.post('/v1/purchases/orders/{identifier}/report')
    def report(identifier:str,payload:Document,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get_order(db,identifier,True)
        if row.user_id!=user.id: raise HTTPException(403,'Bu ödeme size ait değil.')
        if row.method!='iban' or row.status!='awaiting': raise HTTPException(409,'Bu ödeme bildirimi zaten gönderildi veya kapandı.')
        row.evidence=payload.evidence;row.status='pending'
        for uid in db.scalars(select(AdminRole.user_id).where(AdminRole.role.in_(['FA','DA']))):
            notify(db,uid,'Lidya ödeme bildirimi',f'{user.nickname} ({user.public_id}) • {row.price_try} TL • {row.reference}')
        commit(db);return view(db,row)

    @router.post('/v1/purchases/orders/{identifier}/document')
    def mail_document(identifier:str,payload:Document,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get_order(db,identifier,True)
        if row.user_id!=user.id: raise HTTPException(403,'Bu ödeme size ait değil.')
        if row.method!='mail_order' or row.status!='active': raise HTTPException(409,'Önce yetkili DA görüşmeyi kabul etmeli.')
        if not payload.masked_confirmed: raise HTTPException(422,'Belgedeki kart bilgilerinin maskelendiğini onaylayın.')
        row.evidence=payload.evidence;commit(db);return view(db,row)

    @router.post('/v1/purchases/orders/{identifier}/cancel')
    def cancel(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get_order(db,identifier,True)
        if row.user_id!=user.id: raise HTTPException(403,'Bu ödeme size ait değil.')
        if row.status not in {'awaiting','pending','active'}: raise HTTPException(409,'Ödeme zaten kapandı.')
        row.status='cancelled';commit(db);return view(db,row)

    @router.post('/v1/admin/purchases/orders/{identifier}/accept')
    def accept(identifier:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        require_mail_da(db,user);row=get_order(db,identifier,True)
        if row.method!='mail_order' or row.status!='pending': raise HTTPException(409,'Görüşme kabul edilemiyor.')
        row.status='active';row.accepted_by=user.id
        notify(db,row.user_id,'Mail Order görüşmesi başladı','DA yetkili 1980629492 talebinizi kabul etti. Kart/CVV bilgisi paylaşmayın.')
        audit(db,user,'lidya_mail_accept',{'order_id':row.id},row.user_id);commit(db);return view(db,row)

    @router.post('/v1/purchases/orders/{identifier}/messages')
    @router.post('/v1/admin/purchases/orders/{identifier}/messages')
    def message(identifier:str,payload:ChatMessage,db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=get_order(db,identifier,True);access(db,user,row)
        if row.method!='mail_order' or row.status!='active': raise HTTPException(409,'Bu görüşme aktif değil.')
        if user.id!=row.user_id: require_mail_da(db,user)
        count=len(list(db.scalars(select(LidyaPurchaseMessage.id).where(LidyaPurchaseMessage.order_id==row.id).limit(200))))
        if count>=200: raise HTTPException(409,'Görüşme mesaj sınırına ulaştı.')
        db.add(LidyaPurchaseMessage(order_id=row.id,sender_id=user.id,message=payload.message));commit(db);return view(db,row)

    @router.post('/v1/admin/purchases/orders/{identifier}/decision')
    def decision(identifier:str,payload:Decision,db:Session=Depends(get_db),user:User=Depends(current_user)):
        admin_role=require_admin(db,user); row=get_order(db,identifier,True)
        if row.method=='mail_order': require_mail_da(db,user)
        if row.status=='approved' and payload.approve: return view(db,row) # no repeated credit
        if row.status not in {'pending','active'}: raise HTTPException(409,'Ödeme zaten kapandı.')
        if payload.approve:
            if row.method=='mail_order' and (row.status!='active' or row.accepted_by!=user.id): raise HTTPException(409,'Önce görüşmeyi kabul edin.')
            if not row.evidence: raise HTTPException(422,'Dekont veya maskelenmiş onay belgesi zorunludur.')
            if not payload.verified or not payload.transaction_reference: raise HTTPException(422,'Bankadan/sağlayıcıdan tutar ve referans doğrulaması zorunludur.')
            proof_sha=hashlib.sha256(decode_document(row.evidence,True)[0]).hexdigest()
            if db.scalar(select(LidyaOrder).where(LidyaOrder.approved_document_sha==proof_sha)):
                raise HTTPException(409,'Bu dekont/onay belgesi başka bir ödeme için zaten kullanılmış.')
            reference=payload.transaction_reference
            if db.scalar(select(LidyaOrder).where(LidyaOrder.transaction_reference==reference)): raise HTTPException(409,'Bu banka/sağlayıcı işlemi başka bir ödemede kullanılmış.')
            target=lock_user(db,row.user_id);before=int(target.lidya or 0)
            if before+row.total>LIMIT: raise HTTPException(422,'Bakiye üst sınırı aşılıyor.')
            db.info.update(lidya_operation='purchase_credit',lidya_actor_id=user.id,lidya_reference_id=row.id,lidya_details=f'package={row.package_id}; total={row.total}')
            target.lidya=before+row.total;row.transaction_reference=reference;row.approved_document_sha=proof_sha;row.status='approved'
            # A purchased credit uses the same reviewable FA/DA balance audit format.
            db.add(LidyaOperation(id=str(uuid4()),request_key='purchase-'+row.id,admin_id=user.id,admin_role=admin_role,admin_name=user.nickname,
                user_id=target.id,public_id=target.public_id,amount=row.total,before=before,after=target.lidya,operation='EKLEME',evidence=row.evidence,exemption_sha=''))
            details={'order_id':row.id,'before':before,'after':target.lidya,'package_id':row.package_id,'total':row.total,'bank_verified':True,'transaction_reference':reference}
        else:
            if len(payload.note.strip())<3: raise HTTPException(422,'Ret gerekçesi zorunludur.')
            row.status='rejected'; details={'order_id':row.id,'reason':payload.note.strip()}
        row.decided_by=user.id;row.decided_at=datetime.now(timezone.utc);row.decision_note=payload.note.strip()
        audit(db,user,'lidya_purchase_'+row.status,details,row.user_id)
        notify(db,row.user_id,'Lidya ödeme sonucu',(f'{row.total} Lidya hesabınıza yüklendi.' if payload.approve else 'Ödeme reddedildi: '+row.decision_note)+' • '+row.reference)
        commit(db);return view(db,row)
