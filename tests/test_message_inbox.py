"""Inbox behavior against real SQL queries and authenticated mutation routes."""
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException
from test_message_tools import env, add, auth, app, events
from app import dm_inbox, dm_folders
from app.models import User, Message, Conversation, ConversationMember
from app.platform_models import (ConversationInboxPreference as Preference, ConversationReadState,
    FamilyVisual, MessageHidden, ConversationFolder, ConversationVaultSession, PrivateMessageRequest)
from app.performance_queries import conversation_page

async def notify(db, uid, event):events.append((uid,event))
dm_folders.register_auth(auth);dm_inbox.register(notify);app.include_router(dm_inbox.router)

@pytest.fixture
def inbox(env):
 FamilyVisual.__table__.create(env[1],checkfirst=True)
 return env

def update(env, payload, uid='a', token=None):
 headers={'Authorization':'Bearer '+uid}
 if token:headers['X-Eris-DM-Vault']=token
 return env[0].post('/v1/inbox/preferences',json=payload,headers=headers)

def page(env, uid='a', **kw):
 with Session(env[1]) as db:return conversation_page(db,uid,kw.pop('folder','inbox'),kw.pop('limit',100),kw.pop('offset',0),**kw)

def ids(rows):return [r['id'] for r in rows]

def test_pin_sort_is_personal_and_persistent(inbox):
 add(inbox,'hi');r=update(inbox,{'conversation_ids':['grp'],'pinned':True});assert r.status_code==200,r.text
 assert ids(page(inbox))[0]=='grp'
 assert page(inbox)[0]['pinned'] is True
 assert not any(r['pinned'] for r in page(inbox,uid='b'))
 assert ids(page(inbox,view='pinned'))==['grp']
 update(inbox,{'conversation_ids':['grp'],'pinned':False});assert page(inbox,view='pinned')==[]

def test_manual_unread_does_not_rewind_receipts(inbox):
 mid=add(inbox,sender='b')
 assert update(inbox,{'conversation_ids':['dm'],'unread':False}).status_code==200
 assert events[-1][1]['read_up_to']==mid
 events.clear();update(inbox,{'conversation_ids':['dm'],'unread':True})
 with Session(inbox[1]) as db:
  state=db.scalar(select(ConversationReadState).where(ConversationReadState.user_id=='a'))
  assert state.last_read_message_id==mid
 row=next(r for r in page(inbox,view='unread') if r['id']=='dm')
 assert row['manual_unread'] and row['unread_count']==0 and events==[]
 assert page(inbox,uid='b',view='unread')==[]
 update(inbox,{'conversation_ids':['dm'],'unread':False});assert page(inbox,view='unread')==[]
 assert events==[]

def test_open_latest_clears_manual_but_older_lookup_preserves(inbox):
 mid=add(inbox,sender='b');update(inbox,{'conversation_ids':['dm'],'unread':True})
 assert inbox[0].get('/v1/message-tools/dm/history?around='+str(mid),headers={'Authorization':'Bearer a'}).status_code==200
 assert next(r for r in page(inbox) if r['id']=='dm')['manual_unread']
 assert inbox[0].get('/v1/message-tools/dm/history',headers={'Authorization':'Bearer a'}).status_code==200
 assert not next(r for r in page(inbox) if r['id']=='dm')['manual_unread']

@pytest.mark.parametrize('cid',['private','missing'])
def test_batch_access_failure_rolls_back_every_row(inbox,cid):
 r=update(inbox,{'conversation_ids':['grp',cid],'pinned':True});assert r.status_code==403
 assert page(inbox,view='pinned')==[]

@pytest.mark.parametrize('payload',[
 {'conversation_ids':[],'pinned':True},{'conversation_ids':['grp']},
 {'conversation_ids':['grp'],'pinned':'true'},{'conversation_ids':['grp'],'other':True},
 {'conversation_ids':['grp']*101,'unread':True}])
def test_invalid_mutations(inbox,payload):assert update(inbox,payload).status_code==422

def test_membership_revocation_blocks_preference(inbox):
 from sqlalchemy import delete
 update(inbox,{'conversation_ids':['grp'],'pinned':True})
 with Session(inbox[1]) as db:
  db.execute(delete(ConversationMember).where(ConversationMember.user_id=='a',ConversationMember.conversation_id=='grp'));db.commit()
 assert update(inbox,{'conversation_ids':['grp'],'unread':True}).status_code==403
 assert page(inbox,view='pinned')==[]

