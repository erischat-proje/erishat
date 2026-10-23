"""Group polls: real routes, authorization, private tallies and message integration."""
from datetime import datetime,timedelta,timezone
import hashlib
import pytest
from sqlalchemy import select,delete
from sqlalchemy.orm import Session
from test_message_tools import env as base_env,app,add,events
from test_message_actions import env as action_env,ns as action_ns
from app import message_polls as mp,performance_queries,message_tools as mt,notification_policy
from app.models import User,Message,Conversation,ConversationMember
from app.platform_models import Family,FamilyMember,MessageHidden,ConversationFolder,ConversationVaultSession
from app.group_models import GroupSettings,GroupControl,GroupRole
from app.message_poll_models import MessagePoll,MessagePollVote
mp.register(action_ns['_require_message_media_access'],action_ns['_send_dm_event'],action_ns['_message_out'],notification_policy.allowed)
app.include_router(mp.router)

@pytest.fixture
def env(action_env,monkeypatch):
 client,engine=action_env
 for cls in [MessagePollVote,FamilyMember]:cls.__table__.create(engine,checkfirst=True)
 original=action_ns['message_context']
 def context(db,rows,uid):
  data=original(db,rows,uid);data['polls']=mp.annotations(db,rows,uid);return data
 monkeypatch.setitem(action_ns,'message_context',context);monkeypatch.setattr(performance_queries,'message_context',context)
 clock=[datetime.now(timezone.utc)];monkeypatch.setattr(mp,'now',lambda:clock[0])
 return client,engine,clock

def request(env,path,method='GET',uid='a',payload=None,token=None):
 headers={'Authorization':'Bearer '+uid}
 if token:headers['X-Eris-DM-Vault']=token
 return env[0].request(method,'/v1/message-polls'+path,headers=headers,**({'json':payload} if payload is not None else {}))
def create(env,uid='a',cid='grp',**values):
 return request(env,'/'+cid,'POST',uid,{'question':'Ne yapalım?','options':['Oyun','Sohbet'],'request_key':'poll_request_test_1234',**values})
def vote(env,mid,choices,uid='b',cid='grp',token=None):return request(env,f'/{cid}/{mid}/vote','PUT',uid,{'choices':choices},token)
def get(env,mid,uid='a',cid='grp',token=None):return request(env,f'/{cid}/{mid}',uid=uid,token=token)

def test_create_inserts_one_message_and_safe_poll_metadata(env):
 r=create(env);assert r.status_code==200,r.text;m=r.json();assert m['poll']['question']=='Ne yapalım?' and len(m['poll']['options'])==2
 assert m['text']=='[Anket] Ne yapalım?' and m['poll']['voter_count']==0 and m['poll']['can_close']
 assert events and all(e.get('has_poll') for uid,e in events)
 with Session(env[1]) as db:assert len(list(db.scalars(select(Message))))==1

def test_single_vote_change_clear_and_idempotence(env):
 mid=create(env).json()['id'];r=vote(env,mid,[0]);assert r.status_code==200,r.text
 assert r.json()['voter_count']==1 and r.json()['my_choices']==[0]
 previous_revision=r.json()['revision'];events.clear();same=vote(env,mid,[0]);assert same.json()['revision']==previous_revision and events==[]
 r=vote(env,mid,[1]);assert r.json()['revision']>previous_revision
 assert r.json()['voter_count']==1 and [x['count'] for x in r.json()['options']]==[0,1]
 other=get(env,mid).json();assert other['my_choices']==[] and not any(k in str(other) for k in ['user_id','creator_id','voters'])
 assert vote(env,mid,[]).json()['voter_count']==0

def test_multiple_vote_deduplicates_and_uses_voter_count(env):
 mid=create(env,multiple=True).json()['id'];r=vote(env,mid,[0,1,1]);assert r.status_code==200,r.text
 assert r.json()['voter_count']==1 and r.json()['my_choices']==[0,1] and [o['count'] for o in r.json()['options']]==[1,1]
 assert vote(env,mid,[1],uid='a').json()['voter_count']==2

@pytest.mark.parametrize('choices',[[0,1],[2],[-1],[True],['0']])
def test_invalid_single_vote(env,choices):
 mid=create(env).json()['id'];assert vote(env,mid,choices).status_code==422

@pytest.mark.parametrize('values',[
 {'question':'  '},{'options':['aynı',' AYNI ']},{'options':['','evet']},{'options':['tek']},
 {'options':['x'*81,'y']},{'options':[str(i) for i in range(11)]},{'multiple':'true'},
 {'duration_seconds':60},{'request_key':'short'},{'question':'x'*181}])
def test_poll_validation(env,values):assert create(env,**values).status_code==422

def test_creation_retry_does_not_duplicate_and_rejects_changed_payload(env):
 a=create(env);b=create(env);assert a.json()['id']==b.json()['id']
 assert create(env,question='Başka soru?').status_code==409
 assert create(env,duration_seconds=86400).status_code==409
 with Session(env[1]) as db:assert len(list(db.scalars(select(MessagePoll))))==1

@pytest.mark.parametrize('kind,code',[('outside',403),('dm',400),('closed',409),('admins',403),('muted',403),('banned',403),('locked',403),('slow',429)])
def test_creation_rules(env,kind,code):
 uid='outside' if kind=='outside' else 'b';cid='dm' if kind=='dm' else 'grp'
 with Session(env[1]) as db:
  if kind in ('closed','admins','slow'):db.add(GroupSettings(conversation_id='grp',closed=kind=='closed',admins_only=kind=='admins',slow_seconds=60 if kind=='slow' else 0))
  if kind in ('muted','banned','slow'):db.add(GroupControl(conversation_id='grp',user_id='b',banned=kind=='banned',muted_until=datetime.now(timezone.utc)+timedelta(hours=1) if kind=='muted' else None,last_sent_at=datetime.now(timezone.utc) if kind=='slow' else None))
  if kind=='locked':db.add(ConversationFolder(user_id='b',conversation_id='grp',locked=True))
  db.commit()
 assert create(env,uid=uid,cid=cid).status_code==code

