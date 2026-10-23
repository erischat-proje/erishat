"""API and persistence regression tests for existing and new message groups."""
import ast
import os
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
import pytest
from fastapi import FastAPI, Header, Depends, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, event, func
from sqlalchemy.orm import Session

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
os.environ.setdefault('DATABASE_URL','sqlite://')
from app.db import Base, get_db
from app.models import User, Conversation, ConversationMember, Message
from app.admin_models import AdminRole
from app.platform_models import Notification, UserBlock, MessageHidden, PinnedMessage
from app.group_models import MessageGroup, GroupRole, GroupInvitation, GroupSettings, GroupControl, GroupAudit
from app import group_routes as groups, group_policy as policy, message_pins
from app.platform_models import ConversationFolder, ConversationVaultSession, PrivateMessageRequest, Family, FamilyMember, MessageMedia
from app.message_attachment_models import MessageAttachment

app=FastAPI()
def auth(db=Depends(get_db),authorization: str|None=Header(None),request=None):
    uid=(authorization or '').removeprefix('Bearer ')
    user=db.get(User,uid)
    if not user:raise HTTPException(401,'Oturum gerekli')
    return user
# Match the actual three-argument authentication callback.
def route_auth(db,authorization,request):
    return auth(db,authorization)
groups.register_auth(route_auth)
app.include_router(groups.router)

# Exercise production message deletion/pin handlers without importing unrelated startup code.
from app.repositories import ConversationRepository
from app.models import Message
class Manager:
    async def send_user(self,*args,**kwargs):pass
ns=dict(Session=Session,Depends=Depends,get_db=get_db,User=User,Header=Header,
        current_user=auth,ConversationRepository=ConversationRepository,HTTPException=HTTPException,
        require_unlocked=lambda *a:None,select=select,func=func,Message=Message,
        MessageHidden=MessageHidden,PinnedMessage=PinnedMessage,MessageGroup=MessageGroup,
        group_policy=policy,manager=Manager(),message_pins=message_pins)
tree=ast.parse((ROOT/'backend/app/main.py').read_text())
for name,method,path in [('hide_messages','POST','/v1/messages/{conversation_id}/delete'),('pin_message','POST','/v1/conversations/{conversation_id}/pins/{message_id}'),('unpin_message','DELETE','/v1/conversations/{conversation_id}/pins/{message_id}')]:
    node=next(n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name)
    node.decorator_list=[]
    exec(compile(ast.Module(body=[node],type_ignores=[]),str(ROOT/'backend/app/main.py'),'exec'),ns)
    app.add_api_route(path,ns[name],methods=[method])

@pytest.fixture
def env(tmp_path,monkeypatch):
    engine=create_engine('sqlite:///'+str(tmp_path/'groups.db'),connect_args={'check_same_thread':False})
    @event.listens_for(engine,'connect')
    def fk(conn,_):conn.execute('PRAGMA foreign_keys=ON')
    classes=[ConversationFolder,ConversationVaultSession,PrivateMessageRequest,Family,FamilyMember,MessageMedia,MessageAttachment,User,Conversation,ConversationMember,Message,AdminRole,Notification,UserBlock,MessageHidden,PinnedMessage,MessageGroup,GroupRole,GroupInvitation,GroupSettings,GroupControl,GroupAudit]
    tables=[c.__table__ for c in classes]
    Base.metadata.create_all(engine,tables=tables)
    def session():
        with Session(engine,expire_on_commit=False,autoflush=False) as db:yield db
    app.dependency_overrides[get_db]=session
    # Platform moderation has separate tests. These tests isolate group permissions.
    monkeypatch.setattr(groups,'require_feature',lambda *a:None)
    monkeypatch.setattr(message_pins,'_write_access',lambda *a:None)
    monkeypatch.setattr(message_pins,'_notify',Manager().send_user)
    with Session(engine) as db:
        for i,uid in enumerate(['owner','admin','member','other','outside']):
            db.add(User(id=uid,public_id=str(1000000000+i),_nickname=uid,_avatar='x',is_active=True,lidya=3000))
        db.add(Conversation(id='grp_test',type='group'));db.flush()
        db.add(MessageGroup(conversation_id='grp_test',owner_id='owner',request_key='existing_request_123',name='Test grubu',description='Eski grup'))
        db.flush()
        for uid,r in [('owner','owner'),('admin','moderator'),('member','member'),('other','member')]:
            db.add(ConversationMember(conversation_id='grp_test',user_id=uid))
            db.add(GroupRole(conversation_id='grp_test',user_id=uid,role=r))
        db.commit()
    with TestClient(app) as client:yield client,engine
    app.dependency_overrides.clear()

