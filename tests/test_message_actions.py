"""Real action routes, copy isolation, privacy gates and production serializer."""
import ast,hashlib
from datetime import datetime,timedelta,timezone
import pytest
from fastapi import HTTPException
from sqlalchemy import select,delete
from sqlalchemy.orm import Session
from test_message_tools import env as base_env,add,app,events,main_ns,ROOT,production_context
from app import message_actions as ma,message_tools as mt,performance_queries
from app.models import User,Conversation,ConversationMember,Message
from app.platform_models import (MessageMedia,DirectMessageGift,MessageHidden,UserBlock,
 ConversationFolder,ConversationVaultSession,PrivateProfileSetting,PrivateMessageRequest,
 DirectMessageRestriction,DirectMessageUnlock,Family)
from app.message_action_models import MessageReaction,ForwardedMessage,MessageForwardRequest
from app.message_attachment_models import MessageAttachment
from app.group_models import GroupSettings,GroupControl

ns=dict(main_ns,Conversation=Conversation,ConversationMember=ConversationMember,
 PrivateProfileSetting=PrivateProfileSetting,PrivateMessageRequest=PrivateMessageRequest)
for name in ['_require_message_media_access','_dm_request_gate','_message_out']:
 node=next(n for n in ast.parse((ROOT/'backend/app/main.py').read_text()).body
    if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name)
 node.decorator_list=[];exec(compile(ast.Module(body=[node],type_ignores=[]),'production-action-policy','exec'),ns)
async def notify(db,uid,event):events.append((uid,event))
ma.register(ns['_require_message_media_access'],notify,ns['_message_out'],lambda *a:True)
app.include_router(ma.router)

@pytest.fixture
def env(base_env,monkeypatch):
 client,engine=base_env
 for cls in [MessageReaction,ForwardedMessage,MessageForwardRequest,MessageAttachment,PrivateProfileSetting]:
  cls.__table__.create(engine,checkfirst=True)
 def context(db,rows,uid):
  data=production_context(db,rows,uid);ids=[m.id for m in rows]
  data.update(actions=ma.annotations(db,rows,uid),
   media={m.message_id:m for m in db.scalars(select(MessageMedia).where(MessageMedia.message_id.in_(ids)))},
   attachments={a.message_id:a for a in db.scalars(select(MessageAttachment).where(MessageAttachment.message_id.in_(ids)))})
  return data
 monkeypatch.setattr(performance_queries,'message_context',context);ns['message_context']=context
 with Session(engine) as db:
  db.add(Conversation(id='target',type='dm'));db.flush()
  db.add_all([ConversationMember(conversation_id='target',user_id='a'),ConversationMember(conversation_id='target',user_id='b')]);db.commit()
 yield client,engine

def request(env,path,payload,uid='a',method='POST',vault=None):
 headers={'Authorization':'Bearer '+uid}
 if vault:headers['X-Eris-DM-Vault']=vault
 return env[0].request(method,'/v1/message-actions'+path,json=payload,headers=headers)
def forward(env,ids,target='target',key='request_key_123456',uid='a',vault=None):
 return request(env,'/dm/forward',{'message_ids':ids,'target_conversation_id':target,'request_key':key},uid,vault=vault)
def react(env,mid,emoji='👍',uid='a',cid='dm',vault=None):
 return request(env,f'/{cid}/{mid}/reaction',{'emoji':emoji},uid,'PUT',vault)
def media(env,kind='document',temporary=False,data=b'%PDF-1.4 test'):
 mid=add(env,text='[Belge] ornek.pdf',sender='b')
 with Session(env[1]) as db:
  db.add(MessageMedia(message_id=mid,media_type=kind,mime_type='application/pdf',data=data,temporary=temporary))
  db.add(MessageAttachment(message_id=mid,filename='ornek.pdf',size_bytes=len(data or b'')));db.commit()
 return mid

