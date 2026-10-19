"""Atomic, resumable Şeker Sarayı rounds using existing wallet/game tables."""
import json
from datetime import datetime,timezone
from uuid import UUID,uuid5,NAMESPACE_URL
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,StrictBool,StrictInt,Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .platform_models import GameRound,GameBet,GamePlay
from .moderation import require_feature
from .seker_engine import spin,CONFIG,KEYS,PAY,CAP,SUPPORTED_VERSIONS

from .natural_bonus import start as natural_start, entry_config, bonus_config, bonus_floor, public as natural_public, rules as natural_rules

router=APIRouter(prefix='/v1/games/seker',tags=['seker'])
class SpinRequest(BaseModel):
    request_id:str=Field(min_length=36,max_length=36)
    round_id:str|None=Field(default=None,max_length=64)
    sequence:StrictInt=Field(default=0,ge=0)
    stake:StrictInt=Field(default=50,ge=1)
    ante:StrictBool=False
    action:str=Field(default='spin',pattern='^(spin|buy)$')
    class Config:extra='forbid'

def wallet_id(uid):return str(uuid5(NAMESPACE_URL,'eris:dede:fraction:'+str(uid)))
def fraction(db,uid):
    row=db.get(GameRound,wallet_id(uid))
    return int(json.loads(row.state_data).get('remainder',0)) if row else 0

def unpack(row):return json.loads(row.state_data)
def public_state(row,state,balance):
    return {**natural_public(state),'round_id':row.id,'sequence':state['sequence'],'remaining':state['remaining'],'pool':state['pool'],'stake':state['stake'],'ante':state['ante'],'total_payout':state['total_payout'],'finished':row.status=='finished','balance':balance,'version':state['version']}