def test_vault_blocks_entire_batch_without_session(inbox):
 import hashlib
 add(inbox)
 with Session(inbox[1]) as db:
  db.add(ConversationFolder(user_id='a',conversation_id='dm',locked=True))
  db.add(ConversationVaultSession(user_id='a',token_hash=hashlib.sha256(b'secret').hexdigest(),scope='access',expires_at=datetime.now(timezone.utc)+timedelta(minutes=1)));db.commit()
 assert update(inbox,{'conversation_ids':['grp','dm'],'pinned':True}).status_code==403
 assert page(inbox,view='pinned')==[]
 assert update(inbox,{'conversation_ids':['dm'],'pinned':True},token='secret').status_code==200
 assert 'dm' not in ids(page(inbox,q='b'))
 assert ids(page(inbox,folder='locked',view='pinned'))==['dm']
 assert update(inbox,{'conversation_ids':['dm'],'unread':False},uid='b',token='secret').status_code==200 # b owns no lock

def test_hidden_expired_and_own_messages_not_unread(inbox):
 visible=add(inbox,'visible',sender='b')
 hidden=add(inbox,'hidden',sender='b');expired=add(inbox,'expired',sender='b');add(inbox,'own',sender='a')
 with Session(inbox[1]) as db:
  db.add(MessageHidden(user_id='a',message_id=hidden));db.get(Message,expired).expires_at=datetime.now(timezone.utc)-timedelta(seconds=1);db.commit()
 row=next(r for r in page(inbox,view='unread') if r['id']=='dm');assert row['unread_count']==1
 update(inbox,{'conversation_ids':['dm'],'unread':False})
 with Session(inbox[1]) as db:assert db.scalar(select(ConversationReadState.last_read_message_id).where(ConversationReadState.user_id=='a'))==visible
 assert page(inbox,view='unread')==[]

def test_hidden_expired_last_preview_and_order(inbox):
 first=add(inbox,'safe',sender='b',age=10);hidden=add(inbox,'private hidden',sender='b');expired=add(inbox,'expired',sender='b')
 add(inbox,'group latest',cid='grp',age=5)
 with Session(inbox[1]) as db:
  db.add(MessageHidden(user_id='a',message_id=hidden));db.get(Message,expired).expires_at=datetime.now(timezone.utc)-timedelta(seconds=1);db.commit()
 rows=page(inbox);assert ids(rows).index('grp')<ids(rows).index('dm')
 assert next(r for r in rows if r['id']=='dm')['last_message']=='safe'

@pytest.mark.parametrize('q,expected',[('Grup',['grp']),('b',['dm']),('1000000001',['dm']),('a',['system']),('%',[]),('_',[])])
def test_search_name_id_self_and_literal_wildcards(inbox,q,expected):
 add(inbox)
 assert ids(page(inbox,q=q))==expected

def test_search_and_unread_applied_before_pagination(inbox):
 with Session(inbox[1]) as db:
  for i in range(60):
   cid=f'extra{i:02d}';db.add(Conversation(id=cid,type='dm'));db.flush()
   db.add_all([ConversationMember(conversation_id=cid,user_id='a'),ConversationMember(conversation_id=cid,user_id='b')]);db.add(Message(conversation_id=cid,sender_id='b',text=cid))
  db.commit()
 first=page(inbox,q='b',view='unread',limit=50)
 second=page(inbox,q='b',view='unread',limit=50,offset=50)
 assert len(first)==50 and len(second)==10 and len(set(ids(first)+ids(second)))==60

def test_pending_requests_excluded_before_limit(inbox):
 add(inbox)
 with Session(inbox[1]) as db:
  db.add(PrivateMessageRequest(conversation_id='dm',sender_id='b',recipient_id='a',status='pending'));db.commit()
 assert 'dm' not in ids(page(inbox,limit=1))
 assert 'dm' not in ids(page(inbox,q='b'))

def test_duplicate_batch_ids_are_idempotent(inbox):
 r=update(inbox,{'conversation_ids':['grp','grp'],'pinned':True,'unread':True});assert r.json()=={'updated':['grp']}
 assert ids(page(inbox,view='pinned'))==['grp']

