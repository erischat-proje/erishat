"""Atomic, resumable Lidya Altın Şöleni rounds using existing wallet/game tables."""
import json
from datetime import datetime,timezone
from uuid import UUID,uuid5,NAMESPACE_URL
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,StrictInt,Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from .platform_models import GameRound,GameBet,GamePlay
from .moderation import require_feature
from .altin_engine import spin,CONFIG,KEYS,PAY,CAP,LINES,start_bonus,respin,JACKPOTS,SUPPORTED_VERSIONS


router=APIRouter(prefix='/v1/games/altin',tags=['altin'])
class SpinRequest(BaseModel):
    request_id:str=Field(min_length=36,max_length=36)
    round_id:str|None=Field(default=None,max_length=64)
    sequence:StrictInt=Field(default=0,ge=0)
    stake:StrictInt=Field(default=50,ge=1)
    action:str=Field(default='spin',pattern='^(spin|buy)$')
    class Config:extra='forbid'

def wallet_id(uid):return str(uuid5(NAMESPACE_URL,'eris:dede:fraction:'+str(uid)))
def fraction(db,uid):
    row=db.get(GameRound,wallet_id(uid))
    return int(json.loads(row.state_data).get('remainder',0)) if row else 0

def unpack(row):return json.loads(row.state_data)
def public_state(row,state,balance):
    bonus=state.get('bonus')
    return {'round_id':row.id,'sequence':state['sequence'],'remaining':state['remaining'],'bonus':bonus,'awarded':state.get('awarded',0),'stake':state['stake'],'total_payout':state['total_payout'],'held_payout':bonus['previewHundredths']*state['stake']/100 if bonus and row.status=='open' else 0,'finished':row.status=='finished','balance':balance,'version':state['version']}