def test_forward_text_does_not_expose_original_identity_or_quote(env):
 mid=add(env,'Gönderilen metin',sender='b');r=forward(env,[mid]);assert r.status_code==200,r.text
 m=r.json()['messages'][0];assert m['text']=='Gönderilen metin' and m['sender_id']=='a' and m['conversation_id']=='target' and m['forwarded']
 assert m.get('reply') is None and not any(k.startswith('source') or k.startswith('original') for k in m)
 assert all(e['type']=='dm_message' and e['forwarded'] and not any(k.startswith('source') or k.startswith('original') for k in e) for uid,e in events)
 with Session(env[1]) as db:
  db.delete(db.get(Message,mid));db.commit();assert db.get(Message,m['id']).text=='Gönderilen metin'

@pytest.mark.parametrize('kind',['image','voice','video','document'])
def test_forward_media_has_new_independent_storage_and_url(env,kind):
 mid=media(env,kind);r=forward(env,[mid]);assert r.status_code==200,r.text
 m=r.json()['messages'][0];assert m['media_type']==kind and m['media_url']==f"/messages/target/{m['id']}/media" and m['media_name']=='ornek.pdf'
 with Session(env[1]) as db:
  assert db.get(MessageMedia,m['id']).data==b'%PDF-1.4 test'
  db.delete(db.get(Message,mid));db.commit();assert db.get(MessageMedia,m['id']).data==b'%PDF-1.4 test'

def test_retry_is_idempotent_and_key_cannot_be_reused_for_other_payload(env):
 a=add(env);b=add(env,'two');first=forward(env,[b,a,a]);second=forward(env,[a,b]);assert first.status_code==second.status_code==200
 assert second.json()['replayed'] and [m['id'] for m in first.json()['messages']]==[m['id'] for m in second.json()['messages']]
 assert forward(env,[b]).status_code==409
 with Session(env[1]) as db:assert len(list(db.scalars(select(Message).where(Message.conversation_id=='target'))))==2

@pytest.mark.parametrize('kind,code',[('hidden',404),('expired',404),('timed',403),('temporary',403),('system',403),('ephemeral',403),('absent',404),('cross',404),('missing_data',410)])
def test_source_privacy_rejects_whole_batch(env,kind,code):
 good=add(env);bad=media(env,temporary=kind=='temporary',data=None if kind=='missing_data' else b'bytes')
 with Session(env[1]) as db:
  if kind=='hidden':db.add(MessageHidden(user_id='a',message_id=bad))
  if kind in ('expired','timed'):db.get(Message,bad).expires_at=datetime.now(timezone.utc)+timedelta(seconds=-1 if kind=='expired' else 3600)
  if kind=='ephemeral':db.get(Conversation,'dm').is_ephemeral=True
  if kind=='system':db.get(Conversation,'dm').type='welcome'
  if kind=='cross':db.get(Message,bad).conversation_id='target'
  if kind=='absent':db.delete(db.get(Message,bad))
  db.commit()
 assert forward(env,[good,bad]).status_code==code
 with Session(env[1]) as db:
  assert not list(db.scalars(select(Message).where(Message.conversation_id=='target',Message.sender_id=='a')))
  assert not list(db.scalars(select(MessageForwardRequest)))

@pytest.mark.parametrize('kind,code',[('blocked',403),('blocking',403),('no_member',403),('locked_source',403),('locked_target',403),('system',400),('private',403),('gift_gate',402),('closed',409),('admins',403),('muted',403),('slow',429)])
def test_destination_gates_are_enforced(env,kind,code):
 mid=add(env);target='grp' if kind in ('closed','admins','muted','slow') else 'target';uid='b' if target=='grp' else 'a'
 with Session(env[1]) as db:
  if kind in ('blocking','blocked'):db.add(UserBlock(blocker_id='a' if kind=='blocking' else 'b',blocked_id='b' if kind=='blocking' else 'a'))
  if kind=='no_member':db.execute(delete(ConversationMember).where(ConversationMember.conversation_id=='target',ConversationMember.user_id=='a'))
  if kind.startswith('locked'):db.add(ConversationFolder(user_id='a',conversation_id='dm' if kind=='locked_source' else 'target',locked=True))
  if kind=='system':db.get(Conversation,'target').type='welcome'
  if kind=='private':db.add(PrivateProfileSetting(user_id='b',is_private=True))
  if kind=='gift_gate':db.add(DirectMessageRestriction(owner_id='b',enabled=True,gift_key='rose'))
  if kind in ('closed','admins','slow'):db.add(GroupSettings(conversation_id='grp',closed=kind=='closed',admins_only=kind=='admins',slow_seconds=60 if kind=='slow' else 0))
  if kind in ('muted','slow'):db.add(GroupControl(conversation_id='grp',user_id='b',banned=False,muted_until=datetime.now(timezone.utc)+timedelta(hours=1) if kind=='muted' else None,last_sent_at=datetime.now(timezone.utc)))
  db.commit()
 assert forward(env,[mid],target=target,uid=uid).status_code==code

