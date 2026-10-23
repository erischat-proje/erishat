"""Caption mutations use the same edit permission boundary as text messages."""
from datetime import datetime,timedelta,timezone
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_message_captions import env,attachment_env,base_env,upload,videos
from test_message_tools import events,add
from app.models import Message
from app.platform_models import MessageMedia,MessageHidden,UserBlock,ConversationFolder,PrivateMessageRequest
from app.message_detail_models import MessageDetail
from app.group_models import GroupSettings,GroupControl
from app import message_tools as mt

def edit(env,m,caption='Yeni açıklama',who='a',expected=None,cid=None):
 return env[0].patch('/v1/message-tools/'+(cid or m['conversation_id'])+'/'+str(m['id'])+'/caption',headers={'Authorization':'Bearer '+who},json={'caption':caption,'expected_text':m['text'] if expected is None else expected})

@pytest.mark.parametrize('kind',['image','video','document'])
def test_add_replace_remove_history_search_and_original_bytes(env,videos,kind):
 m=upload(env,kind,data=videos[1] if kind=='video' else b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n').json()
 with Session(env[1]) as db:original=db.get(MessageMedia,m['id']).data
 for caption in ['İlkbenzersiz açıklama','Yeniunique <script>\nİkinci','']:
  r=edit(env,m,caption);assert r.status_code==200,r.text;m=r.json();assert m['caption']==(caption or None);assert m['edited_at']
  history=env[0].get('/v1/message-tools/dm/history',headers={'Authorization':'Bearer b'}).json()['messages'];assert history[0]['caption']==(caption or None)
  with Session(env[1]) as db:assert db.get(MessageMedia,m['id']).data==original
  if caption.startswith('Yeniunique'):
   found=env[0].get('/v1/message-search?q=Yeniunique',headers={'Authorization':'Bearer a'}).json();assert found['items'][0]['message']['id']==m['id']
   assert env[0].get('/v1/message-search?q=İlkbenzersiz',headers={'Authorization':'Bearer a'}).json()['items']==[]
 assert '\n' not in m['text']
 assert events and all('text' not in e and 'caption' not in e for uid,e in events if e['type']=='dm_message_updated')

@pytest.mark.parametrize('who,code',[('b',403),('outside',403)])
def test_other_sender_or_nonmember_cannot_edit(env,who,code):
 m=upload(env).json();assert edit(env,m,who=who).status_code==code

def test_stale_expected_text_is_conflict_not_overwrite(env):
 m=upload(env,caption='Eski').json();first=edit(env,m,'Yeni').json();assert edit(env,m,'Üzerine yazılmasın').status_code==409
 with Session(env[1]) as db:assert db.get(Message,m['id']).text==first['text']

@pytest.mark.parametrize('value',['x'*1001,'bozuk\x00','bozuk\x01','bozuk\x7f'])
def test_invalid_caption_is_rejected_without_change(env,value):
 m=upload(env,caption='Eski').json();assert edit(env,m,value).status_code==422
 with Session(env[1]) as db:assert db.get(Message,m['id']).text==m['text'] and db.get(MessageDetail,m['id']) is None

def test_whitespace_normalization_limit_and_idempotence(env):
 m=upload(env,caption='Eski').json();r=edit(env,m,'  İlk\r\nİkinci\rÜçüncü  ');assert r.status_code==200,r.text;m=r.json();assert m['caption']=='İlk\nİkinci\nÜçüncü'
 same=edit(env,m,m['caption']).json();assert mt.utc(datetime.fromisoformat(same['edited_at']))==mt.utc(datetime.fromisoformat(m['edited_at']))
 m=edit(env,m,'x'*1000).json();assert len(m['caption'])==1000
 assert edit(env,m,' \n\t ').json()['caption'] is None

@pytest.mark.parametrize('state',['old','hidden','expired','missing','temporary','voice','block','pending','locked','no-data'])
def test_caption_edit_respects_existing_visibility_and_write_rules(env,state):
 m=upload(env,caption='Eski').json();code=403
 with Session(env[1]) as db:
  row=db.get(Message,m['id']);media=db.get(MessageMedia,m['id'])
  if state=='old':row.created_at=datetime.now(timezone.utc)-timedelta(minutes=16)
  if state=='hidden':db.add(MessageHidden(message_id=m['id'],user_id='a'));code=404
  if state=='expired':row.expires_at=datetime.now(timezone.utc)-timedelta(seconds=1);code=404
  if state=='missing':db.delete(row);code=404
  if state=='temporary':media.temporary=True
  if state=='voice':media.media_type='voice'
  if state=='block':db.add(UserBlock(blocker_id='b',blocked_id='a'))
  if state=='pending':db.add(PrivateMessageRequest(conversation_id='dm',sender_id='a',recipient_id='b',status='pending'))
  if state=='locked':db.add(ConversationFolder(conversation_id='dm',user_id='a',locked=True))
  if state=='no-data':media.data=None;code=404
  db.commit()
 r=edit(env,m);assert r.status_code==code,r.text

@pytest.mark.parametrize('gate',['closed','admins','muted'])
def test_group_write_controls_apply_to_caption_edit(env,gate):
 m=upload(env,cid='grp',who='b',caption='Eski').json()
 with Session(env[1]) as db:
  if gate in ['closed','admins']:db.add(GroupSettings(conversation_id='grp',closed=gate=='closed',admins_only=gate=='admins'))
  if gate=='muted':
   control=db.scalar(select(GroupControl).where(GroupControl.conversation_id=='grp',GroupControl.user_id=='b'));control.muted_until=datetime.now(timezone.utc)+timedelta(hours=1)
  db.commit()
 assert edit(env,m,who='b').status_code==(409 if gate=='closed' else 403)

def test_caption_endpoint_does_not_edit_regular_text_or_bypass_text_endpoint(env):
 mid=add(env);r=edit(env,dict(id=mid,conversation_id='dm',text='İlk metin'));assert r.status_code==403
 m=upload(env).json();r=env[0].patch('/v1/message-tools/dm/'+str(m['id']),headers={'Authorization':'Bearer a'},json={'text':'Dosyayı metne çevirme','expected_text':m['text']});assert r.status_code==403

def test_forwarded_copy_keeps_caption_when_source_is_edited(env):
 m=upload(env,caption='İletilen sürüm').json();r=env[0].post('/v1/message-actions/dm/forward',headers={'Authorization':'Bearer a'},json={'message_ids':[m['id']],'target_conversation_id':'target','request_key':'caption_edit_forward_123'});assert r.status_code==200,r.text
 copy=r.json()['messages'][0];assert edit(env,m,'Sonraki sürüm').status_code==200
 with Session(env[1]) as db:assert db.get(Message,copy['id']).text.endswith('İletilen sürüm')
