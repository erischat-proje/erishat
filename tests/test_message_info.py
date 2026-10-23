"""Sender-only receipt roster and page-batched, membership-aware summaries."""
from datetime import datetime,timedelta,timezone
import hashlib
import pytest
from sqlalchemy import select,delete,event
from sqlalchemy.orm import Session
from test_message_tools import env as base_env,app,add,events
from test_message_actions import env as action_env,ns as action_ns
from app import message_info as mi
from app.models import Conversation,ConversationMember,Message,User
from app.platform_models import ConversationReadState,ConversationFolder,ConversationVaultSession,MessageHidden,MessageMedia,PrivateMessageRequest,Family
from app.message_attachment_models import MessageAttachment
from app.message_detail_models import MessageDetail
from app.group_models import GroupSettings
from app.schemas import MessageOut
app.include_router(mi.router)

@pytest.fixture
def env(action_env):
 with Session(action_env[1]) as db:
  for member in db.scalars(select(ConversationMember)):member.joined_at=datetime.now(timezone.utc)-timedelta(days=2)
  db.commit()
 return action_env

def request(env,mid,cid='dm',uid='a',query='',token=None):
 headers={'Authorization':'Bearer '+uid}
 if token:headers['X-Eris-DM-Vault']=token
 return env[0].get(f'/v1/message-info/{cid}/{mid}'+query,headers=headers)
def reads(env,uid,mid,cid='dm'):
 with Session(env[1]) as db:
  row=db.scalar(select(ConversationReadState).where(ConversationReadState.conversation_id==cid,ConversationReadState.user_id==uid))
  if row:row.last_read_message_id=mid
  else:db.add(ConversationReadState(conversation_id=cid,user_id=uid,last_read_message_id=mid))
  db.commit()

def test_dm_receipt_roster_and_info_get_has_no_read_side_effect(env):
 mid=add(env);data=request(env,mid).json();assert data['recipient_count']==1 and data['read_count']==0 and not data['is_read']
 assert data['recipients']==[{'user_id':'b','nickname':'b','is_read':False}]
 reads(env,'b',mid);data=request(env,mid).json();assert data['is_read'] and data['read_count']==1
 assert 'read_at' not in str(data) and not events
 with Session(env[1]) as db:assert db.scalar(select(ConversationReadState).where(ConversationReadState.user_id=='a')) is None

@pytest.mark.parametrize('kind,code',[('other_sender',403),('outside',403),('cross',404),('missing',404),('hidden',404),('expired',404),('locked',403),('temporary',403),('system',403),('pending',403),('left',403)])
def test_information_privacy(env,kind,code):
 cid='system' if kind=='system' else 'dm';mid=add(env,cid=cid,sender='b' if kind=='other_sender' else 'a')
 with Session(env[1]) as db:
  if kind=='hidden':db.add(MessageHidden(message_id=mid,user_id='a'))
  if kind=='expired':db.get(Message,mid).expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)
  if kind=='locked':db.add(ConversationFolder(conversation_id='dm',user_id='a',locked=True))
  if kind=='temporary':db.add(MessageMedia(message_id=mid,media_type='image',mime_type='image/png',data=b'private',temporary=True))
  if kind=='pending':db.add(PrivateMessageRequest(conversation_id='dm',sender_id='b',recipient_id='a',status='pending'))
  if kind=='left':db.execute(delete(ConversationMember).where(ConversationMember.conversation_id=='dm',ConversationMember.user_id=='a'))
  db.commit()
 r=request(env,999999 if kind=='missing' else mid,cid='target' if kind=='cross' else cid,uid='outside' if kind=='outside' else 'a');assert r.status_code==code,r.text

def test_vault_token_is_required_for_its_owner(env):
 mid=add(env)
 with Session(env[1]) as db:
  db.add(ConversationFolder(conversation_id='dm',user_id='a',locked=True));db.add(ConversationVaultSession(user_id='a',token_hash=hashlib.sha256(b'secret').hexdigest(),scope='access',expires_at=datetime.now(timezone.utc)+timedelta(minutes=1)));db.commit()
 assert request(env,mid,token='wrong').status_code==403
 assert request(env,mid,token='secret').status_code==200
 assert request(env,mid,uid='b',token='secret').status_code==403

@pytest.mark.parametrize('cid',['grp','familychat'])
def test_group_and_family_wait_for_all_eligible_recipients(env,cid):
 with Session(env[1]) as db:
  if cid=='familychat':
   db.add(Conversation(id=cid,type='family'));db.flush();db.add(Family(id='family',owner_id='a',name='Aile',chat_conversation_id=cid));db.flush()
   for uid in ['a','b']:db.add(ConversationMember(conversation_id=cid,user_id=uid,joined_at=datetime.now(timezone.utc)-timedelta(days=1)))
  db.add(ConversationMember(conversation_id=cid,user_id='outside',joined_at=datetime.now(timezone.utc)-timedelta(days=1)));db.commit()
 mid=add(env,cid=cid);reads(env,'b',mid,cid);data=request(env,mid,cid).json()
 assert data['read_count']==1 and data['recipient_count']==2 and not data['is_read']
 assert {r['user_id'] for r in data['recipients'] if r['is_read']}=={'b'}
 reads(env,'outside',mid,cid);assert request(env,mid,cid).json()['is_read']
 with Session(env[1]) as db:
  message=db.get(Message,mid);summary=mi.summaries(db,[message],'a')[mid];assert summary=={'read_count':2,'recipient_count':2,'is_read':True}


