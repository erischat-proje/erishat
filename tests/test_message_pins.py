"""Pin management uses production handlers, bounded metadata reads and shared gates."""
import ast, hashlib
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select, delete, event
from sqlalchemy.orm import Session
from test_message_tools import env as base_env, app, add, events, ROOT
from test_message_actions import env as action_env, ns as action_ns
from app import message_pins as mp
from app.models import Conversation, ConversationMember, Message
from app.platform_models import (PinnedMessage, MessageMedia, MessageHidden, ConversationFolder,
    ConversationVaultSession, Family, FamilyMember, PrivateMessageRequest, UserBlock)
from app.group_models import GroupSettings, GroupRole, GroupAudit
from app.message_attachment_models import MessageAttachment
app.include_router(mp.router)
# Import production compatibility routes so existing platform API callers remain valid.
ns=dict(action_ns,message_pins=mp)
for name,method in [('pin_message','POST'),('unpin_message','DELETE')]:
 node=next(n for n in ast.parse((ROOT/'backend/app/main.py').read_text()).body if isinstance(n,ast.AsyncFunctionDef) and n.name==name)
 node.decorator_list=[];exec(compile(ast.Module(body=[node],type_ignores=[]),'production-pins','exec'),ns)
 app.add_api_route('/v1/conversations/{conversation_id}/pins/{message_id}',ns[name],methods=[method])

@pytest.fixture
def env(action_env,monkeypatch):
 client,engine=action_env
 for cls in [PinnedMessage,FamilyMember]:cls.__table__.create(engine,checkfirst=True)
 async def notify(db,uid,data):events.append((uid,data))
 monkeypatch.setattr(mp,'_write_access',action_ns['_require_message_media_access'])
 monkeypatch.setattr(mp,'_notify',notify)
 return client,engine

def request(env,cid='dm',mid=None,method='GET',uid='a',token=None):
 headers={'Authorization':'Bearer '+uid}
 if token:headers['X-Eris-DM-Vault']=token
 return env[0].request(method,'/v1/conversations/'+cid+'/pins'+('/'+str(mid) if mid else ''),headers=headers)
def pin(env,mid,cid='dm',uid='a',token=None):return request(env,cid,mid,'POST',uid,token)

def test_shared_pins_list_and_safe_change_events(env):
 mid=add(env);r=pin(env,mid);assert r.status_code==200,r.text
 assert r.json()=={'pinned':True}
 data=request(env,uid='b').json();assert data['can_manage'] and data['limit']==5
 assert data['items'][0]['message']['text']=='İlk metin' and data['items'][0]['message']['id']==mid
 assert {uid for uid,e in events}=={'a','b'} and all(e=={'type':'dm_pins_updated','conversation_id':'dm'} for uid,e in events)
 events.clear();assert pin(env,mid).status_code==200 and events==[]
 assert request(env,mid=mid,method='DELETE',uid='b').json()=={'pinned':False}
 events.clear();assert request(env,mid=mid,method='DELETE').status_code==200 and events==[]
 assert request(env).json()['items']==[]

def test_limit_five_across_members_and_retry_and_freed_slot(env):
 ids=[add(env,str(i)) for i in range(6)]
 for mid in ids[:5]:assert pin(env,mid,uid='a' if mid%2 else 'b').status_code==200
 assert pin(env,ids[0]).status_code==200
 assert pin(env,ids[-1]).status_code==409
 assert [x['message']['id'] for x in request(env).json()['items']]==list(reversed(ids[:5]))
 assert request(env,mid=ids[0],method='DELETE').status_code==200
 assert pin(env,ids[-1]).status_code==200
 with Session(env[1]) as db:assert len(list(db.scalars(select(PinnedMessage))))==5

@pytest.mark.parametrize('kind,code',[('outside',403),('cross',404),('missing',404),('hidden',404),('expired',404),('timed',403),('temporary',403),('ephemeral',403),('system',403),('pending',403),('locked',403),('blocked',403)])
def test_pin_visibility_and_access_gates(env,kind,code):
 mid=add(env,cid='private' if kind=='cross' else 'system' if kind=='system' else 'dm',sender='outside' if kind=='cross' else 'a')
 with Session(env[1]) as db:
  if kind=='hidden':db.add(MessageHidden(message_id=mid,user_id='a'))
  if kind in ('expired','timed'):db.get(Message,mid).expires_at=datetime.now(timezone.utc)+timedelta(hours=-1 if kind=='expired' else 1)
  if kind=='temporary':db.add(MessageMedia(message_id=mid,media_type='image',mime_type='image/png',data=b'bytes',temporary=True))
  if kind=='ephemeral':db.get(Conversation,'dm').is_ephemeral=True
  if kind=='locked':db.add(ConversationFolder(conversation_id='dm',user_id='a',locked=True))
  if kind=='pending':db.add(PrivateMessageRequest(conversation_id='dm',sender_id='b',recipient_id='a',status='pending'))
  if kind=='blocked':db.add(UserBlock(blocker_id='b',blocked_id='a'))
  db.commit()
 assert pin(env,999999 if kind=='missing' else mid,cid='system' if kind=='system' else 'dm',uid='outside' if kind=='outside' else 'a').status_code==code

@pytest.mark.parametrize('uid,allowed',[('a',True),('b',False),('outside',False)])
def test_group_manager_controls_and_audit(env,uid,allowed):
 mid=add(env,cid='grp');r=pin(env,mid,cid='grp',uid=uid);assert r.status_code==(200 if allowed else 403),r.text
 if uid!='outside':assert request(env,'grp',uid=uid).json()['can_manage']==allowed
 if allowed:
  assert request(env,'grp',mid,'DELETE',uid).status_code==200
  with Session(env[1]) as db:assert [x.action for x in db.scalars(select(GroupAudit).order_by(GroupAudit.id))]==['pin_message','unpin_message']