@pytest.mark.parametrize('which',['source','target'])
def test_vault_unlock_permits_forward_only_for_token_owner(env,which):
 mid=add(env)
 with Session(env[1]) as db:
  db.add(ConversationFolder(user_id='a',conversation_id='dm' if which=='source' else 'target',locked=True))
  db.add(ConversationVaultSession(user_id='a',token_hash=hashlib.sha256(b'secret').hexdigest(),scope='access',expires_at=datetime.now(timezone.utc)+timedelta(minutes=1)));db.commit()
 assert forward(env,[mid],vault='wrong').status_code==403
 assert forward(env,[mid],vault='secret').status_code==200

def test_forward_into_ephemeral_target_applies_new_ttl(env):
 mid=add(env)
 with Session(env[1]) as db:db.get(Conversation,'target').is_ephemeral=True;db.commit()
 r=forward(env,[mid]);assert r.status_code==200
 with Session(env[1]) as db:assert db.get(Message,r.json()['messages'][0]['id']).expires_at is not None

def test_large_forward_rejected_before_copying(env,monkeypatch):
 mid=media(env);monkeypatch.setattr(ma,'MAX_FORWARD_BYTES',1);assert forward(env,[mid]).status_code==413

@pytest.mark.parametrize('payload',[{'message_ids':[],'target_conversation_id':'target','request_key':'1234567890123456'},
 {'message_ids':[1]*11,'target_conversation_id':'target','request_key':'1234567890123456'},
 {'message_ids':[1],'target_conversation_id':'target','request_key':'short'},
 {'message_ids':[-1],'target_conversation_id':'target','request_key':'1234567890123456'}])
def test_forward_schema(env,payload):assert request(env,'/dm/forward',payload).status_code==422

def test_reactions_set_change_remove_are_personal_and_idempotent(env):
 mid=add(env);assert react(env,mid).status_code==200
 assert react(env,mid).json()['reactions']==[{'emoji':'👍','count':1,'mine':True}]
 assert react(env,mid,uid='b').json()['reactions']==[{'emoji':'👍','count':2,'mine':True}]
 assert react(env,mid,'❤️').json()['reactions']==[{'emoji':'👍','count':1,'mine':False},{'emoji':'❤️','count':1,'mine':True}]
 assert react(env,mid,None).json()['reactions']==[{'emoji':'👍','count':1,'mine':False}]
 assert react(env,mid,None).status_code==200
 with Session(env[1]) as db:assert len(list(db.scalars(select(MessageReaction))))==1

@pytest.mark.parametrize('kind,code',[('hidden',404),('expired',404),('temporary',403),('outside',403),('blocked',403),('invalid',422),('closed',409),('muted',403),('locked',403)])
def test_reaction_gates(env,kind,code):
 cid='grp' if kind in ('closed','muted') else 'dm';mid=add(env,cid=cid);uid='outside' if kind=='outside' else 'b'
 with Session(env[1]) as db:
  if kind=='hidden':db.add(MessageHidden(user_id=uid,message_id=mid))
  if kind=='expired':db.get(Message,mid).expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)
  if kind=='temporary':db.add(MessageMedia(message_id=mid,media_type='image',mime_type='image/png',data=b'bytes',temporary=True))
  if kind=='blocked':db.add(UserBlock(blocker_id='a',blocked_id='b'))
  if kind=='closed':db.add(GroupSettings(conversation_id='grp',closed=True))
  if kind=='muted':db.add(GroupControl(conversation_id='grp',user_id='b',muted_until=datetime.now(timezone.utc)+timedelta(hours=1),banned=False))
  if kind=='locked':db.add(ConversationFolder(user_id=uid,conversation_id=cid,locked=True))
  db.commit()
 assert react(env,mid,'<script>' if kind=='invalid' else '👍',uid,cid).status_code==code

