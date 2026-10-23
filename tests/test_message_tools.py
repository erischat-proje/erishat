"""Behavior tests for text replies, edits, protected history and search."""
import os,sys
from pathlib import Path
from datetime import datetime,timedelta,timezone
import pytest
from sqlalchemy import create_engine,select,event
from sqlalchemy.orm import Session
from fastapi import FastAPI,HTTPException,Depends,Header
from fastapi.testclient import TestClient
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'));os.environ.setdefault('DATABASE_URL','sqlite://')
from app.db import Base,get_db
from app.models import User,Conversation,ConversationMember,Message
from app.admin_models import AdminRole
from app.message_detail_models import MessageDetail
from app.platform_models import (MessageHidden,MessageMedia,DirectMessageGift,UserBlock,PrivateMessageRequest,ConversationFolder,ConversationVault,ConversationVaultSession,ConversationReadState,ConversationInboxPreference,Family,DirectMessageRestriction,DirectMessageUnlock,Notification)
from app.group_models import MessageGroup,GroupRole,GroupSettings,GroupControl,GroupAudit
from app import message_tools as mt
from app.notification_policy import ConversationMuteExpiry
from app.platform_models import ConversationMute
from app import performance_queries
from app.schemas import MessageOut,MessageCreate
app=FastAPI();events=[]
def auth(db,authorization,request):
 u=db.get(User,(authorization or '').removeprefix('Bearer '))
 if not u:raise HTTPException(401,'Oturum gerekli')
 return u

def serialize(db,m,uid,context=None):
 context=context if context is not None else {'details':mt.extras(db,[m],uid)}
 return {'id':m.id,'conversation_id':m.conversation_id,'sender_id':m.sender_id,'text':m.text,'created_at':m.created_at,**context.get('details',{}).get(m.id,{})}
async def notify(db,uid,event):events.append((uid,event))
mt.register(auth,serialize,notify);app.include_router(mt.router)
@pytest.fixture
def env(tmp_path,monkeypatch):
 engine=create_engine('sqlite:///'+str(tmp_path/'chat.db'),connect_args={'check_same_thread':False})
 @event.listens_for(engine,'connect')
 def fk(conn,_):conn.execute('PRAGMA foreign_keys=ON')
 classes=[ConversationMute,ConversationMuteExpiry,ConversationInboxPreference,Family,DirectMessageRestriction,DirectMessageUnlock,Notification,User,Conversation,ConversationMember,Message,AdminRole,MessageDetail,MessageHidden,MessageMedia,DirectMessageGift,UserBlock,PrivateMessageRequest,ConversationFolder,ConversationVault,ConversationVaultSession,ConversationReadState,MessageGroup,GroupRole,GroupSettings,GroupControl,GroupAudit]
 Base.metadata.create_all(engine,tables=[c.__table__ for c in classes])
 def session():
  with Session(engine,expire_on_commit=False,autoflush=False) as db:yield db
 app.dependency_overrides[get_db]=session;events.clear()
 monkeypatch.setattr(mt,'require_feature',lambda *a:None)
 monkeypatch.setattr(performance_queries,'message_context',lambda db,rows,uid:{'details':mt.extras(db,rows,uid)})
 with Session(engine) as db:
  db.add_all([User(id=u,public_id=str(1000000000+i),_nickname=u,_avatar='x',is_active=True) for i,u in enumerate(['a','b','outside'])]);db.flush()
  db.add_all([Conversation(id='dm',type='dm'),Conversation(id='private',type='dm'),Conversation(id='grp',type='group'),Conversation(id='system',type='welcome')]);db.flush()
  for cid in ['dm','grp','system']:
   for uid in ['a','b']:db.add(ConversationMember(conversation_id=cid,user_id=uid))
  db.add(ConversationMember(conversation_id='private',user_id='outside'))
  db.add(MessageGroup(conversation_id='grp',owner_id='a',name='Grup',description='',request_key='test_group_request'));db.flush()
  db.add_all([GroupRole(conversation_id='grp',user_id='a',role='owner'),GroupRole(conversation_id='grp',user_id='b',role='member')]);db.commit()
 with TestClient(app) as client:yield client,engine
 app.dependency_overrides.clear()
