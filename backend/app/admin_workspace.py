"""Role-aware management catalogue, scoped workload and independent staff changes."""
import hashlib,json,logging
from datetime import datetime,timezone
from fastapi import APIRouter,Depends,HTTPException,Query,Response
from pydantic import Field
from sqlalchemy import select,func,or_,and_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from .db import get_db
from .models import User
from .admin_models import AdminRole,AdminAuditLog,SupportAssignment,UserBan,ChatBan
from .case_models import ManagementCase
from .support_models import SupportTicket,SupportFlow
from .management_workflow_models import ManagementFinanceRequest
from .admin_workspace_models import ManagementRoleRequest
from .case_routes import access,TextModel
from .management_events import audit,notify
from .config import settings
from .runtime_tasks import database_task
router=APIRouter(prefix='/v1/admin/workspace',tags=['admin-workspace'])
ALL=('SA','UA','FA','DA');REVIEW=('FA','DA');DA=('DA',)
# This is the canonical inventory. Private tools never enter lower-role responses.
CATALOG=[
 ('tickets','Destek talepleri','Günlük operasyon',ALL,'Göreve özel filtreli destek masası; görüşme, iç not ve olay dosyasına aktarım.','Talebi kabul et → görüşmeyi tamamla → gerekçeli sonuçlandır.'),
 ('announcement','Duyuru gönder','Günlük operasyon',REVIEW,'Kullanıcı duyurusu yayınlama, geçmişi inceleme ve yayından kaldırma.','Taslak kaydet → kayıtlı sürümü önizle → açık onayla yayınla.'),
 ('gaps','Uygulama Geri Bildirimi Paneli','Günlük operasyon',DA,'Geri bildirimleri okuma onayı, sorumlu, durum ve geçmiş ile takip etme.','Öneriyi oku → sorumlu ata → plan/çalışma/sonuç durumunu kaydet.'),
 ('payments','Yükleme İsteği','Günlük operasyon',DA,'Ödeme yardımı taleplerini kanıtlarıyla inceleme ve sonuçlandırma.','Talep → kanıt kontrolü → mevcut ödeme kararı.'),
 ('ghost','Ghost Mode','Günlük operasyon',DA,'Mevcut görünmez yönetici oturumunu açma veya kapatma.','Durumu kontrol et → açıkça onayla → oturum görünürlüğünü değiştir.'),
 ('ban','Kullanıcı Ban','Yaptırım',('UA','DA'),'Hesap veya cihaz yaptırımını delil ve süre ile mevcut kuyruğa gönderme.','Hedef → kanıt → süre → yetkili karar.'),
 ('roomban','Oda Ban','Yaptırım',('UA','DA'),'Bir kullanıcıya oda içinde uygulanacak yaptırımın mevcut akışı.','Oda ve hedef → delil → süre → karar.'),
 ('chatban','CHAT/DM BAN','Yaptırım',('UA','DA'),'Sohbet yaptırımı talebini kanıt ve süre ile oluşturma.','Hedef → kanıt → süre → karar.'),
 ('banrequests','Ban talepleri','Karar kuyrukları',REVIEW,'Size atanmış hesap/cihaz taleplerini bağımsız değerlendirme.','Kanıtı incele → bağımsız onay veya ret.'),
 ('roombanrequests','Oda ban talepleri','Karar kuyrukları',REVIEW,'Oda yaptırımı taleplerinin mevcut bağımsız karar kuyruğu.','Oda ve hedefi doğrula → delili incele → karar.'),
 ('chatbanrequests','Sohbet ban talepleri','Karar kuyrukları',REVIEW,'Sohbet yaptırımı taleplerinin mevcut karar kuyruğu.','Kapsam ve delili kontrol et → karar.'),
 ('banappeals','İtiraz talepleri','Karar kuyrukları',REVIEW,'Reddedilen taleplerin tek fotoğraf kanıtlı itirazı ve bağımsız karar masası.','İlk karar ve ek kanıt → tarafsız itiraz kararı.'),
 ('lookup','ID Sorgu','Sistem yönetimi',DA,'Kullanıcı dizininde arama, kimlik doğrulama ve korumalı hesap özeti.','Kullanıcıyı bul → profil kimliğini doğrula → ilgili araca geç.'),
 ('deleteaccount','Hesap Silme','Sistem yönetimi',DA,'Mevcut güvenli silme akışı; önce hedefi doğrulama ve kalıcı işlem onayı.','ID sorgula → hedefi doğrula → kalıcı işlem onayı. Yetkili hesap silinemez.'),
 ('roles','Yönetici Rolleri','Sistem yönetimi',DA,'Rol verme/değiştirme/kaldırma için bağımsız ikinci yönetici onayı.','Hedefi doğrula → gerekçeli talep → farklı yönetici kararı.'),
 ('saactions','SA işlemleri','Denetim',DA,'Destek yetkililerinin kayıtlarını aktör, tarih ve işlemle süzme.','Filtrele → kaydı incele → görüntülenen kayıtları dışa aktar.'),
 ('uaactions','UA işlemleri','Denetim',DA,'Talep açan yetkililerin işlem geçmişini inceleme.','Filtrele → gerekçe ve hedefi incele.'),
 ('faactions','FA işlemleri','Denetim',DA,'Karar yetkililerinin işlem geçmişini inceleme.','Filtrele → karar ve aktör ayrıntılarını incele.'),
 ('daactions','DA işlemleri','Denetim',DA,'Sistem yetkililerinin kayıtlı işlemlerini inceleme.','Filtrele → gerekçe, aktör ve zamanı incele.'),
 ('banlogs','Ban işlem logları','Denetim',DA,'Uygulanmış hesap/cihaz yaptırımlarının mevcut kayıtları.','Kaydı incele → mevcut yetkili geri alma akışı.'),
 ('roombanlogs','Oda ban işlem logları','Denetim',DA,'Uygulanmış oda yaptırımlarının kayıt ve kanıtları.','Kaydı incele → mevcut yetkili geri alma akışı.'),
 ('chatbanlogs','Sohbet ban işlem logları','Denetim',DA,'Uygulanmış sohbet yaptırımlarının kayıtları.','Kaydı incele → mevcut yetkili geri alma akışı.'),
 ('topup','Lidya yükleme','Mali yönetim',DA,'Doğrudan bakiye değiştirmek yerine bağımsız mali düzeltme akışı.','Kanıtlı talep → inceleme → farklı son onay.'),
 ('lidya','Lidya İşlemleri · Yönetim','Mali yönetim',DA,'Mali düzeltme, manuel işlemler, siparişler ve VIP kayıtları.','Talebi veya kaydı seç → kanıt ve geçmişi incele.'),
 ('referrals','Referans Kod Oluştur','Mali yönetim',DA,'Kod oluşturma, kullanım/ödül geçmişi ve gerekçeli iptal masası.','Tür ve sınır → kod oluştur → gerçek kullanımları incele → gerekçeli iptal.'),
 ('security','Güvenlik Merkezi','Hesap güvenliği',DA,'Yalnız güvenlik sahibine açık mevcut korumalı güvenlik araçları.','Mevcut güvenlik merkezi doğrulaması ile devam et.'),
 ('lm-command','Güvenlik Merkezi','Olay operasyonu',ALL,'Açık dosyalar, atamalar, karar bekleyenler ve koruyucu tedbirler.','Önceliği gör → dosyayı aç → ilgili iş akışına geç.'),
 ('lm-cases','Olay Dosyaları','Olay operasyonu',ALL,'Dosya, özel kanıt, not, atama, gerekçeli karar ve olay geçmişi.','Dosya aç → delil topla → incele → bağımsız karar.'),
 ('lm-emergency','Acil Müdahale','Olay operasyonu',('UA','FA','DA'),'Açık dosyaya bağlı en fazla 60 dakika sohbet tedbiri.','Dosya ve hedef → gerekçe ve süre → tedbir → bağımsız geri alma.'),
 ('lm-finance','Lidya Denetimi','Mali yönetim',REVIEW,'Kanıtlı mali düzeltmenin bağımsız inceleme ve uygulama zinciri.','Talep sahibi → farklı inceleyen → farklı son onaycı.'),
 ('lm-fraud','Dolandırıcılık İnceleme','Denetim',DA,'Mali göstergeleri inceleme, açıklama ve olay dosyasına sevk.','Gösterge → gerçek işlem → inceleme sonucu veya dosya.'),
 ('lm-audit','Yönetici Denetimi','Denetim',DA,'Rol/aktör/tarih/işlem filtreleriyle kayıtlar ve CSV çıktısı.','Filtrele → detay → görüntülenen kayıtları dışa aktar.'),
]

