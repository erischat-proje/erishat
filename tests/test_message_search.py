"""Global search isolates private scopes before paging and never mutates read state."""
from datetime import datetime,timedelta,timezone
import hashlib
import pytest
from sqlalchemy import select,delete,event
from sqlalchemy.orm import Session
from test_message_tools import env as base_env,app,add,events
from app import message_search as ms
from app.models import User,Message,Conversation,ConversationMember
from app.platform_models import (MessageHidden,MessageMedia,ConversationFolder,ConversationVaultSession,
 ConversationReadState,ConversationInboxPreference,PrivateMessageRequest,Family)
from app.message_attachment_models import MessageAttachment
from app.group_models import GroupSettings
app.include_router(ms.router)

@pytest.fixture
def env(base_env):
 MessageAttachment.__table__.create(base_env[1],checkfirst=True)
 return base_env

def search(env,q='aranan',uid='a',token=None,**values):
 headers={'Authorization':'Bearer '+uid}
 if token:headers['X-Eris-DM-Vault']=token
 return env[0].get('/v1/message-search',params={'q':q,**values},headers=headers)

def test_global_results_cover_dm_group_and_archive_without_marking_read(env):
 ids=[add(env,'aranan metin',cid=cid,sender='b') for cid in ['dm','grp']]
 with Session(env[1]) as db:
  db.add(ConversationFolder(user_id='a',conversation_id='dm',archived=True));db.add(ConversationInboxPreference(user_id='a',conversation_id='dm',manual_unread=True));db.commit()
 r=search(env);assert r.status_code==200,r.text;items=r.json()['items'];assert [x['message']['id'] for x in items]==list(reversed(ids))
 assert items[0]['conversation']['type']=='group' and items[0]['conversation']['name']=='Grup'
 assert items[1]['conversation']['name']=='b' and items[1]['conversation']['members']==[{'user_id':'b','nickname':'b'}]
 assert events==[]
 with Session(env[1]) as db:
  assert not list(db.scalars(select(ConversationReadState)))
  assert db.scalar(select(ConversationInboxPreference)).manual_unread

@pytest.mark.parametrize('reason',['other_member','hidden','expired','future_ttl','temporary','ephemeral','system','pending','left','locked'])
def test_privacy_filters_before_results(env,reason):
 mid=add(env,'aranan metin',cid='private' if reason=='other_member' else 'system' if reason=='system' else 'dm',sender='outside' if reason=='other_member' else 'b')
 with Session(env[1]) as db:
  if reason=='hidden':db.add(MessageHidden(user_id='a',message_id=mid))
  if reason in ('expired','future_ttl'):db.get(Message,mid).expires_at=datetime.now(timezone.utc)+timedelta(hours=1 if reason=='future_ttl' else -1)
  if reason=='temporary':db.add(MessageMedia(message_id=mid,media_type='image',mime_type='image/png',data=b'bytes',temporary=True))
  if reason=='ephemeral':db.get(Conversation,'dm').is_ephemeral=True
  if reason=='pending':db.add(PrivateMessageRequest(conversation_id='dm',sender_id='b',recipient_id='a',status='pending'))
  if reason=='left':db.execute(delete(ConversationMember).where(ConversationMember.conversation_id=='dm',ConversationMember.user_id=='a'))
  if reason=='locked':db.add(ConversationFolder(user_id='a',conversation_id='dm',locked=True))
  db.commit()
 assert search(env).json()['items']==[]


def test_locked_scope_requires_current_owner_access_session(env):
 regular=add(env,'aranan açık',cid='grp');locked=add(env,'aranan kilitli')
 with Session(env[1]) as db:
  db.add(ConversationFolder(user_id='a',conversation_id='dm',locked=True));db.add(ConversationVaultSession(user_id='a',token_hash=hashlib.sha256(b'secret').hexdigest(),scope='access',expires_at=datetime.now(timezone.utc)+timedelta(minutes=1)));db.commit()
 assert [x['message']['id'] for x in search(env,token='secret').json()['items']]==[regular]
 assert search(env,scope='locked').status_code==403
 assert search(env,scope='locked',token='wrong').status_code==403
 assert search(env,scope='locked',token='secret',uid='b').status_code==403
 assert [x['message']['id'] for x in search(env,scope='locked',token='secret').json()['items']]==[locked]
 with Session(env[1]) as db:db.scalar(select(ConversationVaultSession)).expires_at=datetime.now(timezone.utc)-timedelta(seconds=1);db.commit()
 assert search(env,scope='locked',token='secret').status_code==403

