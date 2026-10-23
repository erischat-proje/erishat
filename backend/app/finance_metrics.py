"""DA-only read projections from persisted operational data, never sample totals."""
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select,func,case,and_,or_
from .models import User
from .purchase_models import LidyaOperation,LidyaOrder
from .platform_models import VipStatus
from .system_data import LidyaLedger
from .management_workflow_models import ManagementFinanceRequest
from .payment_assistance_models import PaymentRequest
from .vip_membership_models import VipMembership,VipPurchaseReceipt

VERSION='management-mobile-live-v8-20261023'
IST=ZoneInfo('Europe/Istanbul')
def snapshot(db,days=7,target=''):
    started=datetime.now(timezone.utc)
    since=(started.astimezone(IST).replace(hour=0,minute=0,second=0,microsecond=0)-timedelta(days=days-1)).astimezone(timezone.utc)
    people=select(User.id)
    if target:people=people.where(User.public_id==target)
    scope=lambda col:col.in_(people)
    manual=and_(scope(LidyaOperation.user_id),LidyaOperation.created_at>=since,LidyaOperation.created_at<=started)
    added,removed,opcount,invalid=db.execute(select(
        func.coalesce(func.sum(case((LidyaOperation.operation=='EKLEME',LidyaOperation.amount),else_=0)),0),
        func.coalesce(func.sum(case((LidyaOperation.operation=='ÇIKARMA',LidyaOperation.amount),else_=0)),0),func.count(),
        func.coalesce(func.sum(case((or_(LidyaOperation.operation.notin_(['EKLEME','ÇIKARMA']),LidyaOperation.amount<=0,LidyaOperation.after-LidyaOperation.before!=case((LidyaOperation.operation=='EKLEME',LidyaOperation.amount),else_=-LidyaOperation.amount)),1),else_=0)),0)
    ).where(manual)).one()
    wallets=db.execute(select(func.count(),func.coalesce(func.sum(User.lidya),0),func.coalesce(func.sum(case((User.is_active.is_(True),User.lidya),else_=0)),0)).where(User.id.in_(people))).one()
    ledger_filter=and_(scope(LidyaLedger.user_id),LidyaLedger.created_at>=since,LidyaLedger.created_at<=started)
    credit,debit,net,entries=db.execute(select(func.coalesce(func.sum(case((LidyaLedger.delta>0,LidyaLedger.delta),else_=0)),0),func.coalesce(func.sum(case((LidyaLedger.delta<0,-LidyaLedger.delta),else_=0)),0),func.coalesce(func.sum(LidyaLedger.delta),0),func.count()).where(ledger_filter)).one()
    first,last=db.execute(select(func.min(LidyaLedger.created_at),func.max(LidyaLedger.created_at)).where(scope(LidyaLedger.user_id))).one()
    latest=select(LidyaLedger.user_id,func.max(LidyaLedger.id).label('last_id')).where(scope(LidyaLedger.user_id)).group_by(LidyaLedger.user_id).subquery()
    check=select(User.id,User.public_id,User.lidya,LidyaLedger.balance_after,LidyaLedger.id.label('ledger_id')).outerjoin(latest,latest.c.user_id==User.id).outerjoin(LidyaLedger,LidyaLedger.id==latest.c.last_id).where(User.id.in_(people)).subquery()
    mismatch=and_(check.c.ledger_id.is_not(None),check.c.lidya!=check.c.balance_after)
    missing=check.c.ledger_id.is_(None)
    mismatched=db.scalar(select(func.count()).select_from(check).where(mismatch)) or 0
    untracked=db.scalar(select(func.count()).select_from(check).where(missing)) or 0
    exceptions=list(db.execute(select(check).where(or_(mismatch,missing)).order_by(check.c.public_id).limit(20)))
    decided=func.coalesce(LidyaOrder.decided_at,LidyaOrder.created_at)
    orders=list(db.execute(select(LidyaOrder.status,func.count(),func.coalesce(func.sum(LidyaOrder.total),0),func.coalesce(func.sum(LidyaOrder.price_try),0)).where(scope(LidyaOrder.user_id),decided>=since,decided<=started).group_by(LidyaOrder.status)))
    vip=db.scalar(select(func.count()).select_from(VipStatus).where(scope(VipStatus.user_id),VipStatus.level>0)) or 0
    vip_active=db.scalar(select(func.count()).select_from(VipMembership).join(VipStatus,VipStatus.user_id==VipMembership.user_id).where(scope(VipMembership.user_id),VipStatus.level>0,VipMembership.cycle_ends_at>started)) or 0
    vip_due=db.scalar(select(func.count()).select_from(VipMembership).join(VipStatus,VipStatus.user_id==VipMembership.user_id).where(scope(VipMembership.user_id),VipStatus.level>0,VipMembership.cycle_ends_at<=started)) or 0
    receipt_count,receipt_amount=db.execute(select(func.count(),func.coalesce(func.sum(VipPurchaseReceipt.amount),0)).where(scope(VipPurchaseReceipt.user_id),VipPurchaseReceipt.purchased_at>=since,VipPurchaseReceipt.purchased_at<=started)).one()
    assisted_count,assisted_lidya,assisted_try=db.execute(select(func.count(),func.coalesce(func.sum(PaymentRequest.total),0),func.coalesce(func.sum(PaymentRequest.price_try),0)).select_from(PaymentRequest).join(LidyaOperation,LidyaOperation.id==PaymentRequest.credit_operation_id).where(scope(PaymentRequest.user_id),PaymentRequest.transaction_reference.is_not(None),LidyaOperation.created_at>=since,LidyaOperation.created_at<=started)).one()
    requests=dict(db.execute(select(ManagementFinanceRequest.status,func.count()).where(scope(ManagementFinanceRequest.target_id)).group_by(ManagementFinanceRequest.status)).all())
    recent=list(db.execute(select(LidyaLedger.id,LidyaLedger.delta,LidyaLedger.balance_after,LidyaLedger.operation,LidyaLedger.reference_id,LidyaLedger.created_at,User.public_id,User.nickname).join(User,User.id==LidyaLedger.user_id).where(ledger_filter).order_by(LidyaLedger.id.desc()).limit(30)))
    return {'version':VERSION,'generated_at':datetime.now(timezone.utc).isoformat(),'query_started_at':started.isoformat(),
        'period_days':days,'period_start':since.isoformat(),'period_end':started.isoformat(),'timezone':'Europe/Istanbul','target_public_id':target or None,
        'source':'persisted_database','sampled':False,'scope':'surviving_accounts',
        'wallets':{'accounts':wallets[0],'total_lidya':str(wallets[1]),'active_account_lidya':str(wallets[2])},
        'manual':{'count':opcount,'added':str(added),'removed':str(removed),'invalid_count':invalid},
        'ledger':{'entry_count':entries,'credits':str(credit),'debits':str(debit),'net':str(net),'first_recorded_at':first.isoformat() if first else None,'last_recorded_at':last.isoformat() if last else None},
        'coverage':{'accounts_checked':wallets[0],'latest_balance_mismatch':mismatched,'accounts_without_ledger':untracked,
            'exceptions':[{'public_id':r.public_id,'current_balance':str(r.lidya),'last_recorded_balance':str(r.balance_after) if r.balance_after is not None else None,'kind':'missing_ledger' if r.ledger_id is None else 'balance_mismatch'} for r in exceptions],'exceptions_truncated':mismatched+untracked>20},
        'orders':[{'status':s,'count':n,'lidya':str(l),'recorded_try':str(t)} for s,n,l,t in orders],
        'vip_accounts':vip,'vip_active_cycles':vip_active,'vip_cycles_due':vip_due,'vip_purchase_receipts':{'count':receipt_count,'lidya':str(receipt_amount)},'assisted_credited':{'count':assisted_count,'lidya':str(assisted_lidya),'recorded_try':str(assisted_try)},'finance_requests':requests,
        'recent_ledger':[{'id':str(r.id),'public_id':r.public_id,'nickname':r.nickname,'delta':str(r.delta),'balance_after':str(r.balance_after),'operation':r.operation,'reference_id':r.reference_id,'created_at':r.created_at.isoformat()} for r in recent],
        'recent_ledger_limit':30,
        'note':'Gerçek kayıt toplamlarıdır. Sipariş tutarı banka tahsilat mutabakatı değildir. Manuel işlemler destekli yüklemelerle örtüşebilir; bu kutular birbirine eklenmez. Ledger ilk bakiye kayıtları dahil yalnız kaydedilmiş hareketleri kapsar; silinen hesap geçmişi kapsam dışıdır. Alanlar aynı istek içindeki sorgu zaman aralığında okunur.'}