def catalog(user,role):
    return [dict(key=k,title=t,section=s,description=d,flow=f) for k,t,s,rs,d,f in CATALOG if role in rs and (k!='security' or bool(settings.security_owner_public_id and user.public_id==settings.security_owner_public_id))]
def role_snapshot(row):
    return hashlib.sha256(json.dumps([row.role,row.granted_by,str(row.updated_at)] if row else None).encode()).hexdigest()
def role_view(row,user,db):
    requester=db.get(User,row.requester_id)
    reviewer=db.get(User,row.reviewer_id) if row.reviewer_id else None
    people={'requester_public_id':requester.public_id if requester else None,'requester_name':requester.nickname if requester else None,'reviewer_public_id':reviewer.public_id if reviewer else None,'reviewer_name':reviewer.nickname if reviewer else None}
    return people|{k:getattr(row,k) for k in ('id','requester_id','target_id','target_public_id','target_name','previous_role','requested_role','reason','status','reviewer_id','decision_note','created_at','decided_at')}|{'can_decide':row.status=='pending' and user.id not in {row.requester_id,row.target_id},'can_cancel':row.status=='pending' and user.id==row.requester_id}
class RoleProposal(TextModel):
    target_id:str=Field(min_length=1,max_length=64)
    role:str|None=Field(default=None,pattern='^(SA|UA|FA|DA)$')
    expected_snapshot:str=Field(pattern='^[a-f0-9]{64}$')
    confirm_public_id:str=Field(min_length=1,max_length=64)
    reason:str=Field(min_length=20,max_length=2000)
    request_key:str=Field(min_length=16,max_length=64,pattern='^[A-Za-z0-9_-]+$')
