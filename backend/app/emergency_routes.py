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
from .case_routes import access, allowed, add_event

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
        db.commit()
        return {'action_id':action.id,'case_id':case.id,'expires_at':until.isoformat(),'duration_minutes':payload.minutes,'scope':'chat'}

    @router.get('/overview')
    def overview(db: Session = Depends(get_db), user: User = Depends(current_user)):
        rank=access(db,user,1)
        q=select(ManagementCase)
        if rank not in {'FA','DA'}:
            from sqlalchemy import or_
            q=q.where(or_(ManagementCase.reporter_id==user.id,ManagementCase.assigned_id==user.id))
        cases=list(db.scalars(q.order_by(ManagementCase.id.desc()).limit(100)))
        return {'role':rank,'open_cases':sum(c.status not in {'resolved','dismissed'} for c in cases),
                'recent_cases':[{'id':c.id,'category':c.category,'status':c.status} for c in cases[:15]],
                'note':'Bu sayilar gorunur son 100 dosyaya aittir; tum platform istatistigi degildir.'}
    return router