def call(env,uid,method,path,**kw):return env[0].request(method,'/v1/message-tools'+path,headers={'Authorization':'Bearer '+uid},**kw)
def add(env,text='İlk metin',sender='a',cid='dm',age=0):
 with Session(env[1],expire_on_commit=False) as db:
  m=Message(conversation_id=cid,sender_id=sender,text=text,created_at=datetime.now(timezone.utc)-timedelta(minutes=age));db.add(m);db.commit();return m.id

def edit(env,mid,uid='a',text='Düzenlenmiş',expected='İlk metin',cid='dm'):
 return call(env,uid,'PATCH',f'/{cid}/{mid}',json={'text':text,'expected_text':expected})

@pytest.mark.parametrize('uid,code',[('a',200),('b',200),('outside',403)])
def test_history_member_authorization(env,uid,code):
 add(env);r=call(env,uid,'GET','/dm/history');assert r.status_code==code,r.text

def test_history_pagination_filters_hidden_and_expired_before_limit(env):
 ids=[add(env,str(i),sender='b') for i in range(57)]
 with Session(env[1]) as db:
  for mid in ids[-3:]:db.add(MessageHidden(message_id=mid,user_id='a'))
  db.get(Message,ids[-4]).expires_at=datetime.now(timezone.utc)-timedelta(seconds=1);db.commit()
 page=call(env,'a','GET','/dm/history').json();assert len(page['messages'])==50 and page['has_more']
 next_page=call(env,'a','GET','/dm/history?before='+str(page['next_before'])).json();assert len(next_page['messages'])==3 and not next_page['has_more']
 combined=next_page['messages']+page['messages'];assert [m['id'] for m in combined]==ids[:-4]
 # History reads acknowledge the greatest visible incoming ID, and older pages never reduce it.
 with Session(env[1]) as db:assert db.scalar(select(ConversationReadState.last_read_message_id).where(ConversationReadState.user_id=='a'))==ids[-5]
 assert any(e['type']=='dm_read' and uid=='b' for uid,e in events)

def test_search_scoped_paginated_and_literal_wildcards(env):
 for i in range(53):add(env,'aranan '+str(i))
 add(env,'aranan gizli',cid='private',sender='outside')
 page=call(env,'a','GET','/dm/search?q=aranan').json();assert len(page['messages'])==50 and page['has_more']
 older=call(env,'a','GET','/dm/search?q=aranan&before='+str(page['next_before'])).json();assert len(older['messages'])==3
 assert call(env,'a','GET','/dm/search?q=%25%25').json()['messages']==[]
 assert call(env,'a','GET','/dm/search?q=%20%20').status_code==422
 assert call(env,'outside','GET','/dm/search?q=aranan').status_code==403

def test_context_jump_and_invalid_cursors(env):
 ids=[add(env,str(i)) for i in range(65)]
 p=call(env,'a','GET','/dm/history?around='+str(ids[52])).json();assert p['messages'][-1]['id']==ids[52];assert len(p['messages'])==50
 assert call(env,'a','GET','/dm/history?around=99999').status_code==404
 assert call(env,'a','GET','/dm/history?before=1&around=2').status_code==422
 assert call(env,'a','GET','/dm/history?before=-1').status_code==422

@pytest.mark.parametrize('operation',['history','search?q=ilk','1'])
def test_locked_conversations_reject_tools_without_vault(env,operation):
 add(env)
 with Session(env[1]) as db:db.add(ConversationFolder(user_id='a',conversation_id='dm',locked=True,archived=False));db.commit()
 method='PATCH' if operation=='1' else 'GET';kwargs={'json':{'text':'Yeni','expected_text':'İlk metin'}} if method=='PATCH' else {}
 assert call(env,'a',method,'/dm/'+operation,**kwargs).status_code==403

def test_reply_metadata_atomic_and_schema(env):
 original=add(env,sender='b')
 with Session(env[1],expire_on_commit=False) as db:
  message=mt.create_text(db,'dm','a','Yanıt',original)
  meta=mt.extras(db,[message],'a')[message.id]
  assert meta['reply_to_id']==original and meta['reply']['text']=='İlk metin' and meta['reply']['sender_name']=='b'
  assert MessageOut.model_validate(serialize(db,message,'a')).reply_to_id==original
  assert MessageCreate.model_validate({'text':'Yeni','reply_to_id':original}).reply_to_id==original
  assert db.get(MessageDetail,message.id).has_reply