def req(env,who,method,path='',**kw):
    return env[0].request(method,'/v1/message-groups'+path,headers={'Authorization':'Bearer '+who},**kw)

def dbrow(env,cls,key):
    with Session(env[1]) as db:return db.get(cls,key)

@pytest.mark.parametrize('uid,code',[('owner',200),('admin',200),('member',200),('outside',403)])
def test_legacy_access_defaults(env,uid,code):
    r=req(env,uid,'GET','/grp_test');assert r.status_code==code,r.text
    if code==200:
        assert r.json()['closed'] is False
        assert r.json()['members_can_invite'] is False
    assert dbrow(env,GroupSettings,'grp_test') is None

@pytest.mark.parametrize('uid,body,code',[
 ('owner',{'admins_only':True},200),('admin',{'name':'Yeni Ad'},200),
 ('admin',{'admins_only':True},403),('member',{'name':'Yeni Ad'},403),
 ('owner',{'slow_seconds':3601},422),('owner',{'name':'  '},422),
 ('owner',{'admins_only':'false'},422),('owner',{'closed':True},422),('owner',{'name':None},422)])
def test_settings_permissions_and_validation(env,uid,body,code):
    r=req(env,uid,'PATCH','/grp_test',json=body);assert r.status_code==code,r.text

def test_owner_can_restrict_admin_info(env):
    assert req(env,'owner','PATCH','/grp_test',json={'admins_edit_info':False}).status_code==200
    assert req(env,'admin','PATCH','/grp_test',json={'description':'x'}).status_code==403
    assert req(env,'admin','DELETE','/grp_test/image').status_code==403

def test_transfer_and_leave(env):
    assert req(env,'admin','POST','/grp_test/transfer',json={'user_id':'member'}).status_code==403
    assert req(env,'owner','POST','/grp_test/transfer',json={'user_id':'outside'}).status_code==403
    assert req(env,'owner','POST','/grp_test/transfer',json={'user_id':'member'}).status_code==200
    assert dbrow(env,MessageGroup,'grp_test').owner_id=='member'
    assert req(env,'owner','POST','/grp_test/close').status_code==403
    assert req(env,'owner','DELETE','/grp_test/members/owner').status_code==200
    assert req(env,'member','DELETE','/grp_test/members/member').status_code==403
    assert req(env,'member','GET','/grp_test').json()['my_role']=='owner'

@pytest.mark.parametrize('uid,target,code',[('member','other',403),('admin','owner',403),('admin','member',200),('owner','admin',200)])
def test_member_removal_permissions(env,uid,target,code):
    r=req(env,uid,'DELETE','/grp_test/members/'+target);assert r.status_code==code,r.text
    if code==200:assert req(env,target,'GET','/grp_test/members').status_code==403

def test_invite_by_public_id_revoke_and_response(env):
    assert req(env,'member','POST','/grp_test/invitations',json={'user_id':'1000000004'}).status_code==403
    assert req(env,'admin','POST','/grp_test/invitations',json={'user_id':'1000000004'}).status_code==201
    assert req(env,'admin','GET','/grp_test/invitations').json()[0]['user_id']=='outside'
    assert req(env,'outside','GET','/invitations/mine').json()[0]['conversation_id']=='grp_test'
    assert req(env,'member','DELETE','/grp_test/invitations/outside').status_code==403
    assert req(env,'admin','DELETE','/grp_test/invitations/outside').status_code==200
    assert req(env,'outside','POST','/grp_test/invitations/respond',json={'action':'accept'}).status_code==404
    assert req(env,'owner','PATCH','/grp_test',json={'members_can_invite':True}).status_code==200
    assert req(env,'member','POST','/grp_test/invitations',json={'user_id':'outside'}).status_code==201
    assert req(env,'outside','POST','/grp_test/invitations/respond',json={'action':'accept'}).status_code==200
    assert req(env,'outside','POST','/grp_test/invitations/respond',json={'action':'accept'}).status_code==404
    assert req(env,'outside','GET','/grp_test').status_code==200

def test_ban_unban_and_rejoin(env):
    assert req(env,'admin','POST','/grp_test/members/owner/control',json={'action':'ban'}).status_code==403
    assert req(env,'owner','POST','/grp_test/members/admin/control',json={'action':'ban'}).status_code==200
    assert req(env,'admin','GET','/grp_test').status_code==403
    assert req(env,'owner','POST','/grp_test/invitations',json={'user_id':'admin'}).status_code==403
    assert req(env,'owner','GET','/grp_test/bans').json()[0]['user_id']=='admin'
    assert req(env,'owner','POST','/grp_test/members/admin/control',json={'action':'unban'}).status_code==200
    assert req(env,'admin','GET','/grp_test').status_code==403
    assert req(env,'owner','POST','/grp_test/invitations',json={'user_id':'admin'}).status_code==201
    assert req(env,'admin','POST','/grp_test/invitations/respond',json={'action':'accept'}).status_code==200
    assert req(env,'admin','GET','/grp_test').json()['my_role']=='member'