def test_reactions_and_forward_markers_cascade_on_message_deletion(env):
 mid=add(env);react(env,mid);r=forward(env,[mid]);new=r.json()['messages'][0]['id']
 with Session(env[1]) as db:
  db.delete(db.get(Message,mid));db.delete(db.get(Message,new));db.commit()
  assert not list(db.scalars(select(MessageReaction))) and not list(db.scalars(select(ForwardedMessage)))
 assert forward(env,[mid]).json()['messages']==[]

def test_actual_gift_cannot_be_forwarded(env):
 mid=add(env)
 with Session(env[1]) as db:
  db.add(DirectMessageGift(message_id=mid,sender_id='a',recipient_id='b',gift_key='rose',unit_price=10,recipient_amount=5));db.commit()
 assert forward(env,[mid]).status_code==403

def test_feature_ban_blocks_both_actions(env,monkeypatch):
 mid=add(env)
 def deny(*args):raise HTTPException(403,'DM kısıtlandı')
 monkeypatch.setitem(ns,'require_feature',deny)
 assert forward(env,[mid]).status_code==403 and react(env,mid).status_code==403

@pytest.mark.parametrize('status',['pending','rejected'])
def test_unaccepted_private_request_blocks_both_actions(env,status):
 mid=add(env)
 with Session(env[1]) as db:
  db.add(PrivateProfileSetting(user_id='b',is_private=True));db.add(PrivateMessageRequest(sender_id='a',recipient_id='b',conversation_id='dm',status=status));db.commit()
 assert forward(env,[mid]).status_code==403 and react(env,mid).status_code==403

def test_gift_unlock_and_accepted_request_permit_actions(env):
 mid=add(env)
 with Session(env[1]) as db:
  db.add(PrivateProfileSetting(user_id='b',is_private=True));db.add(PrivateMessageRequest(sender_id='a',recipient_id='b',conversation_id='dm',status='accepted'))
  db.add(DirectMessageRestriction(owner_id='b',enabled=True,gift_key='rose'))
  db.add(DirectMessageUnlock(owner_id='b',sender_id='a',gift_key='rose'));db.commit()
 assert forward(env,[mid]).status_code==200 and react(env,mid).status_code==200

def test_metadata_is_viewer_scoped_and_does_not_mark_read(env):
 mid=add(env);react(env,mid)
 r=env[0].get(f'/v1/message-actions/dm/{mid}/metadata',headers={'Authorization':'Bearer b'})
 assert r.status_code==200 and r.json()['reactions']==[{'emoji':'👍','count':1,'mine':False}]
 assert env[0].get(f'/v1/message-actions/dm/{mid}/metadata',headers={'Authorization':'Bearer outside'}).status_code==403
 with Session(env[1]) as db:
  db.add(MessageHidden(user_id='b',message_id=mid));db.commit()
 assert env[0].get(f'/v1/message-actions/dm/{mid}/metadata',headers={'Authorization':'Bearer b'}).status_code==404

def test_closed_source_group_can_forward_existing_readable_history(env):
 mid=add(env,cid='grp')
 with Session(env[1]) as db:db.add(GroupSettings(conversation_id='grp',closed=True));db.commit()
 r=request(env,'/grp/forward',{'message_ids':[mid],'target_conversation_id':'target','request_key':'source_closed_request'})
 assert r.status_code==200,r.text

def test_revoked_source_group_member_cannot_forward(env):
 mid=add(env,cid='grp')
 with Session(env[1]) as db:
  db.execute(delete(ConversationMember).where(ConversationMember.conversation_id=='grp',ConversationMember.user_id=='b'));db.commit()
 assert request(env,'/grp/forward',{'message_ids':[mid],'target_conversation_id':'target','request_key':'source_revoked_request'},uid='b').status_code==403