class RoleDecision(TextModel):
    action:str=Field(pattern='^(approve|reject|cancel)$')
    note:str=Field(min_length=20,max_length=2000)

def register_auth(current_user,ghost_transition=None,role_changed=None):
    @router.get('')
    def overview(response:Response,db:Session=Depends(get_db),user:User=Depends(current_user)):
        role=access(db,user,1);response.headers['Cache-Control']='no-store';now=datetime.now(timezone.utc)
        q=select(func.count()).select_from(ManagementCase).where(ManagementCase.status.notin_(['resolved','dismissed']))
        if role not in REVIEW:q=q.where(or_(ManagementCase.reporter_id==user.id,ManagementCase.assigned_id==user.id))
        cases=db.scalar(q);support=db.scalar(select(func.count(func.distinct(SupportTicket.id))).select_from(SupportTicket).outerjoin(SupportFlow).outerjoin(SupportAssignment).where(or_(and_(SupportAssignment.admin_id==user.id,SupportAssignment.decision=='accepted',SupportFlow.phase.in_(['awaiting_ready','active'])),and_(SupportFlow.offered_to==user.id,SupportFlow.phase=='pending',SupportFlow.offer_until>now))))
        counts={'tickets':support,'lm-cases':cases,'lm-command':cases}
        if role in REVIEW:
            counts['lm-finance']=db.scalar(select(func.count()).select_from(ManagementFinanceRequest).where(or_(and_(ManagementFinanceRequest.status=='pending_review',ManagementFinanceRequest.requester_id!=user.id,ManagementFinanceRequest.target_id!=user.id),and_(ManagementFinanceRequest.status=='reviewed',role=='DA',ManagementFinanceRequest.requester_id!=user.id,ManagementFinanceRequest.reviewer_id!=user.id,ManagementFinanceRequest.target_id!=user.id))))
        if role=='DA':counts['roles']=db.scalar(select(func.count()).select_from(ManagementRoleRequest).where(ManagementRoleRequest.status=='pending',ManagementRoleRequest.requester_id!=user.id,ManagementRoleRequest.target_id!=user.id))
        return {'role':role,'tools':catalog(user,role),'counts':counts,'generated_at':now.isoformat(),'source':'persisted_database'}

    @router.get('/users')
    def users(q:str=Query('',max_length=100),role:str|None=None,active:str=Query('all',pattern='^(all|active|inactive)$'),after:str|None=Query(None,max_length=64),limit:int=Query(20,ge=1,le=50),db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4);query=select(User,AdminRole).outerjoin(AdminRole,AdminRole.user_id==User.id)
        if q.strip():query=query.where(or_(User.public_id.startswith(q.strip(),autoescape=True),User.id==q.strip(),User.nickname.contains(q.strip(),autoescape=True)))
        if role:
            if role not in ALL+('USER','STAFF'):raise HTTPException(422,'Geçersiz rol')
            query=query.where(AdminRole.user_id.is_(None) if role=='USER' else AdminRole.user_id.is_not(None) if role=='STAFF' else AdminRole.role==role)
        if active!='all':query=query.where(User.is_active.is_(active=='active'))
        if after:query=query.where(User.id>after)
        rows=list(db.execute(query.order_by(User.id).limit(limit+1)))
        return {'items':[{'id':p.id,'public_id':p.public_id,'nickname':p.nickname,'role':r.role if r else None,'is_active':p.is_active,'created_at':p.created_at} for p,r in rows[:limit]],'next_after':rows[limit-1][0].id if len(rows)>limit else None}

    @router.get('/users/{user_id}')
    def profile(user_id:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4);person=db.get(User,user_id) or db.scalar(select(User).where(User.public_id==user_id))
        if not person:raise HTTPException(404,'Kullanıcı bulunamadı')
        row=db.get(AdminRole,person.id);now=datetime.now(timezone.utc)
        active=lambda model:select(func.count()).select_from(model).where(model.user_id==person.id,model.active.is_(True),or_(model.expires_at.is_(None),model.expires_at>now))
        result={'id':person.id,'public_id':person.public_id,'nickname':person.nickname,'role':row.role if row else None,'is_active':person.is_active,'created_at':person.created_at,'balance':str(person.lidya or 0),'role_snapshot':role_snapshot(row),'active_account_bans':db.scalar(active(UserBan)),'active_chat_bans':db.scalar(active(ChatBan)),'open_cases':db.scalar(select(func.count()).select_from(ManagementCase).where(ManagementCase.target_user_id==person.id,ManagementCase.status.notin_(['resolved','dismissed']))),'can_request_role':person.id!=user.id and person.is_active,'can_delete':person.id!=user.id and row is None}
        audit(db,user,'workspace_user_viewed',{'public_id':person.public_id},person.id);db.commit();return result

    @router.get('/role-requests')
    def requests(status:str=Query('pending',pattern='^(all|pending|executed|rejected|cancelled)$'),before:int|None=Query(None,ge=1),limit:int=Query(20,ge=1,le=50),db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4);q=select(ManagementRoleRequest)
        if status!='all':q=q.where(ManagementRoleRequest.status==status)
        if before:q=q.where(ManagementRoleRequest.id<before)
        rows=list(db.scalars(q.order_by(ManagementRoleRequest.id.desc()).limit(limit+1)))
        return {'items':[role_view(r,user,db) for r in rows[:limit]],'next_before':rows[limit-1].id if len(rows)>limit else None}

    @router.post('/role-requests',status_code=201)
    def propose(payload:RoleProposal,db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4)
        if 'role' not in payload.model_fields_set:raise HTTPException(422,'Yeni rolü veya yetki kaldırma seçimini açıkça belirtin')
        db.scalar(select(User.id).where(User.id==user.id).with_for_update())
        prior=db.scalar(select(ManagementRoleRequest).where(ManagementRoleRequest.request_key==payload.request_key))
        if prior:
            if (prior.requester_id,prior.target_id,prior.requested_role,prior.reason,prior.snapshot,prior.target_public_id)!=(user.id,payload.target_id,payload.role,payload.reason,payload.expected_snapshot,payload.confirm_public_id):raise HTTPException(409,'İstek anahtarı başka taleple kullanılmış')
            return role_view(prior,user,db)
        person=db.get(User,payload.target_id)
        if not person:raise HTTPException(404,'Kullanıcı bulunamadı')
        if person.id==user.id or not person.is_active:raise HTTPException(403,'Kendi hesabınızın veya pasif hesabın rolünü değiştiremezsiniz')
        if payload.confirm_public_id!=person.public_id:raise HTTPException(422,'Profil ID onayı eşleşmiyor')
        role=db.get(AdminRole,person.id)
        if role_snapshot(role)!=payload.expected_snapshot:raise HTTPException(409,'Mevcut rol değişti; hesabı yeniden sorgulayın')
        if payload.role==(role.role if role else None):raise HTTPException(409,'Yeni rol mevcut rolle aynı')
        row=ManagementRoleRequest(request_key=payload.request_key,requester_id=user.id,target_id=person.id,target_public_id=person.public_id,target_name=person.nickname,previous_role=role.role if role else None,requested_role=payload.role,snapshot=payload.expected_snapshot,reason=payload.reason)
        db.add(row)
        try:db.flush()
        except IntegrityError as error:
            db.rollback();raise HTTPException(409,'İstek anahtarı eşzamanlı başka bir taleple kullanılmış; kayıtları yenileyin') from error
        audit(db,user,'role_change_requested',{'request_id':row.id,'previous_role':row.previous_role,'requested_role':row.requested_role,'reason':row.reason},person.id)
        notify(db,db.scalars(select(AdminRole.user_id).where(AdminRole.role=='DA')).all(),'Yetki değişikliği incelemesi',f'Yetki talebi #{row.id} bağımsız karar bekliyor.',user.id);db.commit();return role_view(row,user,db)

    @router.post('/role-requests/{request_id}/decision')
    @database_task
    async def decide(request_id:int,payload:RoleDecision,db:Session=Depends(get_db),user:User=Depends(current_user)):
        access(db,user,4)
        # Serialize staff changes in stable order, and recheck authority after waiting.
        da_rows=list(db.scalars(select(AdminRole).join(User,User.id==AdminRole.user_id).where(AdminRole.role=='DA',User.is_active.is_(True)).order_by(AdminRole.user_id).with_for_update(of=AdminRole).execution_options(populate_existing=True)))
        if user.id not in {r.user_id for r in da_rows}:raise HTTPException(403,'Güncel yönetim yetkisi gerekli')
        row=db.scalar(select(ManagementRoleRequest).where(ManagementRoleRequest.id==request_id).with_for_update().execution_options(populate_existing=True))
        if not row:raise HTTPException(404,'Yetki talebi bulunamadı')
        if payload.action=='cancel':
            if row.requester_id!=user.id:raise HTTPException(403,'Yalnız talep sahibi geri çekebilir')
        elif user.id in {row.requester_id,row.target_id}:raise HTTPException(403,'Bağımsız ikinci yönetici kararı gerekli')
        final={'approve':'executed','reject':'rejected','cancel':'cancelled'}[payload.action]
        if row.status==final:return role_view(row,user,db)
        if row.status!='pending':raise HTTPException(409,'Talep daha önce sonuçlandırıldı')
        if payload.action=='approve':
            requester=db.get(User,row.requester_id);requester_role=db.get(AdminRole,row.requester_id)
            if not requester or not requester.is_active or not requester_role or requester_role.role!='DA':raise HTTPException(409,'Talep sahibinin yetkisi değişti')
            target=db.scalar(select(User).where(User.id==row.target_id).with_for_update().execution_options(populate_existing=True))
            if not target or not target.is_active:raise HTTPException(409,'Hedef hesap aktif değil')
            role=db.scalar(select(AdminRole).where(AdminRole.user_id==row.target_id).with_for_update().execution_options(populate_existing=True))
            if role_snapshot(role)!=row.snapshot:raise HTTPException(409,'Hedefin rolü değişti; yeni talep oluşturun')
            if role and role.role=='DA' and row.requested_role!='DA' and len(da_rows)<=1:raise HTTPException(409,'Son aktif sistem yöneticisi kaldırılamaz')
            from .admin_routes import update_room_ghost
            if row.requested_role:
                if not role:role=AdminRole(user_id=target.id,role=row.requested_role,granted_by=row.requester_id);db.add(role)
                else:role.role=row.requested_role;role.granted_by=row.requester_id
                if row.requested_role!='DA':role.ghost_mode=False;update_room_ghost(db,target.id,False)
            elif role:update_room_ghost(db,target.id,False);db.delete(role)
        row.status=final;row.reviewer_id=user.id;row.decision_note=payload.note;row.decided_at=datetime.now(timezone.utc)
        audit(db,user,'role_change_'+final,{'request_id':row.id,'previous_role':row.previous_role,'requested_role':row.requested_role,'reason':row.reason,'decision_note':payload.note},row.target_id)
        notify(db,[row.requester_id,row.target_id],'Yetki talebi sonuçlandı',f'Yetki talebi #{row.id}: {final}.',user.id);db.commit()
        sync_pending=False
        if final=='executed':
            try:
                if row.requested_role!='DA' and ghost_transition:await ghost_transition(row.target_id,False)
                if role_changed:await role_changed(row.target_id,row.requested_role)
            except Exception:
                logging.getLogger(__name__).exception('Committed role request %s realtime refresh failed',row.id);sync_pending=True
        return role_view(row,user,db)|{'realtime_refresh_pending':sync_pending}
    return router
