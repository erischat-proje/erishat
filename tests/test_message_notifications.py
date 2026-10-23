"""Timed mute routes and actual text/media/forward/family/story/gift send handlers."""
import ast,hashlib
from types import SimpleNamespace
from datetime import datetime,timedelta,timezone
import pytest
from fastapi import File,Form,UploadFile
from sqlalchemy import select,update
from sqlalchemy.orm import Session
from test_message_tools import env as base_env,app,ROOT,main_ns,test_current_user,add,events
from test_message_actions import env as action_env
from test_message_attachments import ns as media_ns
from app import notification_policy as policy,message_actions as ma,family_routes,performance_queries
from app.models import User,Message,Conversation,ConversationMember
from app.platform_models import (ConversationMute,ConversationFolder,ConversationVaultSession,
 Notification,Family,FamilyMember,FamilyVisual,DirectMessageGift)

ns=dict(main_ns,__name__='app.main',__package__='app',notification_policy=policy,ConversationMuteUpdate=policy.MuteUpdate,
    Conversation=Conversation,DirectMessageGift=DirectMessageGift,update=update,datetime=datetime,timedelta=timedelta,timezone=timezone,
    File=File,Form=Form,UploadFile=UploadFile,MessageMedia=media_ns['MessageMedia'],
    relationship_routes=SimpleNamespace(lock_users=lambda *a:None),
    GIFT_CATALOG={'rose':100},GIFT_META={'rose':{'id':1,'image_url':'/assets/rose.png'}},
    _visible_story=lambda db,sid,user:SimpleNamespace(id=sid,user_id='b',mime_type='image/jpeg',image_bytes=None))
for name in ['_message_notifications_allowed','conversation_notifications','set_conversation_notifications','create_message','reply_to_story','send_direct_gift']:
 node=next(n for n in ast.parse((ROOT/'backend/app/main.py').read_text()).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name)
 node.decorator_list=[];exec(compile(ast.Module(body=[node],type_ignores=[]),'production-notification-handler','exec'),ns)
app.add_api_route('/v1/conversations/{conversation_id}/notifications',ns['conversation_notifications'],methods=['GET'])
app.add_api_route('/v1/conversations/{conversation_id}/notifications',ns['set_conversation_notifications'],methods=['PUT'])
app.add_api_route('/v1/mute-test/messages/{conversation_id}',ns['create_message'],methods=['POST'])
app.add_api_route('/v1/mute-test/stories/{story_id}/reply',ns['reply_to_story'],methods=['POST'])
app.add_api_route('/v1/mute-test/messages/{conversation_id}/gifts',ns['send_direct_gift'],methods=['POST'])
family_routes.register_family_auth(test_current_user);app.include_router(family_routes.router)

@pytest.fixture
def env(action_env,monkeypatch):
 client,engine=action_env;clock=[datetime(2026,10,23,12,0,tzinfo=timezone.utc)]
 monkeypatch.setattr(policy,'now',lambda:clock[0]);monkeypatch.setattr(ma,'_notifications',policy.allowed)
 monkeypatch.setitem(media_ns,'_message_notifications_allowed',ns['_message_notifications_allowed'])
 monkeypatch.setattr(family_routes,'require_chat_write',lambda *a:None)
 from app import vip_spending
 monkeypatch.setattr(vip_spending,'record_spend',lambda *a:None)
 for cls in [FamilyMember,FamilyVisual]:cls.__table__.create(engine,checkfirst=True)
 return client,engine,clock

def put(env,muted=True,duration=None,uid='a',cid='dm',token=None):
 headers={'Authorization':'Bearer '+uid}
 if token:headers['X-Eris-DM-Vault']=token
 return env[0].put(f'/v1/conversations/{cid}/notifications',headers=headers,json={'is_muted':muted,**({'duration_seconds':duration} if duration is not None else {})})
def get(env,uid='a',cid='dm',token=None):
 headers={'Authorization':'Bearer '+uid}
 if token:headers['X-Eris-DM-Vault']=token
 return env[0].get(f'/v1/conversations/{cid}/notifications',headers=headers)
def notifications(env):
 with Session(env[1]) as db:return list(db.scalars(select(Notification).where(Notification.user_id=='b')))

@pytest.mark.parametrize('duration',[3600,28800,86400,604800])
def test_timer_expiry_is_server_enforced_without_background_worker(env,duration):
 r=put(env,duration=duration);assert r.status_code==200,r.text
 assert r.json()['is_muted'] and datetime.fromisoformat(r.json()['muted_until'])==env[2][0]+timedelta(seconds=duration)
 assert get(env,uid='b').json()['is_muted'] is False
 with Session(env[1]) as db:assert not policy.allowed(db,'a','dm')
 env[2][0]+=timedelta(seconds=duration)
 assert get(env).json()=={'is_muted':False,'muted_until':None}
 with Session(env[1]) as db:assert policy.allowed(db,'a','dm')

def test_legacy_indefinite_and_unmute_clear_previous_timer(env):
 assert put(env,duration=3600).status_code==200
 assert put(env).json()=={'is_muted':True,'muted_until':None}
 env[2][0]+=timedelta(days=50);assert get(env).json()['is_muted']
 with Session(env[1]) as db:assert db.get(policy.ConversationMuteExpiry,('a','dm')) is None
 assert put(env,False).json()=={'is_muted':False,'muted_until':None}