def test_later_joiners_and_departed_members_are_excluded(env):
 mid=add(env,cid='grp')
 with Session(env[1]) as db:
  db.add(ConversationMember(conversation_id='grp',user_id='outside',joined_at=datetime.now(timezone.utc)+timedelta(seconds=1)));db.commit()
 reads(env,'b',mid,'grp');assert request(env,mid,'grp').json()['recipient_count']==1
 with Session(env[1]) as db:db.execute(delete(ConversationMember).where(ConversationMember.conversation_id=='grp',ConversationMember.user_id=='b'));db.commit()
 data=request(env,mid,'grp').json();assert data['recipients']==[] and data['recipient_count']==0 and not data['is_read']
 with Session(env[1]) as db:assert mi.summaries(db,[db.get(Message,mid)],'a')[mid]['is_read'] is False


def test_read_watermark_applies_only_up_to_its_message(env):
 a,b=add(env),add(env);reads(env,'b',a)
 with Session(env[1]) as db:
  rows=list(db.scalars(select(Message).order_by(Message.id)));s=mi.summaries(db,rows,'a');assert s[a]['is_read'] and not s[b]['is_read'];assert mi.summaries(db,rows,'b')=={}
 assert request(env,b).json()['read_count']==0


def test_pagination_filters_counts_and_literal_names(env):
 with Session(env[1]) as db:
  for i in range(62):
   uid='person'+str(i);db.add(User(id=uid,public_id=str(2000000000+i),_nickname='<img src=x>' if i==0 else uid,_avatar='x',is_active=True));db.flush();db.add(ConversationMember(conversation_id='grp',user_id=uid,joined_at=datetime.now(timezone.utc)-timedelta(days=1)))
  db.commit()
 mid=add(env,cid='grp');reads(env,'person0',mid,'grp')
 first=request(env,mid,'grp',query='?limit=30').json();assert len(first['recipients'])==30 and first['has_more'] and first['recipient_count']==63
 second=request(env,mid,'grp',query='?limit=30&after='+str(first['next_after'])).json();assert len(second['recipients'])==30 and second['has_more']
 third=request(env,mid,'grp',query='?after='+str(second['next_after'])).json();assert len(third['recipients'])==3 and not third['has_more']
 assert len({x['user_id'] for data in [first,second,third] for x in data['recipients']})==63
 seen=request(env,mid,'grp',query='?view=read').json();assert seen['read_count']==1 and seen['recipients'][0]['nickname']=='<img src=x>'
 unseen=request(env,mid,'grp',query='?view=unread&limit=50').json();assert len(unseen['recipients'])==50 and all(not x['is_read'] for x in unseen['recipients'])

@pytest.mark.parametrize('query',['?view=bad','?after=0','?limit=51'])
def test_invalid_paging_and_filter(env,query):assert request(env,add(env),query=query).status_code==422


def test_metadata_uses_real_message_and_does_not_load_media_bytes(env):
 mid=add(env)
 with Session(env[1]) as db:
  db.add(MessageMedia(message_id=mid,media_type='document',mime_type='application/pdf',data=b'private binary',temporary=False));db.add(MessageAttachment(message_id=mid,filename='<script>.pdf',size_bytes=14));db.add(MessageDetail(message_id=mid,edited_at=datetime.now(timezone.utc)));db.commit()
 queries=[]
 def track(conn,cursor,sql,params,ctx,many):queries.append(sql)
 event.listen(env[1],'before_cursor_execute',track)
 try:r=request(env,mid)
 finally:event.remove(env[1],'before_cursor_execute',track)
 assert r.status_code==200,r.text;data=r.json();assert data['message']['media_name']=='<script>.pdf' and data['message']['edited_at']
 assert 'private binary' not in r.text and not any('message_media.data' in q for q in queries)


def test_batch_summaries_and_production_serializer(env):
 ids=[add(env,cid='grp') for _ in range(40)];reads(env,'b',ids[-1],'grp')
 with Session(env[1]) as db:
  rows=list(db.scalars(select(Message).order_by(Message.id)));queries=[]
  def track(conn,cursor,sql,params,ctx,many):queries.append(sql)
  event.listen(env[1],'before_cursor_execute',track)
  try:receipts=mi.summaries(db,rows,'a')
  finally:event.remove(env[1],'before_cursor_execute',track)
  assert len(queries)<=2 and len(receipts)==40
  context={'receipts':receipts,'pinned':set(),'gifts':{},'media':{},'read':0}
  data=action_ns['_message_out'](db,rows[0],'a',context);assert MessageOut.model_validate(data).is_read and data['read_count']==1


def test_closed_group_history_remains_readable(env):
 mid=add(env,cid='grp')
 with Session(env[1]) as db:db.add(GroupSettings(conversation_id='grp',closed=True));db.commit()
 assert request(env,mid,'grp').status_code==200