def test_pending_invites_revoked_on_departure(env):
    req(env,'admin','POST','/grp_test/invitations',json={'user_id':'outside'})
    assert req(env,'admin','DELETE','/grp_test/members/admin').status_code==200
    assert dbrow(env,GroupInvitation,('grp_test','outside')).status=='revoked'

@pytest.mark.parametrize('feature',['admins_only','slow_seconds','mute','closed','removed'])
def test_write_policy_is_persistent_and_admin_exemptions(env,feature):
    if feature=='admins_only':req(env,'owner','PATCH','/grp_test',json={'admins_only':True})
    elif feature=='slow_seconds':
        req(env,'owner','PATCH','/grp_test',json={'slow_seconds':60})
        with Session(env[1]) as db:policy.require_write(db,'grp_test','member');db.commit()
    elif feature=='mute':req(env,'admin','POST','/grp_test/members/member/control',json={'action':'mute','minutes':15})
    elif feature=='closed':req(env,'owner','POST','/grp_test/close')
    else:req(env,'admin','DELETE','/grp_test/members/member')
    with Session(env[1]) as db:
        with pytest.raises(HTTPException) as err:policy.require_write(db,'grp_test','member')
        assert err.value.status_code in (403,409,429)
        db.rollback()
        if feature!='closed':policy.require_write(db,'grp_test','owner')

def test_mute_expiry_and_unmute(env):
    assert req(env,'admin','POST','/grp_test/members/member/control',json={'action':'mute','minutes':0}).status_code==422
    req(env,'admin','POST','/grp_test/members/member/control',json={'action':'mute','minutes':60})
    assert next(m for m in req(env,'member','GET','/grp_test/members').json() if m['user_id']=='member')['muted_until']
    assert req(env,'admin','POST','/grp_test/members/member/control',json={'action':'unmute'}).status_code==200
    with Session(env[1]) as db:policy.require_write(db,'grp_test','member');db.commit()
    with Session(env[1]) as db:
        db.get(GroupControl,('grp_test','member')).muted_until=datetime.now(timezone.utc)-timedelta(seconds=1);db.commit()
        policy.require_write(db,'grp_test','member')

def test_close_preserves_history_blocks_mutations_and_cancels_invites(env):
    req(env,'owner','POST','/grp_test/invitations',json={'user_id':'outside'})
    assert req(env,'admin','POST','/grp_test/close').status_code==403
    assert req(env,'owner','POST','/grp_test/close').status_code==200
    assert req(env,'owner','POST','/grp_test/close').status_code==200
    assert req(env,'member','GET','/grp_test').json()['closed'] is True
    assert req(env,'owner','PATCH','/grp_test',json={'name':'Yeni'}).status_code==409
    assert req(env,'outside','POST','/grp_test/invitations/respond',json={'action':'accept'}).status_code==409
    assert req(env,'owner','PUT','/grp_test/members/member/role',json={'role':'moderator'}).status_code==409
    assert req(env,'member','DELETE','/grp_test/members/member').status_code==200
    assert req(env,'outside','GET','/invitations/mine').json()==[]

def test_audit_private_paginated(env):
    for i in range(52):req(env,'owner','PATCH','/grp_test',json={'description':str(i)})
    assert req(env,'member','GET','/grp_test/audit').status_code==403
    rows=req(env,'admin','GET','/grp_test/audit').json();assert len(rows)==50
    previous=req(env,'admin','GET','/grp_test/audit?before='+str(rows[-1]['id'])).json()
    assert len(previous)==2
    assert {r['id'] for r in rows}.isdisjoint({r['id'] for r in previous})
    assert rows[0]['actor_name']=='owner'

@pytest.mark.parametrize('who,all_messages,code',[('member',True,403),('member',False,403),('admin',True,200),('admin',False,200)])
def test_everyone_delete_authorization(env,who,all_messages,code):
    with Session(env[1]) as db:
        m=Message(conversation_id='grp_test',sender_id='other',text='Korunan mesaj');db.add(m);db.commit();mid=m.id
    r=env[0].post('/v1/messages/grp_test/delete',json={'scope':'everyone','all':all_messages,'message_ids':[mid]},headers={'Authorization':'Bearer '+who})
    assert r.status_code==code,r.text
    assert (dbrow(env,Message,mid) is None)==(code==200)