@pytest.mark.parametrize('kind',['image','voice','video','document'])
def test_file_name_filter_and_no_binary_data(env,kind):
 mid=add(env,'Dosya')
 with Session(env[1]) as db:
  db.add(MessageMedia(message_id=mid,media_type=kind,mime_type='application/octet-stream',data=b'secret_binary',temporary=False));db.add(MessageAttachment(message_id=mid,filename='aranan_<img>.pdf',size_bytes=13));db.commit()
 queries=[]
 def track(conn,cursor,sql,params,ctx,many):queries.append(sql)
 event.listen(env[1],'before_cursor_execute',track)
 try:r=search(env,kind=kind)
 finally:event.remove(env[1],'before_cursor_execute',track)
 assert r.status_code==200,r.text;assert r.json()['items'][0]['message']['media_name']=='aranan_<img>.pdf'
 assert not any('message_media.data' in q for q in queries) and 'secret_binary' not in r.text
 assert search(env,kind='text').json()['items']==[]

@pytest.mark.parametrize('q',['%%','__','!!'])
def test_literal_wildcards_and_escape_character(env,q):
 mid=add(env,'aranan '+q)
 assert [x['message']['id'] for x in search(env,q=q).json()['items']]==[mid]
 assert search(env,q=q+'x').json()['items']==[]


def test_pagination_and_hidden_filter_are_stable(env):
 ids=[add(env,'aranan '+str(i),cid='grp' if i%2 else 'dm') for i in range(65)]
 with Session(env[1]) as db:
  for mid in ids[-5:]:db.add(MessageHidden(message_id=mid,user_id='a'))
  db.commit()
 a=search(env).json();assert len(a['items'])==30 and a['has_more']
 b=search(env,before=a['next_before']).json();assert len(b['items'])==30 and not b['has_more']
 assert [x['message']['id'] for page in [a,b] for x in page['items']]==list(reversed(ids[:-5]))


def test_family_and_closed_group_names_and_scope(env):
 with Session(env[1]) as db:
  db.add(Conversation(id='fam',type='family'));db.flush();db.add(Family(id='family',owner_id='a',name='<script>Aile</script>',chat_conversation_id='fam'));db.add(ConversationMember(conversation_id='fam',user_id='a'));db.add(GroupSettings(conversation_id='grp',closed=True));db.commit()
 group=add(env,'aranan eski grup',cid='grp');family=add(env,'aranan aile',cid='fam')
 items=search(env).json()['items'];assert items[0]['conversation']['type']=='family' and items[0]['conversation']['name']=='<script>Aile</script> aile sohbeti'
 assert [x['message']['id'] for x in items]==[family,group]


def test_preview_centers_on_match_without_copying_entire_message(env):
 mid=add(env,'başlangıç '+'x'*400+' aranan metin '+'y'*400)
 message=search(env).json()['items'][0]['message'];assert message['id']==mid and 'aranan' in message['text'] and len(message['text'])<=242 and message['text'].startswith('…')

@pytest.mark.parametrize('values',[{'q':''},{'q':'x'},{'q':'  '},{'q':'x'*101},{'kind':'bad'},{'scope':'bad'},{'before':0},{'limit':51}])
def test_invalid_search_parameters(env,values):assert search(env,**values).status_code==422


def test_no_auth_and_other_account_cannot_search_messages(env):
 add(env,'aranan metin');assert env[0].get('/v1/message-search?q=aranan').status_code==401
 assert search(env,uid='outside').json()['items']==[]