def test_changing_duration_restarts_from_server_now(env):
 put(env,duration=3600);env[2][0]+=timedelta(minutes=15)
 r=put(env,duration=28800);assert datetime.fromisoformat(r.json()['muted_until'])==env[2][0]+timedelta(hours=8)
 with Session(env[1]) as db:assert len(list(db.scalars(select(ConversationMute))))==1

@pytest.mark.parametrize('kind',['global_off','inactive','missing'])
def test_global_notification_preference_wins_after_timer_expiry(env,kind):
 put(env,duration=3600);env[2][0]+=timedelta(hours=2)
 with Session(env[1]) as db:
  if kind=='global_off':db.get(User,'a').notifications_enabled=False
  if kind=='inactive':db.get(User,'a').is_active=False
  db.commit();assert not policy.allowed(db,'missing' if kind=='missing' else 'a','dm')

@pytest.mark.parametrize('payload',[{'is_muted':True,'duration_seconds':60},{'is_muted':True,'duration_seconds':0},
 {'is_muted':True,'duration_seconds':-1},{'is_muted':False,'duration_seconds':3600},
 {'is_muted':'true'},{'is_muted':True,'extra':1}])
def test_duration_validation(env,payload):
 assert env[0].put('/v1/conversations/dm/notifications',headers={'Authorization':'Bearer a'},json=payload).status_code==422

@pytest.mark.parametrize('uid,cid,code',[('outside','dm',403),('a','private',403),('a','missing',404)])
def test_access_is_required_for_get_and_put(env,uid,cid,code):
 assert get(env,uid,cid).status_code==code and put(env,uid=uid,cid=cid).status_code==code

def test_vault_access_and_closed_groups_keep_personal_settings(env):
 from app.group_models import GroupSettings
 with Session(env[1]) as db:
  db.add(ConversationFolder(user_id='a',conversation_id='dm',locked=True))
  db.add(ConversationVaultSession(user_id='a',token_hash=hashlib.sha256(b'secret').hexdigest(),scope='access',expires_at=datetime.now(timezone.utc)+timedelta(minutes=5)))
  db.add(GroupSettings(conversation_id='grp',closed=True));db.commit()
 assert get(env).status_code==put(env).status_code==403
 assert put(env,duration=3600,token='secret').status_code==200
 assert get(env,token='secret').json()['is_muted']
 assert put(env,duration=3600,uid='b',cid='grp').status_code==200

def test_inbox_mute_metadata_expires_without_changing_unread(env):
 add(env,sender='b');put(env,duration=3600)
 with Session(env[1]) as db:
  row=next(r for r in performance_queries.conversation_page(db,'a','inbox',100,0) if r['id']=='dm')
  assert row['is_muted'] and row['unread_count']==1
 env[2][0]+=timedelta(hours=1)
 with Session(env[1]) as db:
  row=next(r for r in performance_queries.conversation_page(db,'a','inbox',100,0) if r['id']=='dm')
  assert not row['is_muted'] and row['muted_until'] is None and row['unread_count']==1

@pytest.mark.parametrize('kind',['text','media','forward','story','gift','family'])
@pytest.mark.parametrize('expired',[False,True])
def test_actual_send_handlers_respect_mute_and_resume_after_expiry(env,kind,expired):
 cid='target' if kind=='forward' else 'dm'
 if kind=='family':
  with Session(env[1]) as db:
   db.add(Family(id='fam',owner_id='a',name='Ailem',chat_conversation_id='dm'));db.flush()
   db.add_all([FamilyMember(family_id='fam',user_id='a',role='owner'),FamilyMember(family_id='fam',user_id='b',role='member')]);db.commit()
 put(env,duration=3600,uid='b',cid=cid)
 if expired:env[2][0]+=timedelta(hours=1)
 headers={'Authorization':'Bearer a'}
 if kind=='text':r=env[0].post('/v1/mute-test/messages/dm',headers=headers,json={'text':'Yeni mesaj'})
 elif kind=='media':r=env[0].post('/v1/messages/dm/media',headers=headers,data={'media_type':'document','view_seconds':'0'},files={'file':('ornek.pdf',b'%PDF-1.4\n%%EOF\n','application/pdf')})
 elif kind=='forward':
  mid=add(env);r=env[0].post('/v1/message-actions/dm/forward',headers=headers,json={'message_ids':[mid],'target_conversation_id':'target','request_key':'notification_forward_test'})
 elif kind=='story':r=env[0].post('/v1/mute-test/stories/1/reply',headers=headers,data={'text':'Story yanıtı'})
 elif kind=='gift':
  with Session(env[1]) as db:db.get(User,'a').lidya=1000;db.commit()
  r=env[0].post('/v1/mute-test/messages/dm/gifts',headers=headers,json={'gift_key':'rose','quantity':1})
 else:r=env[0].post('/v1/families/fam/chat/messages',headers=headers,json={'text':'Aile mesajı'})
 assert r.status_code in (200,201),r.text
 assert len(notifications(env))==(1 if expired else 0)
 with Session(env[1]) as db:
  assert list(db.scalars(select(Message).where(Message.conversation_id==cid,Message.sender_id=='a')))
  if kind=='gift':assert db.get(User,'a').lidya==900 and db.get(User,'b').lidya>0 and db.scalar(select(DirectMessageGift)) is not None
