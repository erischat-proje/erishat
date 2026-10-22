"""Limited-time, case-backed protective chat restriction and oversight summary."""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .admin_models import AdminRole, ChatBan, AdminAuditLog
from .case_models import ManagementCase, ManagementCaseEvent
from .emergency_models import EmergencyChatAction
from .case_routes import access, allowed, add_event, scoped, CaseNote
from .management_events import notify, reviewers

router = APIRouter(prefix='/v1/admin/operations', tags=['management-operations'])

class EmergencyRequest(BaseModel):
    case_id: int = Field(ge=1)
    target_public_id: str = Field(min_length=5, max_length=64)
    reason: str = Field(min_length=20, max_length=1000)
    minutes: int = Field(default=60, ge=1, le=60)

def current_time():
    return datetime.now(timezone.utc)

def as_utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

def register_auth(current_user):
    @router.post('/emergency-chat', status_code=201)
    def emergency_chat(payload: EmergencyRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
        rank=access(db,user,2)
        if rank not in {'UA','FA','DA'}:raise HTTPException(403,'Guvenlik yetkisi gerekli')
        # Lock target row so concurrent emergency requests cannot bypass the cooldown.
        target=db.scalar(select(User).where(User.public_id==payload.target_public_id).with_for_update())
        if not target:raise HTTPException(404,'Kullanici bulunamadi')
        if target.id==user.id or db.get(AdminRole,target.id):
            raise HTTPException(403,'Bu islem kendinize veya bir personele uygulanamaz')
        case=db.scalar(select(ManagementCase).where(ManagementCase.id==payload.case_id).with_for_update())
        if not case or not allowed(rank,user,case):raise HTTPException(403,'Olay dosyasina erisim yok')
        if case.target_user_id!=target.id:raise HTTPException(409,'Olay dosyasi ile hedef kullanici eslesmiyor')
        if case.status in {'dismissed','resolved'}:raise HTTPException(409,'Kapali dosyada acil tedbir uygulanamaz')
        now=current_time()
        # One protective intervention per target over rolling 24h, regardless of acting admin.
        last=db.scalar(select(EmergencyChatAction).where(EmergencyChatAction.target_id==target.id)
                       .order_by(EmergencyChatAction.id.desc()).limit(1))
        if last and as_utc(last.created_at) > now-timedelta(hours=24):
            raise HTTPException(409,'Bu hesap icin son 24 saatte acil tedbir uygulanmis; FA incelemesi gerekli')
        active=db.scalar(select(ChatBan).where(ChatBan.user_id==target.id,ChatBan.active.is_(True)))
        if active and (active.expires_at is None or as_utc(active.expires_at)>now):
            raise HTTPException(409,'Mevcut sohbet yasagi var; acil tedbir ust uste uygulanamaz')
        until=now+timedelta(minutes=payload.minutes)
        restriction=ChatBan(user_id=target.id,banned_by=user.id,reason='ACIL-OLAY-'+str(case.id)+': '+payload.reason.strip(),expires_at=until,active=True)
        db.add(restriction);db.flush()
        action=EmergencyChatAction(actor_id=user.id,target_id=target.id,case_id=case.id,chat_ban_id=restriction.id,
                                    reason=payload.reason.strip(),expires_at=until)
        db.add(action)
        add_event(db,case,user,'emergency_chat',{'duration_minutes':payload.minutes,'target_user_id':target.id,'ban_id':restriction.id})
        db.add(AdminAuditLog(admin_id=user.id,action='emergency_chat',target_user_id=target.id,
                             details='{"case_id":'+str(case.id)+',"duration_minutes":'+str(payload.minutes)+'}'))
        notify(db,reviewers(db),'Acil koruyucu tedbir',f'Olay #{case.id} için {payload.minutes} dakikalık CHAT kısıtlaması uygulandı.',user.id)
        notify(db,[target.id],'Sohbet erişimi geçici olarak kısıtlandı',f'Koruyucu inceleme nedeniyle CHAT erişiminiz {payload.minutes} dakika kısıtlandı. Destek bölümünden başvurabilirsiniz.')
        db.commit()
        return {'action_id':action.id,'case_id':case.id,'expires_at':until.isoformat(),'duration_minutes':payload.minutes,'scope':'chat'}

    def view_action(db,row):
        target=db.get(User,row.target_id);actor=db.get(User,row.actor_id);ban=db.get(ChatBan,row.chat_ban_id)
        at=current_time();active=bool(ban and ban.active and as_utc(row.expires_at)>at)
        return {'id':row.id,'case_id':row.case_id,'actor_id':row.actor_id,'actor_name':actor.nickname if actor else None,
          'target_public_id':target.public_id if target else None,'target_name':target.nickname if target else None,
          'reason':row.reason,'expires_at':row.expires_at.isoformat(),'created_at':row.created_at.isoformat(),
          'active':active,'state':'active' if active else 'revoked' if ban and not ban.active else 'expired',
          'remaining_seconds':max(0,int((as_utc(row.expires_at)-at).total_seconds())) if active else 0}

    @router.get('/emergency-chat')
    def emergency_history(limit:int=Query(30,ge=1,le=100),before:int|None=Query(None,ge=1),active_only:bool=False,db:Session=Depends(get_db),user:User=Depends(current_user)):
        cases,_=scoped(db,user,2)
        query=select(EmergencyChatAction).where(EmergencyChatAction.case_id.in_(cases.with_only_columns(ManagementCase.id)))
        if before:query=query.where(EmergencyChatAction.id<before)
        if active_only:query=query.join(ChatBan,ChatBan.id==EmergencyChatAction.chat_ban_id).where(ChatBan.active.is_(True),EmergencyChatAction.expires_at>current_time())
        rows=list(db.scalars(query.order_by(EmergencyChatAction.id.desc()).limit(limit+1)))
        return {'items':[view_action(db,r) for r in rows[:limit]],'next_before':rows[limit-1].id if len(rows)>limit else None}

    @router.post('/emergency-chat/{action_id}/revoke')
    def revoke(action_id:int,payload:CaseNote,db:Session=Depends(get_db),user:User=Depends(current_user)):
        rank=access(db,user,3)
        row=db.get(EmergencyChatAction,action_id)
        if not row:raise HTTPException(404,'Tedbir bulunamadı')
        if row.actor_id==user.id:raise HTTPException(403,'Geri alma bağımsız bir karar yetkilisi gerektirir')
        creator=db.get(AdminRole,row.actor_id)
        if rank=='FA' and creator and creator.role=='DA':raise HTTPException(403,'Bu tedbiri üst yönetim incelemelidir')
        db.scalar(select(User.id).where(User.id==row.target_id).with_for_update())
        row=db.scalar(select(EmergencyChatAction).where(EmergencyChatAction.id==action_id).with_for_update().execution_options(populate_existing=True))
        ban=db.scalar(select(ChatBan).where(ChatBan.id==row.chat_ban_id).with_for_update().execution_options(populate_existing=True))
        if not ban or not ban.active or as_utc(row.expires_at)<=current_time():return view_action(db,row)
        # Only this exact intervention is reversed; another restriction is never removed.
        ban.active=False
        case=db.get(ManagementCase,row.case_id)
        add_event(db,case,user,'emergency_revoked',{'action_id':row.id,'note':payload.note})
        notify(db,[row.actor_id,row.target_id],'Acil tedbir geri alındı',f'Olay #{row.case_id} için geçici CHAT tedbiri inceleme sonrası kaldırıldı.',user.id)
        db.commit();return view_action(db,row)

    @router.get('/overview')
    def overview(db:Session=Depends(get_db),user:User=Depends(current_user)):
        query,rank=scoped(db,user)
        counts=dict(db.execute(query.with_only_columns(ManagementCase.status,func.count()).group_by(ManagementCase.status)).all())
        recent=list(db.scalars(query.order_by(ManagementCase.id.desc()).limit(10)))
        assigned=db.scalar(query.with_only_columns(func.count()).where(ManagementCase.assigned_id==user.id,ManagementCase.status.notin_(['resolved','dismissed']))) or 0
        active=db.scalar(select(func.count()).select_from(EmergencyChatAction).join(ChatBan,ChatBan.id==EmergencyChatAction.chat_ban_id).where(EmergencyChatAction.case_id.in_(query.with_only_columns(ManagementCase.id)),ChatBan.active.is_(True),EmergencyChatAction.expires_at>current_time())) or 0
        return {'role':rank,'open_cases':sum(v for k,v in counts.items() if k not in {'resolved','dismissed'}),
          'counts':counts,'assigned_to_me':assigned,'active_emergency':active,
          'recent_cases':[{'id':c.id,'category':c.category,'status':c.status,'summary':c.summary,'assigned_id':c.assigned_id} for c in recent]}
    return router
