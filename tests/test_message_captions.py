"""Caption upload roundtrip, permissions, search, forwarding and legacy compatibility."""
from io import BytesIO
from datetime import datetime,timedelta,timezone
import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_message_tools import env as base_env,app,events
from test_message_attachments import env as attachment_env,ns as media_ns,PDF,videos
from test_message_actions import ns as action_ns
from app import message_actions as ma,message_search as ms
from app.models import Conversation,ConversationMember,Message
from app.platform_models import PrivateProfileSetting,MessageMedia,ConversationFolder
from app.message_action_models import MessageReaction,MessageForwardRequest,ForwardedMessage
from app.group_models import GroupSettings,GroupControl
app.include_router(ms.router)

@pytest.fixture
def env(attachment_env,monkeypatch):
 client,engine=attachment_env
 for cls in [PrivateProfileSetting,MessageReaction,MessageForwardRequest,ForwardedMessage]:cls.__table__.create(engine,checkfirst=True)
 monkeypatch.setattr(ma,'_serialize',lambda db,m,uid:media_ns['_message_out'](db,m,uid))
 with Session(engine) as db:
  db.add(Conversation(id='target',type='dm'));db.flush()
  for uid in ['a','b']:db.add(ConversationMember(conversation_id='target',user_id=uid))
  db.commit()
 return client,engine

def upload(env,kind='document',caption='',who='a',cid='dm',seconds=0,data=PDF):
 if kind=='image':
  buf=BytesIO();Image.new('RGB',(2,2),'gold').save(buf,'PNG');data=buf.getvalue()
 filename,mime={'document':('rapor.pdf','application/pdf'),'image':('resim.png','image/png'),'video':('video.mp4','video/mp4'),'voice':('ses.webm','audio/webm')}[kind]
 return env[0].post('/v1/messages/'+cid+'/media',headers={'Authorization':'Bearer '+who},data={'media_type':kind,'view_seconds':str(seconds),'caption':caption},files={'file':(filename,data,mime)})

@pytest.mark.parametrize('kind',['image','video','document'])
def test_caption_roundtrip_search_and_download_preserves_original_media(env,videos,kind):
 caption='Açıklama <script> 👋\nİkinci satır';data=videos[1] if kind=='video' else PDF
 r=upload(env,kind,caption,data=data);assert r.status_code==201,r.text;m=r.json();assert m['caption']==caption and m['text'].endswith('\n'+caption)
 assert all(e.get('caption')==caption for uid,e in events)
 history=env[0].get('/v1/message-tools/dm/history',headers={'Authorization':'Bearer b'}).json()['messages'];assert history[0]['caption']==caption
 result=env[0].get('/v1/message-search',params={'q':'İkinci'},headers={'Authorization':'Bearer a'});assert result.status_code==200,result.text;assert result.json()['items'][0]['message']['id']==m['id']
 download=env[0].get(f"/v1/messages/dm/{m['id']}/media",headers={'Authorization':'Bearer b'});assert download.status_code==200
 with Session(env[1]) as db:assert download.content==db.get(MessageMedia,m['id']).data

@pytest.mark.parametrize('kind',['image','video','document'])
def test_legacy_no_caption_format_is_unchanged(env,videos,kind):
 r=upload(env,kind,data=videos[1] if kind=='video' else PDF);assert r.status_code==201,r.text
 assert r.json()['caption'] is None and r.json()['text']=={'image':'[Fotoğraf]','video':'[Video]','document':'[Belge] rapor.pdf'}[kind]


def test_whitespace_and_line_endings_are_normalized(env):
 r=upload(env,caption='  İlk satır\r\nİkinci\rÜçüncü\tson  ');assert r.status_code==201,r.text
 assert r.json()['caption']=='İlk satır\nİkinci\nÜçüncü\tson'
 assert upload(env,caption=' \n\t ').json()['caption'] is None


def test_limit_and_control_characters_reject_without_inserting_message(env):
 assert upload(env,caption='x'*1000).status_code==201
 for caption in ['x'*1001,'kontrol\x00','kontrol\x01','kontrol\x7f']:
  r=upload(env,caption=caption);assert r.status_code==422,r.text
 with Session(env[1]) as db:assert len(list(db.scalars(select(Message))))==1

@pytest.mark.parametrize('kind,seconds',[('image',10),('voice',0)])
def test_temporary_photo_and_voice_do_not_accept_caption(env,kind,seconds):
 r=upload(env,kind,caption='Kalıcı açıklama olmasın',seconds=seconds);assert r.status_code==422,r.text
 with Session(env[1]) as db:assert not list(db.scalars(select(Message)))

@pytest.mark.parametrize('gate',['closed','admins','muted','locked','outside'])
def test_caption_does_not_bypass_existing_write_permissions(env,gate):
 uid='outside' if gate=='outside' else 'b';cid='dm' if gate=='locked' else 'grp'
 with Session(env[1]) as db:
  if gate in ['closed','admins']:db.add(GroupSettings(conversation_id='grp',closed=gate=='closed',admins_only=gate=='admins'))
  if gate=='muted':db.add(GroupControl(conversation_id='grp',user_id='b',banned=False,muted_until=datetime.now(timezone.utc)+timedelta(hours=1)))
  if gate=='locked':db.add(ConversationFolder(user_id='b',conversation_id='dm',locked=True))
  db.commit()
 r=upload(env,caption='Korunan açıklama',who=uid,cid=cid);assert r.status_code==(409 if gate=='closed' else 403),r.text
 with Session(env[1]) as db:assert not list(db.scalars(select(Message)))


def test_forward_keeps_caption_in_response_event_and_history_after_source_delete(env):
 original=upload(env,caption='İletilecek açıklama').json();events.clear()
 r=env[0].post('/v1/message-actions/dm/forward',headers={'Authorization':'Bearer a'},json={'message_ids':[original['id']],'target_conversation_id':'target','request_key':'caption_forward_12345'});assert r.status_code==200,r.text
 forwarded=r.json()['messages'][0];assert forwarded['caption']=='İletilecek açıklama'
 assert events and all(e.get('caption')=='İletilecek açıklama' and e['forwarded'] for uid,e in events)
 with Session(env[1]) as db:db.delete(db.get(Message,original['id']));db.commit()
 history=env[0].get('/v1/message-tools/target/history',headers={'Authorization':'Bearer b'}).json()['messages'];assert history[0]['caption']=='İletilecek açıklama'