# Execute the production list handler, including its query validation and vault gate.
import ast
from fastapi import Query
from test_message_tools import main_ns, ROOT
from app.platform_models import Family, FamilyMember
from app.schemas import ConversationOut
list_ns=dict(main_ns, Query=Query, ConversationOut=ConversationOut, FamilyMember=FamilyMember, ConversationMember=ConversationMember,
    _session=dm_folders._session, conversation_page=conversation_page)
node=next(n for n in ast.parse((ROOT/'backend/app/main.py').read_text()).body
    if isinstance(n,ast.FunctionDef) and n.name=='list_conversations')
node.decorator_list=[]
exec(compile(ast.Module(body=[node],type_ignores=[]),'production-inbox-handler','exec'),list_ns)
app.add_api_route('/v1/conversations',list_ns['list_conversations'],methods=['GET'],response_model=list[ConversationOut])

@pytest.fixture
def production(inbox):
 FamilyMember.__table__.create(inbox[1],checkfirst=True)
 return inbox

def test_list_endpoint_exposes_saved_preferences_and_search(production):
 add(production)
 update(production,{'conversation_ids':['dm'],'pinned':True,'unread':True})
 r=production[0].get('/v1/conversations?q=b&view=pinned&limit=51&offset=0',headers={'Authorization':'Bearer a'})
 assert r.status_code==200,r.text
 assert [x['id'] for x in r.json()]==['dm']
 assert r.json()[0]['pinned'] and r.json()[0]['manual_unread']

@pytest.mark.parametrize('query,code',[
 ('view=other',422),('q='+'a'*101,422),('limit=101',422),('offset=-1',422),('folder=other',400),('folder=locked',403)])
def test_production_list_validation_and_vault_gate(production,query,code):
 assert production[0].get('/v1/conversations?'+query,headers={'Authorization':'Bearer a'}).status_code==code

def test_family_name_search_restores_legacy_membership(production):
 with Session(production[1]) as db:
  db.add(Conversation(id='family',type='family'));db.flush()
  db.add(Family(id='fam',owner_id='a',name='Ailem',chat_conversation_id='family'));db.flush()
  db.add(FamilyMember(family_id='fam',user_id='a'));db.commit()
 r=production[0].get('/v1/conversations?q=Ailem',headers={'Authorization':'Bearer a'})
 assert r.status_code==200,r.text
 assert r.json()[0]['id']=='family' and r.json()[0]['name']=='Ailem aile sohbeti'
 assert ids(page(production,uid='b',q='Ailem'))==[]

def test_preference_requires_authentication(inbox):
 assert inbox[0].post('/v1/inbox/preferences',json={'conversation_ids':['grp'],'pinned':True}).status_code==401

from app.repositories import MessageRepository
from app.services import MessageService
class TestManager:
 async def send_user(self, uid, event):events.append((uid,event))
TestManager.__test__=False
legacy_ns=dict(main_ns,Query=Query,dm_inbox=dm_inbox,ConversationReadState=ConversationReadState,
    MessageRepository=MessageRepository,MessageService=MessageService,manager=TestManager(),
    message_context=lambda db,rows,uid:{'hidden':set()},_message_out=lambda db,m,uid,context:{'id':m.id})
legacy_node=next(n for n in ast.parse((ROOT/'backend/app/main.py').read_text()).body
    if isinstance(n,ast.AsyncFunctionDef) and n.name=='list_messages')
legacy_node.decorator_list=[]
exec(compile(ast.Module(body=[legacy_node],type_ignores=[]),'production-legacy-history','exec'),legacy_ns)
app.add_api_route('/v1/legacy-history/{conversation_id}',legacy_ns['list_messages'],methods=['GET'],response_model=None)

@pytest.mark.parametrize('offset,manual',[(0,False),(1,True)])
def test_legacy_history_clears_reminder_only_on_latest_page(inbox,offset,manual):
 add(inbox,sender='b');add(inbox,sender='b');update(inbox,{'conversation_ids':['dm'],'unread':True})
 r=inbox[0].get('/v1/legacy-history/dm?offset='+str(offset),headers={'Authorization':'Bearer a'})
 assert r.status_code==200,r.text
 assert next(x for x in page(inbox) if x['id']=='dm')['manual_unread']==manual
