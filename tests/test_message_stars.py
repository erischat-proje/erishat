"""Private bookmark routes: real queries, permissions, pagination, no content copies."""
from datetime import datetime,timedelta,timezone
import hashlib
import pytest
from sqlalchemy import select,delete,event
from sqlalchemy.orm import Session
from test_message_tools import env as base_env,add,app,events
from app import message_stars as ms
from app.models import Message,Conversation,ConversationMember
from app.platform_models import (MessageHidden,ConversationFolder,ConversationVaultSession,
 MessageMedia,ConversationReadState,Family,FamilyMember,PrivateMessageRequest)
from app.message_attachment_models import MessageAttachment
from app.group_models import GroupSettings
app.include_router(ms.router)

@pytest.fixture
def env(base_env):
 client,engine=base_env
 for cls in [ms.MessageStar,MessageAttachment]:cls.__table__.create(engine,checkfirst=True)
 return client,engine

def set_star(env,mid,starred=True,uid='a',cid='dm',token=None):
 headers={'Authorization':'Bearer '+uid}
 if token:headers['X-Eris-DM-Vault']=token
 return env[0].put(f'/v1/message-stars/{cid}/{mid}',json={'starred':starred},headers=headers)
def listing(env,uid='a',query='',token=None):
 headers={'Authorization':'Bearer '+uid}
 if token:headers['X-Eris-DM-Vault']=token
 return env[0].get('/v1/message-stars'+('?' + query if query else ''),headers=headers)

def test_save_is_private_idempotent_and_not_a_group_pin(env):
 mid=add(env,sender='b');assert set_star(env,mid).json()=={'is_starred':True};assert set_star(env,mid).status_code==200
 own=listing(env).json()['items'];assert len(own)==1 and own[0]['message']['id']==mid and own[0]['conversation']['name']=='b'
 assert listing(env,uid='b').json()['items']==[] and events==[]
 with Session(env[1]) as db:
  assert len(list(db.scalars(select(ms.MessageStar))))==1
  assert len(list(db.scalars(select(Message))))==1
  assert not list(db.scalars(select(ConversationReadState)))
 assert set_star(env,mid,False).status_code==200 and listing(env).json()['items']==[]
 assert set_star(env,mid,False).status_code==200

@pytest.mark.parametrize('uid,cid,code',[('outside','dm',403),('a','private',403),('a','missing',404)])
def test_membership_and_scope_enforced(env,uid,cid,code):
 mid=add(env);assert set_star(env,mid,uid=uid,cid=cid).status_code==code
 assert listing(env,uid=uid,query='conversation_id='+cid).status_code==code

@pytest.mark.parametrize('reason,code',[('hidden',404),('expired',404),('ttl',403),('temporary',403),('ephemeral',403),('system',403),('other_chat',404)])
def test_protected_sources_cannot_be_saved(env,reason,code):
 mid=add(env)
 with Session(env[1]) as db:
  if reason=='hidden':db.add(MessageHidden(message_id=mid,user_id='a'))
  if reason in ('expired','ttl'):db.get(Message,mid).expires_at=datetime.now(timezone.utc)+timedelta(hours=-1 if reason=='expired' else 1)
  if reason=='temporary':db.add(MessageMedia(message_id=mid,media_type='image',mime_type='image/png',data=b'data',temporary=True))
  if reason=='ephemeral':db.get(Conversation,'dm').is_ephemeral=True
  if reason=='system':db.get(Conversation,'dm').type='welcome'
  db.commit()
 assert set_star(env,mid,cid='grp' if reason=='other_chat' else 'dm').status_code==code
 assert listing(env).json()['items']==[]

@pytest.mark.parametrize('reason',['hidden','expired','revoked','ephemeral','deleted','pending'])
def test_saved_message_disappears_when_access_or_visibility_changes(env,reason):
 mid=add(env);set_star(env,mid)
 with Session(env[1]) as db:
  if reason=='hidden':db.add(MessageHidden(message_id=mid,user_id='a'))
  if reason=='expired':db.get(Message,mid).expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)
  if reason=='revoked':db.execute(delete(ConversationMember).where(ConversationMember.user_id=='a',ConversationMember.conversation_id=='dm'))
  if reason=='ephemeral':db.get(Conversation,'dm').is_ephemeral=True
  if reason=='deleted':db.delete(db.get(Message,mid))
  if reason=='pending':db.add(PrivateMessageRequest(sender_id='b',recipient_id='a',conversation_id='dm',status='pending'))
  db.commit()
 assert listing(env).json()['items']==[]
 if reason=='ephemeral':assert set_star(env,mid,False).status_code==200
 if reason=='deleted':
  with Session(env[1]) as db:assert not list(db.scalars(select(ms.MessageStar)))

@pytest.mark.parametrize('kind',['image','voice','video','document'])
def test_media_filter_search_name_and_no_binary_data_in_list(env,kind):
 mid=add(env,'[Belge]',sender='b')
 with Session(env[1]) as db:
  db.add(MessageMedia(message_id=mid,media_type=kind,mime_type='application/octet-stream',data=b'secret_binary'))
  db.add(MessageAttachment(message_id=mid,filename='rapor_2026.pdf',size_bytes=13));db.commit()
 set_star(env,mid)
 statements=[]
 def observe(conn,cursor,statement,parameters,context,executemany):statements.append(statement.lower())
 event.listen(env[1],'before_cursor_execute',observe)
 try:r=listing(env,query='kind='+kind+'&q=rapor')
 finally:event.remove(env[1],'before_cursor_execute',observe)
 assert r.status_code==200,r.text
 assert all('message_media.data' not in sql for sql in statements)
 assert r.json()['items'][0]['message']['media_name']=='rapor_2026.pdf' and 'secret_binary' not in r.text
 assert listing(env,query='kind=text').json()['items']==[]