@pytest.mark.parametrize('inaccessible',['cross','hidden','expired','deleted'])
def test_cannot_reply_to_inaccessible_message(env,inaccessible):
 original=add(env,cid='private' if inaccessible=='cross' else 'dm',sender='outside' if inaccessible=='cross' else 'b')
 with Session(env[1]) as db:
  if inaccessible=='hidden':db.add(MessageHidden(message_id=original,user_id='a'))
  if inaccessible=='expired':db.get(Message,original).expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)
  if inaccessible=='deleted':db.delete(db.get(Message,original))
  db.commit();before=len(list(db.scalars(select(Message))))
  with pytest.raises(HTTPException):mt.create_text(db,'dm','a','Sızmamalı',original)
  db.rollback();assert len(list(db.scalars(select(Message))))==before

@pytest.mark.parametrize('action',['delete','hide','expire','temporary_expire'])
def test_quote_never_retains_deleted_hidden_or_expired_text(env,action):
 original=add(env,'Özel alıntı',sender='b')
 with Session(env[1],expire_on_commit=False) as db:
  reply=mt.create_text(db,'dm','a','Yanıt',original)
  if action=='delete':db.delete(db.get(Message,original))
  elif action=='hide':db.add(MessageHidden(message_id=original,user_id='a'))
  elif action=='expire':db.get(Message,original).expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)
  else:db.add(MessageMedia(message_id=original,media_type='image',mime_type='image/jpeg',data=b'photo',temporary=True,view_seconds=10,expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)))
  db.commit();db.expire_all();meta=mt.extras(db,[db.get(Message,reply.id)],'a')[reply.id]
  assert meta['reply']['unavailable'] and meta['reply_to_id'] is None and 'Özel' not in str(meta)

@pytest.mark.parametrize('uid,age,cid,code',[('a',0,'dm',200),('b',0,'dm',403),('outside',0,'dm',403),('a',16,'dm',403),('a',0,'system',403)])
def test_edit_permissions_and_window(env,uid,age,cid,code):
 mid=add(env,age=age,cid=cid);r=edit(env,mid,uid=uid,cid=cid);assert r.status_code==code,r.text
 if code==200:
  assert r.json()['edited_at'] and r.json()['text']=='Düzenlenmiş'
  assert {uid for uid,e in events if e['type']=='dm_message_updated'}=={'a','b'}
  assert all('text' not in e for uid,e in events)

def test_edit_preserves_reply_and_optimistic_conflict(env):
 original=add(env,sender='b')
 with Session(env[1],expire_on_commit=False) as db:reply=mt.create_text(db,'dm','a','İlk metin',original);mid=reply.id
 assert edit(env,mid).json()['reply_to_id']==original
 assert edit(env,mid,text='Üzerine yazılmasın').status_code==409
 assert edit(env,mid,text='Son hali',expected='Düzenlenmiş').status_code==200

def test_group_closed_muted_and_admin_only_rules_for_edits(env):
 mid=add(env,sender='b',cid='grp')
 with Session(env[1]) as db:db.add(GroupSettings(conversation_id='grp',closed=False,admins_only=True,members_can_invite=False,admins_edit_info=True,slow_seconds=60));db.commit()
 assert edit(env,mid,uid='b',cid='grp').status_code==403
 with Session(env[1]) as db:
  db.get(GroupSettings,'grp').admins_only=False
  db.add(GroupControl(conversation_id='grp',user_id='b',banned=False,last_sent_at=datetime.now(timezone.utc)));db.commit()
 # Slow mode limits new messages, not text corrections.
 assert edit(env,mid,uid='b',cid='grp').status_code==200
 with Session(env[1]) as db:db.get(GroupControl,('grp','b')).muted_until=datetime.now(timezone.utc)+timedelta(hours=1);db.commit()
 assert edit(env,mid,uid='b',expected='Düzenlenmiş',cid='grp').status_code==403
 with Session(env[1]) as db:db.get(GroupSettings,'grp').closed=True;db.commit()
 assert edit(env,mid,uid='b',expected='Düzenlenmiş',cid='grp').status_code==409