def test_pin_permissions(env):
    with Session(env[1]) as db:
        m=Message(conversation_id='grp_test',sender_id='other',text='Duyuru');db.add(m);db.commit();mid=m.id
    url='/v1/conversations/grp_test/pins/'+str(mid)
    assert env[0].post(url,headers={'Authorization':'Bearer member'}).status_code==403
    assert env[0].post(url,headers={'Authorization':'Bearer admin'}).status_code==200
    assert env[0].delete(url,headers={'Authorization':'Bearer member'}).status_code==403
    assert env[0].delete(url,headers={'Authorization':'Bearer owner'}).status_code==200

def test_image_validation_and_storage(env):
    from PIL import Image
    from io import BytesIO
    buf=BytesIO();Image.new('RGB',(700,400),'gold').save(buf,'PNG')
    assert req(env,'member','PUT','/grp_test/image',files={'image':('a.png',buf.getvalue(),'image/png')}).status_code==403
    assert req(env,'admin','PUT','/grp_test/image',files={'image':('a.png',buf.getvalue(),'image/png')}).status_code==200
    image=req(env,'member','GET','/grp_test/image');assert image.status_code==200
    assert Image.open(BytesIO(image.content)).size==(512,293)
    assert req(env,'outside','GET','/grp_test/image').status_code==403
    assert req(env,'owner','PUT','/grp_test/image',files={'image':('a.png',b'bad','image/png')}).status_code==415
    assert req(env,'owner','DELETE','/grp_test/image').status_code==200
    assert req(env,'member','GET','/grp_test/image').status_code==404

def test_main_text_and_media_use_policy_after_upload():
    text=next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='create_message')
    media=next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='send_message_media')
    assert 'group_policy.require_write(db, conversation_id, user.id)' in ast.unparse(text)
    code=ast.unparse(media)
    assert code.index('await file.read')<code.index('group_policy.require_write')<code.index('db.add(message)')

def test_message_search_scoped_hidden_and_pagination(env,monkeypatch):
    from app import dm_folders
    monkeypatch.setattr(dm_folders,'require_unlocked',lambda *args:None)
    with Session(env[1]) as db:
        db.add(Conversation(id='private',type='dm'));db.flush()
        db.add(Message(conversation_id='private',sender_id='owner',text='aranan gizli'))
        hidden=Message(conversation_id='grp_test',sender_id='owner',text='aranan gizlenmiş')
        expired=Message(conversation_id='grp_test',sender_id='owner',text='aranan süresi dolmuş',expires_at=datetime.now(timezone.utc)-timedelta(days=1))
        db.add_all([hidden,expired]);db.flush();db.add(MessageHidden(message_id=hidden.id,user_id='member'))
        for i in range(52):db.add(Message(conversation_id='grp_test',sender_id='other',text='aranan mesaj '+str(i)))
        db.commit()
    assert req(env,'outside','GET','/grp_test/search?q=aranan').status_code==403
    assert req(env,'member','GET','/grp_test/search?q=a').status_code==422
    rows=req(env,'member','GET','/grp_test/search?q=aranan').json();assert len(rows)==50
    previous=req(env,'member','GET','/grp_test/search?q=aranan&before='+str(rows[-1]['id'])).json();assert len(previous)==2
    assert all(r['sender_nickname']=='other' for r in rows+previous)
    assert req(env,'member','GET','/grp_test/search?q=%25%25').json()==[]

def test_create_paid_group_once_and_defaults(env):
    data={'name':'Yeni Grup','description':'Açıklama','request_key':'new_group_create_key_123'}
    response=req(env,'outside','POST','',data=data);assert response.status_code==201,response.text
    cid=response.json()['conversation_id']
    second=req(env,'outside','POST','',data=data);assert second.json()['already_processed'] is True
    assert dbrow(env,User,'outside').lidya==2000
    assert req(env,'outside','GET','/'+cid).json()['my_role']=='owner'
    assert req(env,'outside','GET','/'+cid).json()['closed'] is False
    assert req(env,'member','POST','',data=data).status_code==409

def test_invitation_full_group_atomic(env):
    req(env,'owner','POST','/grp_test/invitations',json={'user_id':'outside'})
    with Session(env[1]) as db:
        for i in range(46):
            uid='extra'+str(i);db.add(User(id=uid,public_id=str(2000000000+i),_nickname=uid,_avatar='x',is_active=True,lidya=0));db.flush();db.add(ConversationMember(conversation_id='grp_test',user_id=uid))
        db.commit()
    assert req(env,'outside','POST','/grp_test/invitations/respond',json={'action':'accept'}).status_code==409
    assert dbrow(env,GroupInvitation,('grp_test','outside')).status=='pending'
    assert req(env,'outside','GET','/grp_test').status_code==403