def register_auth(current_user):
    @router.get('/rules')
    def rules():
        return {'natural_bonus':natural_rules('seker'),'name':'Şeker Sarayı','version':CONFIG['version'],'symbols':KEYS,'paytable':[[v/100 for v in r] for r in PAY],'max_win':21100,'bonus_spins':10,'retrigger_spins':5,'bonus_cost':100,'ante_cost':1.25,'target_rtp':CONFIG['targetRtp'],'rtp_status':CONFIG['rtpStatus'],'pool_rule':'Çarpanlar sadece bu ücretsiz dönüşün sonunda toplanır; sonraki dönüşe taşınmaz.'}

    @router.get('/active')
    def active(db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=db.scalar(select(GameRound).where(GameRound.user_id==user.id,GameRound.game_type=='seker',GameRound.status=='open').order_by(GameRound.started_at.desc()).limit(1))
        balance=db.scalar(select(User.lidya).where(User.id==user.id))+fraction(db,user.id)/100
        return {'state':public_state(row,unpack(row),balance) if row else None,'balance':balance,'last':unpack(row).get('last') if row else None}

    @router.post('/spin')
    def play(payload:SpinRequest,db:Session=Depends(get_db),user:User=Depends(current_user)):
        try:UUID(payload.request_id)
        except ValueError:raise HTTPException(422,'Geçersiz istek kimliği')
        locked=db.scalar(select(User).where(User.id==user.id).with_for_update().execution_options(populate_existing=True))
        if not locked:raise HTTPException(401,'Oturum bulunamadı')
        require_feature(db,user.id)
        rid=payload.round_id or str(uuid5(NAMESPACE_URL,'eris:seker:'+str(user.id)+':'+payload.request_id))
        row=db.get(GameRound,rid)
        if row and (row.user_id!=user.id or row.game_type!='seker'):raise HTTPException(404,'Tur bulunamadı')
        receipt_id=str(uuid5(NAMESPACE_URL,'eris:seker:receipt:'+str(user.id)+':'+payload.request_id))
        saved=db.get(GameRound,receipt_id)
        if saved:
            receipt=json.loads(saved.state_data)
            receipt['balance']=locked.lidya+fraction(db,user.id)/100
            receipt['replayed']=True
            return receipt
        if row:
            state=unpack(row)
            if state.get('last_request')==payload.request_id:
                receipt=dict(state['last']);receipt['balance']=locked.lidya+fraction(db,user.id)/100;receipt['replayed']=True;return receipt
            if not payload.round_id or row.status!='open':raise HTTPException(409,'Tur tamamlandı')
            if payload.sequence!=state['sequence']:raise HTTPException(409,'Tur güncellendi; kaldığın yerden devam et')
            if payload.action!='spin' or payload.stake!=state['stake'] or payload.ante!=state['ante']:raise HTTPException(409,'Bonus sırasında bahis değiştirilemez')
            if state.get('version') not in SUPPORTED_VERSIONS:raise HTTPException(409,'Desteklenmeyen oyun sürümü')
            if state['remaining']<=0:raise HTTPException(409,'Ücretsiz dönüş kalmadı')
            stake=state['stake'];state['remaining']-=1;charge=0;charge_cents=0;carry=fraction(db,user.id)
            result=spin(config=bonus_config('seker',state),bonus=True,remaining_cap=CAP-state['total_hundredths'],model_version=state['version'],purchased=state.get('entry')=='buy')
            state['pool']=result['pool'];state['remaining']+=result['extraSpins']
        else:
            if payload.round_id:raise HTTPException(404,'Tur bulunamadı')
            if payload.sequence!=0:raise HTTPException(409,'Başlangıç sırası geçersiz')
            existing=db.scalar(select(GameRound.id).where(GameRound.user_id==user.id,GameRound.game_type=='seker',GameRound.status=='open').limit(1))
            if existing:raise HTTPException(409,'Önce açık Şeker Sarayı bonusunu tamamla')
            if payload.action=='buy' and payload.ante:raise HTTPException(422,'Bonus alırken şans artırmayı kapat')
            stake=payload.stake;charge_cents=stake*10000 if payload.action=='buy' else stake*125 if payload.ante else stake*100
            charge=charge_cents/100;carry=fraction(db,user.id);available=locked.lidya*100+carry
            if available<charge_cents:raise HTTPException(400,'Yeterli Lidya yok')
            previous_lidya=locked.lidya;locked.lidya,carry=divmod(available-charge_cents,100);charged_whole=previous_lidya-locked.lidya;now=datetime.now(timezone.utc)
            state={'version':CONFIG['version'],'entry':payload.action,'sequence':0,'remaining':10 if payload.action=='buy' else 0,'pool':0,'stake':stake,'ante':payload.ante,'total_payout':0,'total_hundredths':0}
            natural_start(state,'seker',payload.action)
            row=GameRound(id=rid,user_id=user.id,game_type='seker',status='open',started_at=now,ends_at=now,state_data='{}');db.add(row);db.flush()
            db.add(GameBet(round_id=rid,user_id=user.id,choice='buy' if payload.action=='buy' else 'ante' if payload.ante else 'spin',amount=charged_whole,payout=0))
            result=None if payload.action=='buy' else spin(ante=payload.ante,config=entry_config('seker'))
            if result and result['bonusTriggered']:state['remaining']=10
        payout_cents=0 if result is None else result['payoutHundredths']*stake
        payout=payout_cents/100;previous_lidya=locked.lidya
        locked.lidya,carry=divmod(locked.lidya*100+carry+payout_cents,100)
        credited_whole=locked.lidya-previous_lidya
        state['total_payout_cents']=state.get('total_payout_cents',round(state['total_payout']*100))+payout_cents
        state['total_payout']=state['total_payout_cents']/100
        state['credited_payout']=state.get('credited_payout',round(state['total_payout']-payout))+credited_whole
        wallet=db.get(GameRound,wallet_id(user.id))
        if not wallet:
            now=datetime.now(timezone.utc)
            wallet=GameRound(id=wallet_id(user.id),user_id=user.id,game_type='dede_wallet',status='ledger',started_at=now,ends_at=now,result_key='fraction',state_data='{}');db.add(wallet)
        wallet.state_data=json.dumps({'remainder':carry},separators=(',',':'))
        balance=locked.lidya+carry/100
        if result:state['total_hundredths']+=result['payoutHundredths']
        if state['total_hundredths']>=CAP:state['remaining']=0
        state['sequence']+=1;row.status='open' if state['remaining'] else 'finished';row.result_key='bonus' if state['remaining'] else 'win' if state['total_payout'] else 'lose'
        db.flush()
        bet=db.scalar(select(GameBet).where(GameBet.round_id==rid,GameBet.user_id==user.id));bet.payout=state['credited_payout']
        receipt={'state':public_state(row,state,balance),'result':result,'payout':payout,'charge':charge,'balance':balance,'request_id':payload.request_id}
        state['last_request']=payload.request_id;state['last']=receipt;row.state_data=json.dumps(state,separators=(',',':'),ensure_ascii=False)
        db.add(GamePlay(user_id=user.id,game_type='seker',choice=payload.action,result_key=row.result_key,result_data=json.dumps(receipt,separators=(',',':'),ensure_ascii=False)))
        now=datetime.now(timezone.utc)
        db.add(GameRound(id=receipt_id,user_id=user.id,game_type='seker_receipt',status='receipt',started_at=now,ends_at=now,result_key='receipt',state_data=json.dumps(receipt,separators=(',',':'),ensure_ascii=False)))
        if row.status=='finished':row.ends_at=datetime.now(timezone.utc)
        db.commit()
        return receipt
    return router