@pytest.mark.parametrize('kind',['media','gift','block','pending','hidden','platform_ban'])
def test_edit_respects_nontext_and_privacy_restrictions(env,kind,monkeypatch):
 mid=add(env)
 with Session(env[1]) as db:
  if kind=='media':db.add(MessageMedia(message_id=mid,media_type='voice',mime_type='audio/ogg',data=b'audio',temporary=False))
  if kind=='gift':db.add(DirectMessageGift(message_id=mid,sender_id='a',recipient_id='b',gift_key='gift',unit_price=100,recipient_amount=50))
  if kind=='block':db.add(UserBlock(blocker_id='b',blocked_id='a'))
  if kind=='pending':db.add(PrivateMessageRequest(sender_id='a',recipient_id='b',conversation_id='dm',status='pending'))
  if kind=='hidden':db.add(MessageHidden(message_id=mid,user_id='a'))
  db.commit()
 if kind=='platform_ban':
  def deny(*args):raise HTTPException(403,'Yasaklı')
  monkeypatch.setattr(mt,'require_feature',deny)
 assert edit(env,mid).status_code in (403,404)

def test_ephemeral_reply_is_expiring_and_bad_edit_input_rejected(env):
 original=add(env,sender='b')
 with Session(env[1],expire_on_commit=False) as db:
  db.get(Conversation,'dm').is_ephemeral=True;db.commit();m=mt.create_text(db,'dm','a','Geçici yanıt',original);assert m.expires_at is not None
 assert edit(env,original,uid='b',text='  ').status_code==422

# Use the production POST handler and output serializer to cover atomic reply integration.
import ast
from app.repositories import ConversationRepository
from app import group_policy

def test_current_user(db: Session=Depends(get_db),authorization: str|None=Header(None)):
 return auth(db,authorization,None)
test_current_user.__test__=False

def production_context(db,messages,uid):
 return {'details':mt.extras(db,messages,uid),'senders':{},'pinned':set(),'gifts':{},'media':{},'read':0}
main_ns=dict(Session=Session,Message=Message,MessageCreate=MessageCreate,MessageOut=MessageOut,
    Header=Header,Depends=Depends,get_db=get_db,User=User,current_user=test_current_user,
    ConversationRepository=ConversationRepository,HTTPException=HTTPException,group_policy=group_policy,
    MessageGroup=MessageGroup,Family=Family,DirectMessageRestriction=DirectMessageRestriction,
    DirectMessageUnlock=DirectMessageUnlock,UserBlock=UserBlock,select=select,Notification=Notification,
    message_tools=mt,message_context=production_context,GIFT_META={},GIFT_CATALOG={},
    require_unlocked=mt.require_unlocked,require_feature=lambda *a:None,
    _dm_request_gate=lambda *a,**kw:False,_message_notifications_allowed=lambda *a:False,
    _folder=lambda *a:None,_send_dm_event=notify)
main_tree=ast.parse((ROOT/'backend/app/main.py').read_text())
for name in ['_message_out','create_message']:
 node=next(n for n in main_tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name);node.decorator_list=[]
 exec(compile(ast.Module(body=[node],type_ignores=[]),'production-main-message-handler','exec'),main_ns)
app.add_api_route('/v1/messages/{conversation_id}',main_ns['create_message'],methods=['POST'],response_model=MessageOut)

@pytest.mark.parametrize('cid',['dm','grp'])
def test_production_send_reply_endpoint_returns_metadata(env,cid):
 original=add(env,sender='b',cid=cid)
 r=env[0].post('/v1/messages/'+cid,json={'text':'Yanıt metni','reply_to_id':original},headers={'Authorization':'Bearer a'})
 assert r.status_code==200,r.text
 assert r.json()['reply_to_id']==original and r.json()['reply']['text']=='İlk metin'
 with Session(env[1]) as db:assert db.get(MessageDetail,r.json()['id']).reply_to_id==original

@pytest.mark.parametrize('kind',['cross','hidden','closed','no_membership'])
def test_production_send_reply_rejects_unauthorized_context(env,kind):
 original=add(env,sender='b',cid='dm')
 with Session(env[1]) as db:
  if kind=='hidden':db.add(MessageHidden(message_id=original,user_id='a'))
  if kind=='closed':db.add(GroupSettings(conversation_id='grp',closed=True))
  db.commit();before=len(list(db.scalars(select(Message))))
 cid='grp' if kind in ('cross','closed') else 'dm'
 uid='outside' if kind=='no_membership' else 'a'
 r=env[0].post('/v1/messages/'+cid,json={'text':'Sızmamalı','reply_to_id':original},headers={'Authorization':'Bearer '+uid})
 assert r.status_code in (403,404,409),r.text
 with Session(env[1]) as db:assert len(list(db.scalars(select(Message))))==before