def test_group_moderator_manages_and_closed_group_is_read_only(env):
 mid=add(env,cid='grp')
 with Session(env[1]) as db:db.get(GroupRole,('grp','b')).role='moderator';db.commit()
 assert pin(env,mid,'grp','b').status_code==200
 with Session(env[1]) as db:db.add(GroupSettings(conversation_id='grp',closed=True));db.commit()
 assert not request(env,'grp').json()['can_manage'] and len(request(env,'grp').json()['items'])==1
 assert request(env,'grp',mid,'DELETE').status_code==409

@pytest.mark.parametrize('manager',[True,False])
def test_family_only_owner_or_admin_manages_pins(env,manager):
 with Session(env[1]) as db:
  db.add(Conversation(id='fam',type='family'));db.flush();db.add(Family(id='family',owner_id='a',name='Aile',chat_conversation_id='fam'));db.flush()
  for uid in ['a','b']:db.add(ConversationMember(conversation_id='fam',user_id=uid));db.add(FamilyMember(family_id='family',user_id=uid,role='owner' if uid=='a' else 'admin' if manager else 'member'))
  db.commit()
 mid=add(env,cid='fam');assert pin(env,mid,'fam','b').status_code==(200 if manager else 403)
 assert request(env,'fam',uid='b').json()['can_manage']==manager
 assert pin(env,mid,'fam','a').status_code==200

def test_list_excludes_hidden_expired_temporary_and_deleted_without_file_bytes(env):
 ids=[add(env,str(i)) for i in range(5)]
 for mid in ids:assert pin(env,mid).status_code==200
 with Session(env[1]) as db:
  db.add(MessageHidden(message_id=ids[0],user_id='a'))
  db.get(Message,ids[1]).expires_at=datetime.now(timezone.utc)+timedelta(minutes=1)
  db.add(MessageMedia(message_id=ids[2],media_type='image',mime_type='image/png',data=b'private',temporary=True))
  db.delete(db.get(Message,ids[3]));db.add(MessageMedia(message_id=ids[4],media_type='document',mime_type='application/pdf',data=b'private'))
  db.add(MessageAttachment(message_id=ids[4],filename='<script>.pdf',size_bytes=7));db.commit()
 queries=[]
 def track(conn,cursor,sql,params,ctx,many):queries.append(sql)
 event.listen(env[1],'before_cursor_execute',track)
 try:data=request(env).json()
 finally:event.remove(env[1],'before_cursor_execute',track)
 assert [x['message']['id'] for x in data['items']]==[ids[4]]
 assert data['items'][0]['message']['media_name']=='<script>.pdf' and 'private' not in str(data)
 assert not any('message_media.data' in q for q in queries)
 # Other participants retain their own visibility of the first pin.
 assert ids[0] in [x['message']['id'] for x in request(env,uid='b').json()['items']]

@pytest.mark.parametrize('method',['GET','DELETE'])
def test_vault_and_membership_gate_reads_and_removal(env,method):
 mid=add(env);pin(env,mid)
 with Session(env[1]) as db:
  db.add(ConversationFolder(conversation_id='dm',user_id='a',locked=True))
  db.add(ConversationVaultSession(user_id='a',token_hash=hashlib.sha256(b'secret').hexdigest(),scope='access',expires_at=datetime.now(timezone.utc)+timedelta(minutes=1)));db.commit()
 assert request(env,mid=mid if method=='DELETE' else None,method=method).status_code==403
 assert request(env,mid=mid if method=='DELETE' else None,method=method,token='secret').status_code==200
 assert request(env,uid='outside').status_code==403

def test_hidden_pin_can_be_removed_without_returning_hidden_text(env):
 mid=add(env);pin(env,mid)
 with Session(env[1]) as db:db.add(MessageHidden(message_id=mid,user_id='a'));db.commit()
 assert request(env).json()['items']==[]
 assert request(env,mid=mid,method='DELETE').status_code==200

@pytest.mark.parametrize('gate',['pending','left','closed_family'])
def test_read_or_management_revocation(env,gate):
 mid=add(env);pin(env,mid)
 with Session(env[1]) as db:
  if gate=='pending':db.add(PrivateMessageRequest(conversation_id='dm',sender_id='b',recipient_id='a',status='pending'))
  if gate=='left':db.execute(delete(ConversationMember).where(ConversationMember.conversation_id=='dm',ConversationMember.user_id=='a'))
  if gate=='closed_family':db.add(Family(id='closed',owner_id='a',name='Kapalı',chat_conversation_id='dm',closed=True))
  db.commit()
 if gate!='closed_family':assert request(env).status_code==403
 else:assert request(env).json()['can_manage'] is False
 assert request(env,mid=mid,method='DELETE').status_code==403
 with Session(env[1]) as db:assert db.scalar(select(PinnedMessage.id)) is not None

def test_platform_feature_restriction_blocks_pin_changes(env,monkeypatch):
 from fastapi import HTTPException
 def restricted(*args):raise HTTPException(403,'Mesaj işlemleri kısıtlandı.')
 mid=add(env);monkeypatch.setitem(action_ns,'require_feature',restricted)
 assert pin(env,mid).status_code==403
 with Session(env[1]) as db:assert db.scalar(select(PinnedMessage.id)) is None