@pytest.mark.parametrize('kind,code',[('hidden',404),('left',403),('locked',403),('closed_group',409),('muted',403),('admins',403)])
def test_vote_rules_and_visibility(env,kind,code):
 mid=create(env).json()['id']
 with Session(env[1]) as db:
  if kind=='hidden':db.add(MessageHidden(message_id=mid,user_id='b'))
  if kind=='left':db.execute(delete(ConversationMember).where(ConversationMember.conversation_id=='grp',ConversationMember.user_id=='b'))
  if kind=='locked':db.add(ConversationFolder(user_id='b',conversation_id='grp',locked=True))
  if kind=='closed_group':db.add(GroupSettings(conversation_id='grp',closed=True))
  if kind=='admins':db.add(GroupSettings(conversation_id='grp',admins_only=True))
  if kind=='muted':db.add(GroupControl(conversation_id='grp',user_id='b',banned=False,muted_until=datetime.now(timezone.utc)+timedelta(hours=1)))
  db.commit()
 assert vote(env,mid,[0]).status_code==code

def test_close_requires_creator_or_manager_and_is_permanent(env):
 mid=create(env).json()['id'];assert request(env,f'/grp/{mid}/close','POST',uid='b').status_code==403
 assert request(env,f'/grp/{mid}/close','POST').json()['is_closed']
 assert request(env,f'/grp/{mid}/close','POST').status_code==200
 assert vote(env,mid,[0]).status_code==409 and get(env,mid).json()['can_close'] is False

def test_moderator_can_close_another_members_poll(env):
 mid=create(env,uid='b').json()['id']
 with Session(env[1]) as db:db.add(GroupRole(conversation_id='grp',user_id='outside',role='moderator'));db.add(ConversationMember(conversation_id='grp',user_id='outside'));db.commit()
 assert request(env,f'/grp/{mid}/close','POST',uid='outside').status_code==200

@pytest.mark.parametrize('duration',[86400,604800])
def test_deadline_is_enforced_by_server_clock(env,duration):
 mid=create(env,duration_seconds=duration).json()['id'];env[2][0]+=timedelta(seconds=duration)
 assert get(env,mid).json()['is_closed'] and vote(env,mid,[0]).status_code==409

def test_family_members_vote_and_family_owner_closes(env):
 with Session(env[1]) as db:
  db.add(Conversation(id='famchat',type='family'));db.flush();db.add(Family(id='family',owner_id='a',name='Ailem',chat_conversation_id='famchat'));db.flush()
  for uid in ['a','b']:db.add(ConversationMember(conversation_id='famchat',user_id=uid));db.add(FamilyMember(family_id='family',user_id=uid,role='owner' if uid=='a' else 'member'))
  db.commit()
 r=create(env,uid='b',cid='famchat');assert r.status_code==200,r.text
 mid=r.json()['id'];assert vote(env,mid,[1],uid='a',cid='famchat').status_code==200
 assert request(env,f'/famchat/{mid}/close','POST',uid='a').status_code==200

def test_poll_cannot_be_edited_or_forwarded_as_text(env):
 mid=create(env).json()['id']
 r=env[0].patch(f'/v1/message-tools/grp/{mid}',headers={'Authorization':'Bearer a'},json={'text':'Başka soru','expected_text':'[Anket] Ne yapalım?'})
 assert r.status_code==403
 r=env[0].post('/v1/message-actions/grp/forward',headers={'Authorization':'Bearer a'},json={'message_ids':[mid],'target_conversation_id':'target','request_key':'poll_forward_request'})
 assert r.status_code==403

def test_vote_records_cascade_and_do_not_generate_new_messages(env):
 mid=create(env).json()['id'];events.clear();vote(env,mid,[0])
 assert all(e['type']=='dm_poll_updated' and 'choices' not in e for uid,e in events)
 with Session(env[1]) as db:
  assert len(list(db.scalars(select(Message))))==1
  db.delete(db.get(Message,mid));db.commit();assert not list(db.scalars(select(MessagePollVote))) and not list(db.scalars(select(MessagePoll)))
 assert get(env,mid).status_code==404

def test_locked_poll_requires_owners_token(env):
 mid=create(env).json()['id']
 with Session(env[1]) as db:
  db.add(ConversationFolder(user_id='b',conversation_id='grp',locked=True));db.add(ConversationVaultSession(user_id='b',token_hash=hashlib.sha256(b'secret').hexdigest(),scope='access',expires_at=datetime.now(timezone.utc)+timedelta(hours=1)));db.commit()
 assert vote(env,mid,[0],token='wrong').status_code==403
 assert vote(env,mid,[0],token='secret').status_code==200

def test_muted_recipient_still_receives_poll_without_notification(env):
 from app.notification_policy import update,MuteUpdate
 from app.platform_models import Notification
 with Session(env[1]) as db:update(db,'b','grp',MuteUpdate(is_muted=True,duration_seconds=3600))
 r=create(env);assert r.status_code==200,r.text
 with Session(env[1]) as db:assert not list(db.scalars(select(Notification)))
 assert any(uid=='b' and e['type']=='dm_message' for uid,e in events)
