"""Atomic wallet settlement and resumable bonus state for both original games."""
import json
from datetime import datetime, timezone
from uuid import UUID, uuid5, NAMESPACE_URL
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StrictInt
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .platform_models import GameRound, GameBet, GamePlay
from .moderation import require_feature
from .aztek_ares_engine import spin, rules as game_rules, CAP, VERSION, SUPPORTED_VERSIONS
from .kure_routes import fraction, wallet_id

class SpinRequest(BaseModel):
    request_id: str = Field(min_length=36, max_length=36)
    round_id: str | None = Field(default=None, max_length=64)
    sequence: StrictInt = Field(default=0, ge=0)
    stake: StrictInt = Field(default=50, ge=1)
    action: str = Field(default='spin', pattern='^(spin|buy)$')
    class Config: extra='forbid'

def public(row,s):
    return dict(round_id=row.id,sequence=s['sequence'],remaining=s['remaining'],stake=s['stake'],total_payout=s['total_cents']/100,finished=row.status=='finished',version=s['version'])

def register_auth(current_user):
    root=APIRouter()
    for kind in ('aztek','ares'):
        root.include_router(build_router(kind,current_user))
    return root

def build_router(kind,current_user):
    router=APIRouter(prefix='/v1/games/'+kind,tags=[kind])
    @router.get('/rules')
    def rules():return game_rules(kind)

    @router.get('/active')
    def active(db:Session=Depends(get_db),user:User=Depends(current_user)):
        # Read bonus state and fractional balance under the wallet row lock.
        locked=db.scalar(select(User).where(User.id==user.id).with_for_update().execution_options(populate_existing=True))
        row=db.scalar(select(GameRound).where(GameRound.user_id==user.id,GameRound.game_type==kind,GameRound.status=='open').order_by(GameRound.started_at.desc()).limit(1))
        balance=locked.lidya+fraction(db,user.id)/100
        state=json.loads(row.state_data) if row else None
        return dict(state=public(row,state) if row else None,balance=balance,last=state.get('last') if state else None,
                    rules=game_rules(kind,version=state['version'] if state else VERSION))

    @router.post('/spin')
    def play(payload:SpinRequest,db:Session=Depends(get_db),user:User=Depends(current_user)):
        try: UUID(payload.request_id)
        except ValueError:raise HTTPException(422,'Geçersiz istek kimliği')
        locked=db.scalar(select(User).where(User.id==user.id).with_for_update().execution_options(populate_existing=True))
        if not locked:raise HTTPException(401,'Oturum bulunamadı')
        require_feature(db,user.id)
        carry=fraction(db,user.id)
        receipt_id=str(uuid5(NAMESPACE_URL,f'eris:{kind}:receipt:{user.id}:{payload.request_id}'))
        saved=db.get(GameRound,receipt_id)
        if saved:
            receipt=json.loads(saved.state_data);receipt['balance']=locked.lidya+carry/100;receipt['replayed']=True
            return receipt
        rid=payload.round_id or str(uuid5(NAMESPACE_URL,f'eris:{kind}:{user.id}:{payload.request_id}'))
        row=db.get(GameRound,rid)
        if row and (row.user_id!=user.id or row.game_type!=kind):raise HTTPException(404,'Tur bulunamadı')
        now=datetime.now(timezone.utc)
        if payload.round_id:
            if not row:raise HTTPException(404,'Tur bulunamadı')
            s=json.loads(row.state_data)
            if row.status!='open' or s['remaining']<=0:raise HTTPException(409,'Tur tamamlandı')
            if payload.sequence!=s['sequence'] or payload.stake!=s['stake'] or payload.action!='spin':raise HTTPException(409,'Bonus güncellendi; kaldığın yerden devam et')
            if s['version'] not in SUPPORTED_VERSIONS:raise HTTPException(409,'Bu bonus için uyumlu oyun sürümü gerekiyor')
            s['remaining']-=1;charge_cents=0;charged_whole=0
            result=spin(kind,bonus=True,remaining_cap=CAP-s['total_hundredths'],version=s['version'])
        else:
            if payload.sequence!=0:raise HTTPException(409,'Başlangıç sırası geçersiz')
            existing=db.scalar(select(GameRound.id).where(GameRound.user_id==user.id,GameRound.game_type==kind,GameRound.status=='open').limit(1))
            if existing:raise HTTPException(409,'Önce açık bonusunu tamamla')
            charge_cents=payload.stake*(10000 if payload.action=='buy' else 100)
            available=locked.lidya*100+carry
            if available<charge_cents:raise HTTPException(400,'Yeterli Lidya yok')
            before=locked.lidya;locked.lidya,carry=divmod(available-charge_cents,100);charged_whole=before-locked.lidya
            s=dict(sequence=0,remaining=0,stake=payload.stake,total_cents=0,total_hundredths=0,credited_whole=0,version=VERSION)
            row=GameRound(id=rid,user_id=user.id,game_type=kind,status='open',started_at=now,ends_at=now,state_data='{}');db.add(row);db.flush()
            db.add(GameBet(round_id=rid,user_id=user.id,choice=payload.action,amount=charged_whole,payout=0));db.flush()
            result=spin(kind,purchase=payload.action=='buy')
        s['remaining']+=result['awarded']
        payout_cents=result['payoutHundredths']*s['stake']
        before=locked.lidya;locked.lidya,carry=divmod(locked.lidya*100+carry+payout_cents,100)
        s['credited_whole']+=locked.lidya-before
        s['total_cents']+=payout_cents;s['total_hundredths']+=result['payoutHundredths'];s['sequence']+=1
        if s['total_hundredths']>=CAP:s['remaining']=0
        row.status='open' if s['remaining'] else 'finished';row.result_key='bonus' if s['remaining'] else 'win' if s['total_cents'] else 'lose'
        bet=db.scalar(select(GameBet).where(GameBet.round_id==rid,GameBet.user_id==user.id));bet.payout=s['credited_whole']
        wallet=db.get(GameRound,wallet_id(user.id))
        if not wallet:
            wallet=GameRound(id=wallet_id(user.id),user_id=user.id,game_type='dede_wallet',status='ledger',started_at=now,ends_at=now,result_key='fraction',state_data='{}');db.add(wallet)
        wallet.state_data=json.dumps({'remainder':carry},separators=(',',':'))
        receipt=dict(state=public(row,s),result=result,payout=payout_cents/100,charge=charge_cents/100,balance=locked.lidya+carry/100,request_id=payload.request_id,
                     next_rules=game_rules(kind,version=s['version'] if s['remaining'] else VERSION))
        s['last']=receipt;row.state_data=json.dumps(s,separators=(',',':'),ensure_ascii=False)
        serialized=json.dumps(receipt,separators=(',',':'),ensure_ascii=False)
        db.add(GamePlay(user_id=user.id,game_type=kind,choice=payload.action,result_key=row.result_key,result_data=serialized))
        db.add(GameRound(id=receipt_id,user_id=user.id,game_type=kind+'_receipt',status='receipt',started_at=now,ends_at=now,result_key='receipt',state_data=serialized))
        if row.status=='finished':row.ends_at=datetime.now(timezone.utc)
        db.commit()
        return receipt
    return router