def register_auth(current_user):
    @router.get('/rules')
    def rules():
        return {'name':'Lidya Altın Şöleni','version':CONFIG['version'],'symbols':KEYS,'paytable':[[v/100 for v in row] for row in PAY],'lines':LINES,'bonus_cost':100,'buy_spins':8,'max_win':5163,'jackpots':[v/100 for v in JACKPOTS],'target_rtp':CONFIG['targetRtp'],'rtp_status':CONFIG['calibration'],'money_trigger':6,'wild_reels':[2,3,4],'multipliers':[2,3,5,10,25]}

    @router.get('/active')
    def active(db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=db.scalar(select(GameRound).where(GameRound.user_id==user.id,GameRound.game_type=='altin',GameRound.status=='open').order_by(GameRound.started_at.desc()).limit(1))
        balance=db.scalar(select(User.lidya).where(User.id==user.id))+fraction(db,user.id)/100
        return {'state':public_state(row,unpack(row),balance) if row else None,'balance':balance,'last':unpack(row).get('last') if row else None}

    @router.post('/spin')
    def play(payload:SpinRequest,db:Session=Depends(get_db),user:User=Depends(current_user)):
        try:UUID(payload.request_id)
        except ValueError:raise HTTPException(422,'Geçersiz istek kimliği')
        locked=db.scalar(select(User).where(User.id==user.id).with_for_update().execution_options(populate_existing=True))
        if not locked:raise HTTPException(401,'Oturum bulunamadı')
        require_feature(db,user.id)
        rid=payload.round_id or str(uuid5(NAMESPACE_URL,'eris:altin:'+str(user.id)+':'+payload.request_id))
        row=db.get(GameRound,rid)
        if row and (row.user_id!=user.id or row.game_type!='altin'):raise HTTPException(404,'Tur bulunamadı')
        receipt_id=str(uuid5(NAMESPACE_URL,'eris:altin:receipt:'+str(user.id)+':'+payload.request_id))
        saved=db.get(GameRound,receipt_id)
        if saved:
            receipt=json.loads(saved.state_data)
            receipt['balance']=locked.lidya+fraction(db,user.id)/100
            receipt['replayed']=True
            return receipt
        is_bonus=bool(row)
        if row:
            state=unpack(row)
            if state.get('last_request')==payload.request_id:
                receipt=dict(state['last']);receipt['balance']=locked.lidya+fraction(db,user.id)/100;receipt['replayed']=True;return receipt
            if not payload.round_id or row.status!='open':raise HTTPException(409,'Tur tamamlandı')
            if payload.sequence!=state['sequence']:raise HTTPException(409,'Tur güncellendi; kaldığın yerden devam et')
            if payload.action!='spin' or payload.stake!=state['stake']:raise HTTPException(409,'Bonus sırasında bahis değiştirilemez')
            if state.get('version') not in SUPPORTED_VERSIONS:raise HTTPException(409,'Desteklenmeyen oyun sürümü')
            if not state.get('bonus') or state['bonus'].get('version')!=state['version']:raise HTTPException(409,'Bonus sürümü uyuşmuyor')
            if state['remaining']<=0:raise HTTPException(409,'Ücretsiz dönüş kalmadı')
            stake=state['stake'];charge=0;charge_cents=0;carry=fraction(db,user.id)
            result=respin(state['bonus'],remaining_cap=CAP-state['total_hundredths'])
            result['mode']='bonus';state['bonus']=result['bonus'];state['remaining']=result['bonus']['remaining'];state['awarded']=result['bonus']['awarded']
        else:
            if payload.round_id:raise HTTPException(404,'Tur bulunamadı')
            if payload.sequence!=0:raise HTTPException(409,'Başlangıç sırası geçersiz')
            existing=db.scalar(select(GameRound.id).where(GameRound.user_id==user.id,GameRound.game_type=='altin',GameRound.status=='open').limit(1))
            if existing:raise HTTPException(409,'Önce açık Lidya Altın Şöleni bonusunu tamamla')
            stake=payload.stake;charge_cents=stake*(10000 if payload.action=='buy' else 100)
            charge=charge_cents/100;carry=fraction(db,user.id);available=locked.lidya*100+carry
            if available<charge_cents:raise HTTPException(400,'Yeterli Lidya yok')
            previous_lidya=locked.lidya;locked.lidya,carry=divmod(available-charge_cents,100);charged_whole=previous_lidya-locked.lidya;now=datetime.now(timezone.utc)
            state={'version':CONFIG['version'],'entry':payload.action,'sequence':0,'remaining':0,'bonus':None,'awarded':0,'stake':stake,'total_payout':0,'total_hundredths':0}
            row=GameRound(id=rid,user_id=user.id,game_type='altin',status='open',started_at=now,ends_at=now,state_data='{}');db.add(row);db.flush()
            db.add(GameBet(round_id=rid,user_id=user.id,choice=payload.action,amount=charged_whole,payout=0))
            if payload.action=='buy':
                state['bonus']=start_bonus(purchased=True);result={'mode':'start','bonus':state['bonus'],'payoutHundredths':0,'capped':False,'modelVersion':CONFIG['version']}
            else:
                result=spin();result['mode']='base';state['bonus']=result['bonus']
            state['remaining']=state['bonus']['remaining'] if state['bonus'] else 0
            state['awarded']=state['remaining']
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
        if state['total_hundredths']>=CAP:
            state['remaining']=0
            if state['bonus']:state['bonus']['remaining']=0
        state['sequence']+=1;row.status='open' if state['remaining'] else 'finished';row.result_key='bonus' if state['remaining'] else 'win' if state['total_payout'] else 'lose'
        db.flush()
        bet=db.scalar(select(GameBet).where(GameBet.round_id==rid,GameBet.user_id==user.id));bet.payout=state['credited_payout']
        receipt={'state':public_state(row,state,balance),'result':result,'payout':payout,'charge':charge,'balance':balance,'request_id':payload.request_id}
        state['last_request']=payload.request_id;state['last']=receipt;row.state_data=json.dumps(state,separators=(',',':'),ensure_ascii=False)
        db.add(GamePlay(user_id=user.id,game_type='altin',choice=payload.action,result_key=row.result_key,result_data=json.dumps(receipt,separators=(',',':'),ensure_ascii=False)))
        now=datetime.now(timezone.utc)
        db.add(GameRound(id=receipt_id,user_id=user.id,game_type='altin_receipt',status='receipt',started_at=now,ends_at=now,result_key='receipt',state_data=json.dumps(receipt,separators=(',',':'),ensure_ascii=False)))
        if row.status=='finished':row.ends_at=datetime.now(timezone.utc)
        db.commit()
        return receipt
    return router