@pytest.mark.parametrize('q,count',[('aranan',1),('b',1),('1000000001',1),('%',0),('_',0),('bulunmayan',0)])
def test_search_literal_text_name_and_id(env,q,count):
 mid=add(env,'aranan metin');set_star(env,mid)
 r=listing(env,query='q='+q.replace('%','%25'));assert r.status_code==200,r.text
 assert len(r.json()['items'])==count

def test_stable_save_order_cursor_filters_before_limit(env):
 ids=[add(env,str(i)) for i in range(37)]
 for mid in reversed(ids):set_star(env,mid)
 first=listing(env,query='limit=30').json();assert first['has_more'] and len(first['items'])==30
 assert [x['message']['id'] for x in first['items']]==ids[:30]
 with Session(env[1]) as db:db.add(MessageHidden(message_id=ids[31],user_id='a'));db.commit()
 second=listing(env,query='limit=30&before='+str(first['next_before'])).json()
 assert not second['has_more'] and [x['message']['id'] for x in second['items']]==[x for x in ids[30:] if x!=ids[31]]
 assert set(first['items'][i]['star_id'] for i in range(30)).isdisjoint(x['star_id'] for x in second['items'])

def test_vault_and_archive_boundaries(env):
 mid=add(env);set_star(env,mid)
 with Session(env[1]) as db:
  db.add(ConversationFolder(user_id='a',conversation_id='dm',archived=True,locked=False));db.commit()
 assert len(listing(env).json()['items'])==1
 with Session(env[1]) as db:
  row=db.scalar(select(ConversationFolder));row.locked=True
  db.add(ConversationVaultSession(user_id='a',token_hash=hashlib.sha256(b'secret').hexdigest(),scope='access',expires_at=datetime.now(timezone.utc)+timedelta(minutes=1)));db.commit()
 assert listing(env).json()['items']==[]
 assert listing(env,query='scope=locked').status_code==403
 assert listing(env,query='conversation_id=dm').status_code==403
 assert listing(env,query='scope=locked',token='wrong').status_code==403
 assert len(listing(env,query='scope=locked',token='secret').json()['items'])==1
 assert len(listing(env,query='conversation_id=dm',token='secret').json()['items'])==1
 assert set_star(env,mid,False).status_code==403
 assert set_star(env,mid,False,token='secret').status_code==200

def test_group_bookmark_does_not_require_admin_or_open_group(env):
 mid=add(env,cid='grp',sender='a')
 with Session(env[1]) as db:db.add(GroupSettings(conversation_id='grp',closed=True));db.commit()
 assert set_star(env,mid,uid='b',cid='grp').status_code==200
 r=listing(env,uid='b',query='q=Grup');assert r.status_code==200,r.text
 assert r.json()['items'][0]['conversation']['type']=='group' and r.json()['items'][0]['conversation']['name']=='Grup'

def test_unstar_hidden_message_and_wrong_scope_do_not_leak(env):
 mid=add(env);set_star(env,mid)
 assert set_star(env,mid,False,cid='grp').status_code==200
 assert len(listing(env).json()['items'])==1
 with Session(env[1]) as db:db.add(MessageHidden(message_id=mid,user_id='a'));db.commit()
 assert set_star(env,mid,False).status_code==200
 with Session(env[1]) as db:assert not list(db.scalars(select(ms.MessageStar)))

@pytest.mark.parametrize('query',['kind=unknown','scope=inbox','before=0','limit=51','q='+'a'*101])
def test_list_validation(env,query):assert listing(env,query=query).status_code==422

def test_star_update_schema(env):
 mid=add(env)
 assert set_star(env,mid,'true').status_code==422
 assert env[0].put(f'/v1/message-stars/dm/{mid}',json={'starred':True}).status_code==401

def test_own_star_does_not_leak_through_production_message_serializer(env):
 import ast
 from test_message_tools import main_ns,ROOT,production_context
 from app.schemas import MessageOut
 ns=dict(main_ns)
 node=next(n for n in ast.parse((ROOT/'backend/app/main.py').read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='_message_out')
 node.decorator_list=[];exec(compile(ast.Module(body=[node],type_ignores=[]),'production-star-serializer','exec'),ns)
 mid=add(env);set_star(env,mid)
 with Session(env[1]) as db:
  m=db.get(Message,mid)
  for uid,expected in [('a',True),('b',False)]:
   context=production_context(db,[m],uid);context['starred']=ms.starred_ids(db,[m],uid)
   assert MessageOut(**ns['_message_out'](db,m,uid,context)).is_starred is expected

def test_family_search_and_normalized_conversation_identity(env):
 with Session(env[1]) as db:
  db.add(Conversation(id='family',type='family'));db.flush()
  db.add(Family(id='fam',owner_id='a',name='Ailem',chat_conversation_id='family'))
  db.add(ConversationMember(conversation_id='family',user_id='a'));db.commit()
 mid=add(env,'Aile mesajı',cid='family');assert set_star(env,mid,cid='family').status_code==200
 item=listing(env,query='q=Ailem').json()['items'][0]
 assert item['conversation']['type']=='family' and item['conversation']['name']=='Ailem aile sohbeti'
 assert listing(env,uid='b').json()['items']==[]

def test_other_member_cannot_remove_my_star(env):
 mid=add(env);set_star(env,mid)
 assert set_star(env,mid,False,uid='b').status_code==200
 assert listing(env).json()['items'][0]['message']['id']==mid
