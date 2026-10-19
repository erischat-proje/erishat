"""Room-scoped permission requests, microphone invitations and private results."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column
from .db import Base,get_db
from .models import User
from .room_models import Room,RoomSeat,RoomMember,RoomModerator

class RoomSystemEntry(Base):
    __tablename__='room_system_entries'
    message_id:Mapped[int]=mapped_column(ForeignKey('room_chat_messages.id',ondelete='CASCADE'),primary_key=True)

class SeatPermission(Base):
    __tablename__='room_seat_permission'
    room_id:Mapped[str]=mapped_column(ForeignKey('rooms.id',ondelete='CASCADE'),primary_key=True)
    enabled:Mapped[bool]=mapped_column(Boolean,default=False)

class SeatAction(Base):
    __tablename__='room_seat_actions'
    id:Mapped[str]=mapped_column(String(36),primary_key=True)
    room_id:Mapped[str]=mapped_column(ForeignKey('rooms.id',ondelete='CASCADE'),index=True)
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id'),index=True)
    sender_id:Mapped[str]=mapped_column(ForeignKey('users.id'))
    seat_number:Mapped[int]=mapped_column(Integer)
    kind:Mapped[str]=mapped_column(String(8))
    status:Mapped[str]=mapped_column(String(16),default='pending')
    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))

class SeatNotice(Base):
    __tablename__='room_seat_notices'
    id:Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    room_id:Mapped[str]=mapped_column(ForeignKey('rooms.id',ondelete='CASCADE'),index=True)
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id'),index=True)
    text:Mapped[str]=mapped_column(String(250))
    seen:Mapped[bool]=mapped_column(Boolean,default=False)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

router=APIRouter(prefix='/v1/rooms',tags=['seat-permissions'])
def now():return datetime.now(timezone.utc)
def utc(v):return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v

def enabled(db,rid):
    row=db.get(SeatPermission,rid)
    return bool(row and row.enabled)

def lock_room(db,room):
    return db.scalar(select(Room).where(Room.id==room.id).with_for_update().execution_options(populate_existing=True))

def staff(db,room,uid):
    from .room_routes import is_member
    return room.owner_id==uid or (is_member(db,room.id,uid) and bool(db.scalar(select(RoomModerator.id).where(RoomModerator.room_id==room.id,RoomModerator.user_id==uid))))

def seat(db,room,number):
    if not 1<=number<=room.seat_count:raise HTTPException(422,'Bu düzende bu koltuk yok.')
    row=db.scalar(select(RoomSeat).where(RoomSeat.room_id==room.id,RoomSeat.seat_number==number).with_for_update().execution_options(populate_existing=True))
    if not row:raise HTTPException(404,'Koltuk bulunamadı.')
    if row.locked:raise HTTPException(409,'Bu koltuk kilitli.')
    return row

def require_guest(db,room,user):
    from .room_routes import is_member,reject_ghost
    if not is_member(db,room.id,user.id):raise HTTPException(403,'Önce odaya katılmalısınız.')
    reject_ghost(db,user,'Koltuğa oturmak')

def assign(db,room,user,number):
    require_guest(db,room,user);row=seat(db,room,number)
    if row.user_id and row.user_id!=user.id:raise HTTPException(409,'Bu koltuk dolu. Başka koltuk seçin.')
    previous=db.scalar(select(RoomSeat).where(RoomSeat.room_id==room.id,RoomSeat.user_id==user.id).with_for_update())
    if previous and previous.id!=row.id:previous.user_id=None;previous.muted=False;db.flush()
    row.user_id=user.id;row.muted=False
    for pending in db.scalars(select(SeatAction).where(SeatAction.room_id==room.id,SeatAction.status=='pending',((SeatAction.user_id==user.id)|(SeatAction.seat_number==number)))):
        pending.status='cancelled'
    return {'seated':True,'seat_number':number,'user_id':user.id}

def submit(db,room,user,number,kind='request',sender=None):
    require_guest(db,room,user);row=seat(db,room,number)
    if row.user_id:raise HTTPException(409,'Bu koltuk dolu.')
    for item in db.scalars(select(SeatAction).where(SeatAction.room_id==room.id,SeatAction.user_id==user.id,SeatAction.kind==kind,SeatAction.status=='pending')):
        if utc(item.expires_at)<=now():item.status='expired'
        elif item.seat_number==number:return {'pending':True,'id':item.id,'seat_number':number}
        else:item.status='cancelled'
    item=SeatAction(id=str(uuid4()),room_id=room.id,user_id=user.id,sender_id=sender or user.id,seat_number=number,kind=kind,status='pending',expires_at=now()+timedelta(minutes=10))
    db.add(item);return {'pending':True,'id':item.id,'seat_number':number}

def sit(db,room,user,number):
    room=lock_room(db,room)
    if enabled(db,room.id) and not staff(db,room,user.id):result=submit(db,room,user,number)
    else:result=assign(db,room,user,number)
    db.commit();return result

class Toggle(BaseModel):enabled:bool
class Invitation(BaseModel):user_id:str
class Decision(BaseModel):accept:bool

def register_auth(current_user):
    def room_for(db,identifier):
        from .room_routes import get_room_or_404
        return get_room_or_404(db,identifier)

    @router.get('/{room_id}/seat-permission')
    def state(room_id:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
        from .room_routes import is_member
        room=room_for(db,room_id)
        if not is_member(db,room.id,user.id):raise HTTPException(403,'Önce odaya katılmalısınız.')
        manager=staff(db,room,user.id);actions=[]
        for a in db.scalars(select(SeatAction).where(SeatAction.room_id==room.id,SeatAction.status=='pending',SeatAction.expires_at>now())):
            if a.kind=='request' and not manager and a.user_id!=user.id:continue
            if a.kind=='invite' and a.user_id!=user.id and a.sender_id!=user.id:continue
            target=db.get(User,a.user_id)
            if not target:continue
            actions.append({'id':a.id,'kind':a.kind,'seat_number':a.seat_number,'user_id':a.user_id,'nickname':target.nickname,'avatar':target.avatar,'avatar_asset':target.avatar_asset,'frame_asset':target.frame_asset,'own':a.user_id==user.id})
        seated=set(db.scalars(select(RoomSeat.user_id).where(RoomSeat.room_id==room.id,RoomSeat.user_id.is_not(None))))
        members=[]
        if manager:
            from .room_routes import ghost_active
            for target in db.scalars(select(User).join(RoomMember,RoomMember.user_id==User.id).where(RoomMember.room_id==room.id,RoomMember.ghost.is_(False))):
                if target.id not in seated and not ghost_active(db,target.id):members.append({'user_id':target.id,'nickname':target.nickname,'avatar':target.avatar,'avatar_asset':target.avatar_asset,'frame_asset':target.frame_asset})
        notices=[{'id':n.id,'text':n.text} for n in db.scalars(select(SeatNotice).where(SeatNotice.room_id==room.id,SeatNotice.user_id==user.id,SeatNotice.seen.is_(False)).order_by(SeatNotice.id).limit(30))]
        return {'enabled':enabled(db,room.id),'can_manage':manager,'actions':actions,'members':members,'notices':notices}

    @router.put('/{room_id}/seat-permission')
    def toggle(room_id:str,payload:Toggle,db:Session=Depends(get_db),user:User=Depends(current_user)):
        from .room_routes import require_staff,reject_ghost
        room=lock_room(db,room_for(db,room_id));require_staff(db,room,user);reject_ghost(db,user)
        row=db.get(SeatPermission,room.id)
        if not row:row=SeatPermission(room_id=room.id);db.add(row)
        row.enabled=payload.enabled
        if not payload.enabled:
            for a in db.scalars(select(SeatAction).where(SeatAction.room_id==room.id,SeatAction.kind=='request',SeatAction.status=='pending')):a.status='cancelled'
        db.commit();return {'enabled':row.enabled}

    @router.post('/{room_id}/seats/{number}/invite')
    def invite(room_id:str,number:int,payload:Invitation,db:Session=Depends(get_db),user:User=Depends(current_user)):
        from .room_routes import require_staff,reject_ghost
        room=lock_room(db,room_for(db,room_id));require_staff(db,room,user);reject_ghost(db,user)
        target=db.get(User,payload.user_id)
        if not target:raise HTTPException(404,'Kullanıcı bulunamadı.')
        if db.scalar(select(RoomSeat).where(RoomSeat.room_id==room.id,RoomSeat.user_id==target.id)):raise HTTPException(409,'Kullanıcı zaten koltukta.')
        result=submit(db,room,target,number,'invite',user.id);db.commit();return result

    @router.post('/{room_id}/seat-actions/{action_id}/decision')
    def decision(room_id:str,action_id:str,payload:Decision,db:Session=Depends(get_db),user:User=Depends(current_user)):
        from .room_routes import require_staff,reject_ghost
        room=lock_room(db,room_for(db,room_id));a=db.get(SeatAction,action_id)
        if not a or a.room_id!=room.id:raise HTTPException(404,'Koltuk talebi bulunamadı.')
        if a.kind=='request':require_staff(db,room,user);reject_ghost(db,user)
        elif a.user_id!=user.id:raise HTTPException(403,'Bu davet size ait değil.')
        if a.status!='pending':raise HTTPException(409,'Talep zaten sonuçlandı.')
        if utc(a.expires_at)<=now():raise HTTPException(409,'Talebin süresi doldu.')
        if a.kind=='request' and not enabled(db,room.id):raise HTTPException(409,'Koltuk izni kapatıldı.')
        if a.kind=='invite' and not staff(db,room,a.sender_id):raise HTTPException(403,'Daveti gönderen hesabın oda yetkisi kaldırıldı.')
        target=db.get(User,a.user_id);require_guest(db,room,target)
        if payload.accept:
            result=assign(db,room,target,a.seat_number);a.status='accepted'
        else:
            a.status='rejected';result={'rejected':True}
            recipient=a.user_id if a.kind=='request' else a.sender_id
            text='Koltuğa oturma talebiniz reddedilmiştir.' if a.kind=='request' else target.nickname+' adlı kullanıcı mikrofon davetinizi reddetti.'
            db.add(SeatNotice(room_id=room.id,user_id=recipient,text=text))
        db.commit();return result

    @router.post('/{room_id}/seat-notices/{notice_id}/seen')
    def seen(room_id:str,notice_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
        room=room_for(db,room_id);n=db.get(SeatNotice,notice_id)
        if not n or n.room_id!=room.id or n.user_id!=user.id:raise HTTPException(404,'Bildirim bulunamadı.')
        n.seen=True;db.commit();return {'seen':True}
