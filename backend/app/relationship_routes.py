"""Mutual relationship consent and transactional shared house inventory."""
import json
import re
from datetime import datetime, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, case, delete, func, or_, select
from sqlalchemy.orm import Session, aliased
from .db import get_db
from .models import User, Conversation, ConversationMember, Message
from .platform_models import DirectMessageGift, UserBlock, Notification
from .room_models import RoomGiftEvent
from .admin_models import AdminRole
from .moderation import active_ban, require_feature
from .relationship_models import Couple, CoupleMember, LoveRequest, CoupleOperation, CoupleEvent

router = APIRouter(prefix='/v1/relationship', tags=['relationship'])
_current_user = None
ISTANBUL = ZoneInfo('Europe/Istanbul')
MATERIALS = ('brick', 'wood', 'paint')
# Requirements printed on each current house artwork, consumed to advance.
HOUSE_NEEDS = {i: dict(zip(MATERIALS, values)) for i, values in enumerate([
    (30,50,5), (45,75,8), (70,110,12), (105,160,18), (155,230,26),
    (225,330,38), (320,470,54), (450,660,76), (630,920,106),
    (880,1280,148), (1220,1780,206), (1680,2450,284)], 1)}
PRICES = {'copper':1200, 'silver':2100, 'gold':2800}


def now():
    return datetime.now(timezone.utc)


def register_auth(fn):
    global _current_user
    _current_user = fn


def authenticated(db: Session = Depends(get_db), authorization: str | None = Header(None), request: Request = None):
    return _current_user(db, authorization, request)


class TextRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)

    @field_validator('message')
    @classmethod
    def nonempty(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('Mesaj boş olamaz.')
        return value


class Confession(TextRequest):
    target_id: str = Field(min_length=1, max_length=64)


class Decision(BaseModel):
    action: str = Field(pattern='^(accept|reject)$')


class Purchase(BaseModel):
    request_key: str = Field(min_length=16, max_length=64, pattern=r'^[A-Za-z0-9_-]+$')
    item: str = Field(min_length=1, max_length=32)
    quantity: int = Field(default=1, ge=1, le=1_000_000, strict=True)


class Marriage(TextRequest):
    ring: str = Field(pattern=r'^gold-(?:[1-9]|1[0-9]|20)$')
    request_key: str = Field(min_length=16, max_length=64, pattern=r'^[A-Za-z0-9_-]+$')


def portrait(user):
    return {'id':user.id, 'nickname':user.nickname, 'avatar':user.avatar,
            'avatar_asset':user.avatar_asset, 'frame_asset':user.frame_asset}


def blocked(db, a, b):
    return bool(db.scalar(select(UserBlock.id).where(or_(
        and_(UserBlock.blocker_id == a, UserBlock.blocked_id == b),
        and_(UserBlock.blocker_id == b, UserBlock.blocked_id == a)))))


def available(db, uid):
    u = db.get(User, uid)
    role = db.get(AdminRole, uid)
    return bool(u and u.is_active and not active_ban(db, uid)
                and not (role and role.role == 'DA' and role.ghost_mode))


def lock_users(db, ids):
    # All operations take user locks in the same order, then the house lock.
    for uid in sorted(set(ids)):
        db.scalar(select(User).where(User.id == uid).with_for_update().execution_options(populate_existing=True))


def my_couple(db, uid):
    member = db.get(CoupleMember, uid)
    return db.get(Couple, member.couple_id) if member else None


def owned_house(db, uid, lock=False):
    house = my_couple(db, uid)
    if not house or not house.active:
        raise HTTPException(409, 'Aktif ilişkiniz bulunmuyor.')
    if lock:
        lock_users(db, [house.male_id, house.female_id])
        house = db.scalar(select(Couple).where(Couple.id == house.id).with_for_update().execution_options(populate_existing=True))
        if not house.active or not db.get(CoupleMember, uid):
            raise HTTPException(409, 'İlişki sona ermiş.')
    return house


def check_pair(db, a, b):
    if a == b or not available(db, a) or not available(db, b) or blocked(db, a, b):
        raise HTTPException(403, 'Bu kullanıcıyla ilişki işlemi yapılamaz.')


def dm_peers(db, uid):
    own, peer = aliased(ConversationMember), aliased(ConversationMember)
    return set(db.scalars(select(peer.user_id).join(Conversation, Conversation.id == peer.conversation_id)
        .join(own, own.conversation_id == peer.conversation_id)
        .where(own.user_id == uid, peer.user_id != uid, Conversation.type == 'dm',
               select(Message.id).where(Message.conversation_id == Conversation.id,
                   Message.sender_id.in_([uid, peer.user_id])).correlate(Conversation, peer).exists())))


def shared_gifts(db, uid, peers):
    peers = set(peers)
    result = {p:0 for p in peers}
    if not peers:
        return result
    for model, value in ((RoomGiftEvent, RoomGiftEvent.total_price), (DirectMessageGift, DirectMessageGift.unit_price)):
        partner = case((model.sender_id == uid, model.recipient_id), else_=model.sender_id)
        for pid, amount in db.execute(select(partner, func.sum(value)).where(or_(
            and_(model.sender_id == uid, model.recipient_id.in_(peers)),
            and_(model.recipient_id == uid, model.sender_id.in_(peers)))).group_by(partner)):
            result[pid] += int(amount or 0)
    return result


def status_key(house):
    if house.married:
        return 'married'
    if not house.ring:
        return 'dating'
    metal = house.ring.split('-')[0]
    return metal + ('-engaged' if house.level >= 4 else '-promise')


def public_brief(db, uid):
    house = my_couple(db, uid)
    if not house or not house.active or not available(db, house.male_id) or not available(db, house.female_id):
        return None
    partner_id = house.female_id if uid == house.male_id else house.male_id
    return {'id':house.id, 'status':status_key(house), 'ring':house.ring, 'level':house.level,
            'partner':portrait(db.get(User, partner_id))}


def summary(db, house):
    start = house.started_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    needs = HOUSE_NEEDS[house.level] if house.level < 12 else {m:0 for m in MATERIALS}
    return {'id':house.id, 'level':house.level, 'status':status_key(house), 'ring':house.ring, 'married':house.married,
            'male':portrait(db.get(User, house.male_id)), 'female':portrait(db.get(User, house.female_id)),
            'days':max(1, (now().astimezone(ISTANBUL).date() - start.astimezone(ISTANBUL).date()).days + 1),
            'started_at':start.isoformat(), 'materials':{m:getattr(house,m) for m in MATERIALS},
            'remaining':{m:max(0,needs[m]-getattr(house,m)) for m in MATERIALS},
            'material_price':750, 'needs_first_copper':not bool(house.ring), 'max_level':house.level == 12}


def notify(db, uid, kind, payload):
    db.add(CoupleEvent(user_id=uid, kind=kind, payload=json.dumps(payload, ensure_ascii=False)))
    db.add(Notification(user_id=uid, kind='relationship_' + kind, title=payload.get('title','İlişki'), body=payload.get('message','')))


def request_info(db, row, uid):
    return {'id':row.id, 'kind':row.kind, 'message':row.message, 'status':row.status,
            'incoming':row.recipient_id == uid, 'ring':row.ring,
            'peer':portrait(db.get(User, row.sender_id if row.recipient_id == uid else row.recipient_id))}


def advance(db, house):
    old = house.level
    # The first promise ring is a requirement of the level-one tutorial.
    while house.ring and house.level < 12:
        needs = HOUSE_NEEDS[house.level]
        if any(getattr(house,m) < needs[m] for m in MATERIALS):
            break
        for m in MATERIALS:
            setattr(house,m,getattr(house,m)-needs[m])
        house.level += 1
    if house.level != old:
        for uid in (house.male_id, house.female_id):
            notify(db,uid,'upgrade',{'title':'Aile eviniz seviye ' + str(house.level) + ' oldu!', 'message':'Ortak malzemelerinizle eviniz gelişti.'})


def charge(db, uid, amount, ref):
    user = db.get(User, uid)
    if int(user.lidya or 0) < amount:
        raise HTTPException(402, f'{amount} Lidya gerekli.')
    user.lidya -= amount
    db.info.update(lidya_operation='relationship_purchase', lidya_actor_id=uid, lidya_reference_id=ref)
    db.flush()
    for key in ('lidya_operation','lidya_actor_id','lidya_reference_id'):
        db.info.pop(key,None)


def operation(db, uid, house, payload, kind, item, quantity, amount):
    old = db.scalar(select(CoupleOperation).where(CoupleOperation.user_id == uid, CoupleOperation.request_key == payload.request_key))
    if old:
        if (old.couple_id,old.kind,old.item,old.quantity) != (house.id,kind,item,quantity):
            raise HTTPException(409,'İşlem anahtarı farklı bir satın alımda kullanılmış.')
        return old, True
    row = CoupleOperation(id=str(uuid4()), user_id=uid, couple_id=house.id, request_key=payload.request_key,
                          kind=kind, item=item, quantity=quantity, amount=amount)
    charge(db,uid,amount,row.id)
    db.add(row)
    return row, False


@router.get('/catalog')
def catalog(user: User = Depends(authenticated)):
    return {'rings':[{'key':f'{metal}-{i}','category':metal,'price':price,'asset':f'./relationship-assets/{metal}-{i}.png'}
                     for metal,price in PRICES.items() for i in range(1,21)],
            'material_price':750, 'house_needs':HOUSE_NEEDS}


@router.get('/me')
def state(db: Session = Depends(get_db), user: User = Depends(authenticated)):
    house = my_couple(db, user.id)
    pending = list(db.scalars(select(LoveRequest).where(LoveRequest.status == 'pending',
        or_(LoveRequest.sender_id == user.id, LoveRequest.recipient_id == user.id)).order_by(LoveRequest.created_at.desc())))
    requests = [request_info(db,r,user.id) for r in pending if available(db,r.sender_id) and available(db,r.recipient_id) and not blocked(db,r.sender_id,r.recipient_id)]
    if house and house.active:
        return {'active':summary(db,house), 'candidates':[], 'requests':requests}
    peers = dm_peers(db,user.id)
    opposite = {'male':'female','female':'male'}.get(user.gender)
    candidates = []
    if opposite:
        users = list(db.scalars(select(User).where(User.id.in_(peers),User.gender == opposite,User.is_active.is_(True)).order_by(User.nickname,User.id)))
        totals = shared_gifts(db,user.id,peers)
        for target in users:
            if not available(db,target.id) or blocked(db,user.id,target.id) or db.get(CoupleMember,target.id):
                continue
            total = totals.get(target.id,0)
            candidates.append({**portrait(target),'points':min(3000,total),'total_lidya':total,'can_confess':total >= 3000})
    return {'active':None,'candidates':candidates,'requests':requests,'gender_required':not bool(opposite)}


@router.post('/confessions')
def confess(payload: Confession, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    lock_users(db,[user.id,payload.target_id])
    check_pair(db,user.id,payload.target_id)
    require_feature(db,user.id,[payload.target_id])
    target = db.get(User,payload.target_id)
    if user.gender not in {'male','female'} or target.gender == user.gender or target.gender not in {'male','female'}:
        raise HTTPException(403,'İtiraf yalnızca karşı cinsteki kullanıcıya gönderilebilir.')
    if db.get(CoupleMember,user.id) or db.get(CoupleMember,target.id):
        raise HTTPException(409,'İki tarafın da aktif ilişkisi olmamalı.')
    if target.id not in dm_peers(db,user.id) or shared_gifts(db,user.id,{target.id})[target.id] < 3000:
        raise HTTPException(403,'Önce DM üzerinden iletişim kurmalı ve ortak hediye barını 3.000 puana ulaştırmalısınız.')
    old = db.scalar(select(LoveRequest).where(LoveRequest.kind == 'confession',LoveRequest.status == 'pending',
        or_(LoveRequest.sender_id.in_([user.id,target.id]),LoveRequest.recipient_id.in_([user.id,target.id]))))
    if old:
        raise HTTPException(409,'Taraflardan birinin bekleyen ilişki itirafı var.')
    row = LoveRequest(id=str(uuid4()),sender_id=user.id,recipient_id=target.id,kind='confession',message=payload.message)
    db.add(row)
    notify(db,target.id,'request',{'request_id':row.id,'sender_id':user.id,'title':user.nickname + ' size aşkını itiraf etti!','message':row.message})
    db.commit()
    return request_info(db,row,user.id)


@router.post('/requests/{request_id}/respond')
def respond(request_id: str, payload: Decision, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    row = db.get(LoveRequest,request_id)
    if not row or row.recipient_id != user.id:
        raise HTTPException(404,'Teklif bulunamadı.')
    lock_users(db,[row.sender_id,row.recipient_id])
    row = db.scalar(select(LoveRequest).where(LoveRequest.id == request_id).with_for_update().execution_options(populate_existing=True))
    result = 'accepted' if payload.action == 'accept' else 'rejected'
    if row.status != 'pending':
        if row.status != result:
            raise HTTPException(409,'Teklif daha önce yanıtlandı.')
        return {'status':row.status}
    if payload.action == 'accept':
        check_pair(db,row.sender_id,row.recipient_id)
        require_feature(db,user.id,[row.sender_id])
        if row.kind == 'confession':
            if db.get(CoupleMember,row.sender_id) or db.get(CoupleMember,row.recipient_id):
                raise HTTPException(409,'Taraflardan birinin aktif ilişkisi var.')
            sender = db.get(User,row.sender_id)
            if {sender.gender,user.gender} != {'male','female'}:
                raise HTTPException(409,'Cinsiyet bilgileri ilişki koşulunu karşılamıyor.')
            house = Couple(id=str(uuid4()), male_id=sender.id if sender.gender == 'male' else user.id,
                           female_id=sender.id if sender.gender == 'female' else user.id, started_at=now())
            db.add(house);db.flush()
            db.add_all([CoupleMember(user_id=uid,couple_id=house.id) for uid in (sender.id,user.id)])
            row.couple_id = house.id
            for uid in (sender.id,user.id):
                notify(db,uid,'welcome',{'title':'İlk seviye eve geçiş yaptınız','message':'Seviye 2 için önce 1 adet bakır yüzük satın almalısınız. Ortak tuğla, tahta ve boya ihtiyacını tamamlayarak evinizi geliştirebilirsiniz.'})
        else:
            house = owned_house(db,user.id,lock=True)
            if house.id != row.couple_id or house.married:
                raise HTTPException(409,'Bu evlilik teklifi artık geçerli değil.')
            house.married,house.ring = True,row.ring
    row.status = result
    sender_notice = user.nickname + (' evlilik teklifinizi kabul etti; size evet dedi!' if result == 'accepted' else ' evlilik teklifinizi reddetti; size hayır dedi!') if row.kind == 'marriage' else user.nickname + (' ilişki itirafınızı kabul etti!' if result == 'accepted' else ' ilişki itirafınızı reddetti.')
    notify(db,row.sender_id,'result',{'title':sender_notice,'message':''})
    db.commit()
    return {'status':result}


@router.post('/ring')
def buy_ring(payload: Purchase, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    house = owned_house(db,user.id,lock=True)
    check_pair(db,house.male_id,house.female_id)
    if house.married or not re.fullmatch(r'(copper|silver)-(?:[1-9]|1[0-9]|20)',payload.item) or payload.quantity != 1:
        raise HTTPException(400,'Geçerli bir söz yüzüğü seçiniz.')
    if not house.ring and not payload.item.startswith('copper-'):
        raise HTTPException(403,'İlk yüzük bakır olmalıdır.')
    op,replay = operation(db,user.id,house,payload,'ring',payload.item,1,PRICES[payload.item.split('-')[0]])
    if not replay:
        house.ring = payload.item
        advance(db,house)
    db.commit()
    return {'operation_id':op.id,'already_processed':replay,'active':summary(db,house)}


def buy_material(db, user, house, payload, donation=False):
    if payload.item not in MATERIALS:
        raise HTTPException(400,'Geçerli bir malzeme seçiniz.')
    kind = 'donation' if donation else 'material'
    op,replay = operation_existing(db,user.id,house,payload,kind,payload.item,payload.quantity)
    if not replay:
        value = getattr(house,payload.item) + payload.quantity
        if value > 1_000_000_000:
            raise HTTPException(400,'Malzeme deposu sınırına ulaşıldı.')
        op,_ = operation(db,user.id,house,payload,kind,payload.item,payload.quantity,payload.quantity*750)
        setattr(house,payload.item,value)
        advance(db,house)
        if donation:
            for uid in (house.male_id,house.female_id):
                notify(db,uid,'donation',{'operation_id':op.id,'sender_id':user.id,'title':user.nickname + ' isimli dostunuz aile evinize katkıda bulundu.','message':f'{payload.quantity} adet malzeme · {op.amount} Lidya'})
    db.commit()
    return {'operation_id':op.id,'already_processed':replay,'active':summary(db,house)}


@router.post('/materials')
def materials(payload: Purchase, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    house = owned_house(db,user.id,lock=True)
    check_pair(db,house.male_id,house.female_id)
    return buy_material(db,user,house,payload)


@router.post('/marriage')
def marriage(payload: Marriage, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    house = owned_house(db,user.id,lock=True)
    peer = house.female_id if user.id == house.male_id else house.male_id
    check_pair(db,user.id,peer);require_feature(db,user.id,[peer])
    # The document explicitly allows proposals at every house level.
    op,replay = operation_existing(db,user.id,house,payload,'marriage',payload.ring,1)
    if replay:
        return request_info(db,db.get(LoveRequest,op.request_id),user.id)
    if house.married:
        raise HTTPException(409,'Zaten evlisiniz.')
    if db.scalar(select(LoveRequest.id).where(LoveRequest.couple_id == house.id,LoveRequest.kind == 'marriage',LoveRequest.status == 'pending')):
        raise HTTPException(409,'Bekleyen evlilik teklifi var.')
    row = LoveRequest(id=str(uuid4()),sender_id=user.id,recipient_id=peer,kind='marriage',couple_id=house.id,ring=payload.ring,message=payload.message)
    db.add(row);db.flush()
    op,_ = operation(db,user.id,house,payload,'marriage',payload.ring,1,2800)
    op.request_id = row.id
    notify(db,peer,'request',{'request_id':row.id,'sender_id':user.id,'ring':row.ring,'title':'Partneriniz ' + user.nickname + ' size evlilik teklif etti. Kabul ediyor musunuz?','message':row.message})
    db.commit()
    return request_info(db,row,user.id)


def operation_existing(db, uid, house, payload, kind, item, quantity):
    old = db.scalar(select(CoupleOperation).where(CoupleOperation.user_id == uid,CoupleOperation.request_key == payload.request_key))
    if old and (old.couple_id,old.kind,old.item,old.quantity) != (house.id,kind,item,quantity):
        raise HTTPException(409,'İşlem anahtarı başka bir satın alımda kullanılmış.')
    return old, bool(old)


@router.get('/houses/{house_id}')
def public_house(house_id: str, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    house = db.get(Couple,house_id)
    if not house or not house.active:
        raise HTTPException(404,'Aile evi bulunamadı.')
    for uid in (house.male_id,house.female_id):
        if not available(db,uid) or blocked(db,user.id,uid):
            raise HTTPException(403,'Bu aile evine erişemezsiniz.')
    return {**summary(db,house), 'is_owner':user.id in (house.male_id,house.female_id)}


@router.post('/houses/{house_id}/donate')
def donate(house_id: str, payload: Purchase, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    house = db.get(Couple,house_id)
    if not house:
        raise HTTPException(404,'Aile evi bulunamadı.')
    lock_users(db,[user.id,house.male_id,house.female_id])
    house = db.scalar(select(Couple).where(Couple.id == house_id).with_for_update().execution_options(populate_existing=True))
    if not house.active or user.id in (house.male_id,house.female_id):
        raise HTTPException(403,'Katkı yalnızca başka bir çiftin aktif evine yapılabilir.')
    for uid in (house.male_id,house.female_id):
        check_pair(db,user.id,uid)
    require_feature(db,user.id,[house.male_id,house.female_id])
    return buy_material(db,user,house,payload,donation=True)


@router.post('/donations/{operation_id}/thank')
def thank(operation_id: str, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    op = db.get(CoupleOperation,operation_id)
    if not op or op.kind != 'donation':
        raise HTTPException(404,'Katkı bulunamadı.')
    house = db.get(Couple,op.couple_id)
    if user.id not in (house.male_id,house.female_id):
        raise HTTPException(404,'Katkı bulunamadı.')
    lock_users(db,[house.male_id,house.female_id,op.user_id])
    op = db.scalar(select(CoupleOperation).where(CoupleOperation.id == operation_id).with_for_update().execution_options(populate_existing=True))
    if not op.thanked:
        op.thanked = True
        notify(db,op.user_id,'thanks',{'title':'Hediye gönderdiğiniz çiftimiz size teşekkür etti!','message':''})
    db.commit()
    return {'thanked':True}


@router.get('/events')
def events(db: Session = Depends(get_db), user: User = Depends(authenticated)):
    result = []
    dirty = False
    for row in db.scalars(select(CoupleEvent).where(CoupleEvent.user_id == user.id,CoupleEvent.acknowledged.is_(False)).order_by(CoupleEvent.id).limit(50)):
        data = json.loads(row.payload)
        if data.get('sender_id') and (not available(db,data['sender_id']) or blocked(db,user.id,data['sender_id'])):
            row.acknowledged = True
            dirty = True
            continue
        if data.get('request_id'):
            request = db.get(LoveRequest,data['request_id'])
            if not request or request.status != 'pending':
                row.acknowledged = True
                dirty = True
                continue
        result.append({'id':row.id,'kind':row.kind,**data})
    if dirty:
        db.commit()
    return result


@router.post('/events/{event_id}/ack')
def acknowledge(event_id: int, db: Session = Depends(get_db), user: User = Depends(authenticated)):
    row = db.get(CoupleEvent,event_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404,'Bildirim bulunamadı.')
    row.acknowledged = True;db.commit()
    return {'ok':True}


@router.post('/end')
def end_relationship(db: Session = Depends(get_db), user: User = Depends(authenticated)):
    house = owned_house(db,user.id,lock=True)
    house.active = False
    db.execute(delete(CoupleMember).where(CoupleMember.couple_id == house.id))
    for row in db.scalars(select(LoveRequest).where(LoveRequest.couple_id == house.id,LoveRequest.status == 'pending')):
        row.status = 'cancelled'
    peer = house.female_id if user.id == house.male_id else house.male_id
    notify(db,peer,'ended',{'title':user.nickname + ' ilişkinizi sonlandırdı.','message':'Ortak aile evi kapatıldı.'})
    db.commit()
    return {'ended':True}
