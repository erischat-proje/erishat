"""Atomic, resumable Dede rounds using existing wallet/game tables."""
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
from .dede_engine import spin,CONFIG,KEYS,PAY

router=APIRouter(prefix='/v1/games/dede',tags=['dede'])
class SpinRequest(BaseModel):
    request_id:str=Field(min_length=36,max_length=36)
    round_id:str|None=Field(default=None,max_length=64)
    sequence:StrictInt=Field(default=0,ge=0)
    stake:StrictInt=Field(default=20,ge=20,le=10000)
    ante:StrictBool=False
    action:str=Field(default='spin',pattern='^(spin|buy)$')
    class Config:extra='forbid'

def unpack(row):return json.loads(row.state_data)
def public_state(row,state,balance):
    return {'round_id':row.id,'sequence':state['sequence'],'remaining':state['remaining'],'pool':state['pool'],'stake':state['stake'],'ante':state['ante'],'total_payout':state['total_payout'],'finished':row.status=='finished','balance':balance,'version':state['version']}

def register_auth(current_user):
    @router.get('/rules')
    def rules():
        return {'name':'Dede','version':CONFIG['version'],'symbols':KEYS,'paytable':[[v/100 for v in r] for r in PAY],'max_win':5000,'bonus_spins':15,'retrigger_spins':5,'bonus_cost':100,'ante_cost':1.25,'target_rtp':.965,'measured_report':'docs/dede-statistics.json','pool_rule':'Her kazanan bonus dönüşünde biriken havuz uygulanır.'}

    @router.get('/active')
    def active(db:Session=Depends(get_db),user:User=Depends(current_user)):
        row=db.scalar(select(GameRound).where(GameRound.user_id==user.id,GameRound.game_type=='dede',GameRound.status=='open').order_by(GameRound.started_at.desc()).limit(1))
        balance=db.scalar(select(User.lidya).where(User.id==user.id))
        return {'state':public_state(row,unpack(row),balance) if row else None,'balance':balance,'last':unpack(row).get('last') if row else None}

    @router.post('/spin')
    def play(payload:SpinRequest,db:Session=Depends(get_db),user:User=Depends(current_user)):
        try:UUID(payload.request_id)
        except ValueError:raise HTTPException(422,'Geçersiz istek kimliği')
        if payload.stake%20:raise HTTPException(422,'Bahis 20 Lidya katı olmalı')
        locked=db.scalar(select(User).where(User.id==user.id).with_for_update().execution_options(populate_existing=True))
        if not locked:raise HTTPException(401,'Oturum bulunamadı')
        require_feature(db,user.id)
        rid=payload.round_id or str(uuid5(NAMESPACE_URL,'eris:dede:'+str(user.id)+':'+payload.request_id))
        row=db.get(GameRound,rid)
        if row and (row.user_id!=user.id or row.game_type!='dede'):raise HTTPException(404,'Tur bulunamadı')
        if row:
            state=unpack(row)
            if state.get('last_request')==payload.request_id:
                receipt=dict(state['last']);receipt['balance']=locked.lidya;receipt['replayed']=True;return receipt
            if not payload.round_id or row.status!='open':raise HTTPException(409,'Tur tamamlandı')
            if payload.sequence!=state['sequence']:raise HTTPException(409,'Tur güncellendi; kaldığın yerden devam et')
            if payload.action!='spin' or payload.stake!=state['stake'] or payload.ante!=state['ante']:raise HTTPException(409,'Bonus sırasında bahis değiştirilemez')
            if state['remaining']<=0:raise HTTPException(409,'Ücretsiz dönüş kalmadı')
            stake=state['stake'];state['remaining']-=1;charge=0
            result=spin(bonus=True,pool=state['pool'],remaining_cap=500000-state['total_hundredths'])
            state['pool']=result['pool'];state['remaining']+=result['extraSpins']
        else:
            if payload.round_id:raise HTTPException(404,'Tur bulunamadı')
            if payload.sequence!=0:raise HTTPException(409,'Başlangıç sırası geçersiz')
            existing=db.scalar(select(GameRound.id).where(GameRound.user_id==user.id,GameRound.game_type=='dede',GameRound.status=='open').limit(1))
            if existing:raise HTTPException(409,'Önce açık Dede bonusunu tamamla')
            if payload.action=='buy' and payload.ante:raise HTTPException(422,'Bonus alırken şans artırmayı kapat')
            stake=payload.stake;charge=stake*100 if payload.action=='buy' else stake*5//4 if payload.ante else stake
            if locked.lidya<charge:raise HTTPException(400,'Yeterli Lidya yok')
            locked.lidya-=charge;now=datetime.now(timezone.utc)
            state={'version':CONFIG['version'],'sequence':0,'remaining':15 if payload.action=='buy' else 0,'pool':0,'stake':stake,'ante':payload.ante,'total_payout':0,'total_hundredths':0}
            row=GameRound(id=rid,user_id=user.id,game_type='dede',status='open',started_at=now,ends_at=now,state_data='{}');db.add(row);db.flush()
            db.add(GameBet(round_id=rid,user_id=user.id,choice='buy' if payload.action=='buy' else 'ante' if payload.ante else 'spin',amount=charge,payout=0))
            result=None if payload.action=='buy' else spin(ante=payload.ante)
            if result and result['bonusTriggered']:state['remaining']=15
        payout=0 if result is None else result['payoutHundredths']*stake//100
        locked.lidya+=payout;state['total_payout']+=payout
        if result:state['total_hundredths']+=result['payoutHundredths']
        if state['total_hundredths']>=500000:state['remaining']=0
        state['sequence']+=1;row.status='open' if state['remaining'] else 'finished';row.result_key='bonus' if state['remaining'] else 'win' if state['total_payout'] else 'lose'
        db.flush()
        bet=db.scalar(select(GameBet).where(GameBet.round_id==rid,GameBet.user_id==user.id));bet.payout=state['total_payout']
        receipt={'state':public_state(row,state,locked.lidya),'result':result,'payout':payout,'charge':charge,'balance':locked.lidya,'request_id':payload.request_id}
        state['last_request']=payload.request_id;state['last']=receipt;row.state_data=json.dumps(state,separators=(',',':'),ensure_ascii=False)
        db.add(GamePlay(user_id=user.id,game_type='dede',choice=payload.action,result_key=row.result_key,result_data=json.dumps(receipt,separators=(',',':'),ensure_ascii=False)))
        db.commit()
        return receipt
    return router
