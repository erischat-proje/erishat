"""Production media upload/download handlers plus shared gallery and file validators."""
import ast,asyncio,hashlib,io,logging,subprocess,zipfile
from datetime import datetime,timedelta,timezone
import pytest
from fastapi import File,Form,UploadFile,Response,Query,HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from PIL import Image,ImageFilter
from test_message_tools import env as base_env,app,main_ns,call,add,ROOT
from app import message_attachments as attachments,message_tools as mt
from app.message_attachment_models import MessageAttachment
from app.models import Message,Conversation,ConversationMember
from app.platform_models import MessageMedia,MessageHidden,ConversationFolder,UserBlock
from app.social_media import validate_social_video
from app.db import Base

ns=dict(main_ns,Conversation=Conversation,ConversationMember=ConversationMember,File=File,Form=Form,UploadFile=UploadFile,MessageAttachment=MessageAttachment,
    MessageMedia=MessageMedia,MessageHidden=MessageHidden,datetime=datetime,timedelta=timedelta,
    timezone=timezone,Response=Response,Query=Query,BytesIO=io.BytesIO,Image=Image,ImageFilter=ImageFilter,
    message_attachments=attachments,logger=logging.getLogger('test-attachment'))
tree=ast.parse((ROOT/'backend/app/main.py').read_text())
for name in ['_message_out','_require_message_media_access','_temporary_photo_expired_for_viewer','_blur_temporary_photo','send_message_media','get_message_media']:
 node=next(n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name);node.decorator_list=[]
 exec(compile(ast.Module(body=[node],type_ignores=[]),'production-media-handler','exec'),ns)
app.add_api_route('/v1/messages/{conversation_id}/media',ns['send_message_media'],methods=['POST'],status_code=201)
app.add_api_route('/v1/messages/{conversation_id}/{message_id}/media',ns['get_message_media'],methods=['GET'])

@pytest.fixture
def env(base_env,monkeypatch):
 client,engine=base_env;Base.metadata.create_all(engine,tables=[MessageAttachment.__table__])
 def context(db,rows,uid):
  ids=[m.id for m in rows]
  return {'details':mt.extras(db,rows,uid),'senders':{},'pinned':set(),'gifts':{},'read':0,
      'media':{m.message_id:m for m in db.scalars(select(MessageMedia).where(MessageMedia.message_id.in_(ids)))},
      'attachments':{a.message_id:a for a in db.scalars(select(MessageAttachment).where(MessageAttachment.message_id.in_(ids)))}}
 from app import performance_queries
 monkeypatch.setattr(performance_queries,'message_context',context)
 ns['message_context']=context
 monkeypatch.setattr(mt,'_serialize',ns['_message_out'])
 yield client,engine

PDF=b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'
def upload(env,data=PDF,name='ornek.pdf',kind='document',mime='application/pdf',who='a',cid='dm',seconds=0):
 return env[0].post('/v1/messages/'+cid+'/media',headers={'Authorization':'Bearer '+who},data={'media_type':kind,'view_seconds':str(seconds)},files={'file':(name,data,mime)})
def download(env,mid,who='b',cid='dm',suffix=''):
 return env[0].get('/v1/messages/'+cid+'/'+str(mid)+'/media'+suffix,headers={'Authorization':'Bearer '+who})

@pytest.fixture(scope='module')
def videos(tmp_path_factory):
 directory=tmp_path_factory.mktemp('videos');result={}
 for seconds in [1,31,121]:
  target=directory/(str(seconds)+'.mp4')
  cmd=['ffmpeg','-v','error','-f','lavfi','-i',f'color=c=blue:s=64x64:r=10:d={seconds}']
  if seconds==1:cmd+=['-f','lavfi','-i','sine=frequency=500:duration=1']
  cmd+=['-c:v','libx264','-pix_fmt','yuv420p']
  if seconds==1:cmd+=['-c:a','aac','-shortest']
  cmd+=['-y',str(target)];subprocess.run(cmd,check=True,capture_output=True);result[seconds]=target.read_bytes()
 return result

def test_document_upload_metadata_and_safe_download(env):
 r=upload(env,name='rapor <img>.pdf');assert r.status_code==201,r.text
 result=r.json();assert result['media_type']=='document' and result['media_name']=='rapor <img>.pdf' and result['media_size']==len(PDF)
 d=download(env,result['id']);assert d.status_code==200 and d.content==PDF
 assert d.headers['content-disposition'].startswith('attachment;')
 assert 'filename*=UTF-8' in d.headers['content-disposition'] and '%3Cimg%3E' in d.headers['content-disposition']
 assert d.headers['x-content-type-options']=='nosniff' and 'sandbox' in d.headers['content-security-policy']
 with Session(env[1]) as db:assert 'data' not in db.get(MessageMedia,result['id']).__dict__

@pytest.mark.parametrize('name,data,mime',[
 ('a.txt','Türkçe metin'.encode(),'text/plain'),('a.csv',b'isim,sayi\nKaan,2\n','text/csv')])
def test_text_documents(env,name,data,mime):
 r=upload(env,data,name,mime=mime);assert r.status_code==201,r.text
 assert download(env,r.json()['id']).content==data

@pytest.mark.parametrize('extension,part',[('zip',None),('docx','word/document.xml'),('xlsx','xl/workbook.xml'),('pptx','ppt/presentation.xml')])
def test_archive_and_office_documents(env,extension,part):
 buf=io.BytesIO()
 with zipfile.ZipFile(buf,'w') as z:
  z.writestr('[Content_Types].xml','<Types/>');z.writestr(part or 'hello.txt','test')
 r=upload(env,buf.getvalue(),'belge.'+extension,mime='application/octet-stream');assert r.status_code==201,r.text
 d=download(env,r.json()['id']);assert d.status_code==200
 assert len(d.headers['content-type'])<=64

@pytest.mark.parametrize('name,data',[('fake.pdf',b'not-pdf'),('empty.pdf',b''),('a.exe',PDF),('a.html',b'<html>'),('a.txt',b'abc\x00'),('a.txt',b'\xff\xff'),('fake.docx',b'PK\x03\x04broken')])
def test_invalid_documents_rejected_without_persistence(env,name,data):
 before=call(env,'a','GET','/dm/history').json()['messages'];r=upload(env,data,name);assert r.status_code in (413,415),r.text
 assert call(env,'a','GET','/dm/history').json()['messages']==before

def test_filename_controls_paths_and_long_names():
 assert attachments.safe_name('../folder/rapor\r\n.pdf')=='rapor.pdf'
 assert attachments.safe_name('C:\\users\\rapor.pdf')=='rapor.pdf'
 assert len(attachments.safe_name('x'*200+'.pdf'))<=150
 assert len(attachments.safe_name('😀'*120+'.pdf').encode('utf-8'))<=180
 assert '\u202e' not in attachments.safe_name('rapor\u202e.pdf')

@pytest.mark.parametrize('kind,limit',[('document',20),('video',25)])
def test_file_size_caps(env,kind,limit):
 r=upload(env,b'x'*(limit*1024*1024+1),'a.pdf' if kind=='document' else 'a.mp4',kind=kind,mime='video/mp4' if kind=='video' else 'application/pdf');assert r.status_code==413

def test_real_video_with_audio_roundtrip_and_no_transcode(env,videos):
 r=upload(env,videos[1],'sesli.mp4',kind='video',mime='video/mp4');assert r.status_code==201,r.text
 result=r.json();assert result['media_type']=='video'
 d=download(env,result['id']);assert d.status_code==200 and hashlib.sha256(d.content).digest()==hashlib.sha256(videos[1]).digest()
 import av
 with av.open(io.BytesIO(d.content)) as c:assert len(c.streams.audio)==1 and len(c.streams.video)==1


def test_chat_video_duration_does_not_change_story_limit(env,videos):
 assert upload(env,videos[31],'uzun.mp4',kind='video',mime='video/mp4').status_code==201
 with pytest.raises(HTTPException) as error:validate_social_video(videos[31])
 assert error.value.status_code==422
 assert upload(env,videos[121],'fazla.mp4',kind='video',mime='video/mp4').status_code==422
 assert upload(env,b'\x00\x00\x00\x10ftypbad','fake.mp4',kind='video',mime='video/mp4').status_code==415

@pytest.mark.parametrize('mode',['outsider','blocked','locked','private_request','group_closed','group_muted'])
def test_upload_permission_guards(env,mode,monkeypatch):
 who='a';cid='dm'
 with Session(env[1]) as db:
  if mode=='outsider':who='outside'
  elif mode=='blocked':db.add(UserBlock(blocker_id='b',blocked_id='a'))
  elif mode=='locked':db.add(ConversationFolder(user_id='a',conversation_id='dm',locked=True,archived=False))
  elif mode=='private_request':
   def deny(*args,**kwargs):raise HTTPException(403,'Mesaj isteği bekleniyor')
   monkeypatch.setitem(ns,'_dm_request_gate',deny)
  else:
   from app.group_models import GroupSettings,GroupControl
   cid='grp';who='b'
   if mode=='group_closed':db.add(GroupSettings(conversation_id='grp',closed=True))
   else:db.add(GroupControl(conversation_id='grp',user_id='b',banned=False,muted_until=datetime.now(timezone.utc)+timedelta(hours=1)))
  db.commit()
 assert upload(env,who=who,cid=cid).status_code in (403,409)

@pytest.mark.parametrize('action',['leave','block'])
def test_permissions_rechecked_after_read_before_commit(env,action):
 from app.models import User
 class ChangedUpload:
  content_type='application/pdf';filename='a.pdf'
  async def read(self,size):
   with Session(env[1]) as other:
    if action=='leave':
     row=other.scalar(select(ConversationMember).where(ConversationMember.conversation_id=='grp',ConversationMember.user_id=='b'));other.delete(row)
    else:other.add(UserBlock(blocker_id='a',blocked_id='b'))
    other.commit()
   return PDF
 with Session(env[1],expire_on_commit=False) as db:
  cid='grp' if action=='leave' else 'dm';user=db.get(User,'b')
  with pytest.raises(HTTPException) as err:asyncio.run(ns['send_message_media'](conversation_id=cid,file=ChangedUpload(),media_type='document',view_seconds=0,caption='',x_eris_dm_vault=None,db=db,user=user))
  assert err.value.status_code==403
  db.rollback();assert not list(db.scalars(select(Message)))

@pytest.mark.parametrize('reason',['hidden','expired','outsider','wrong_conversation'])
def test_download_and_gallery_enforce_visibility(env,reason):
 r=upload(env);mid=r.json()['id']
 with Session(env[1]) as db:
  if reason=='hidden':db.add(MessageHidden(message_id=mid,user_id='b'))
  if reason=='expired':db.get(Message,mid).expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)
  db.commit()
 d=download(env,mid,who='outside' if reason=='outsider' else 'b',cid='private' if reason=='wrong_conversation' else 'dm');assert d.status_code in (403,404,410)
 if reason in ('hidden','expired'):assert call(env,'b','GET','/dm/shared').json()['messages']==[]

def test_shared_filters_search_pagination_and_temporary_exclusion(env):
 for i in range(34):assert upload(env,name=f'rapor-{i}.pdf').status_code==201
 buf=io.BytesIO();Image.new('RGB',(640,480),'gold').save(buf,'PNG')
 image=upload(env,buf.getvalue(),'resim.png',kind='image',mime='image/png');assert image.status_code==201
 temp=upload(env,buf.getvalue(),'sureli.png',kind='image',mime='image/png',seconds=10);assert temp.status_code==201
 page=call(env,'b','GET','/dm/shared').json();assert len(page['messages'])==30 and page['has_more']
 older=call(env,'b','GET','/dm/shared?before='+str(page['next_before'])).json();assert len(older['messages'])==5
 images=call(env,'b','GET','/dm/shared?kind=image').json()['messages'];assert [m['id'] for m in images]==[image.json()['id']]
 assert len(call(env,'b','GET','/dm/shared?kind=document&q=rapor-33').json()['messages'])==1
 assert call(env,'b','GET','/dm/shared?kind=invalid').status_code==422
 assert call(env,'outside','GET','/dm/shared').status_code==403
 # Thumbnail does not leak or start a temporary-photo timer.
 thumb=download(env,image.json()['id'],suffix='?thumbnail=true');assert thumb.status_code==200
 assert Image.open(io.BytesIO(thumb.content)).size==(320,240)
 assert download(env,temp.json()['id'],suffix='?thumbnail=true').status_code==400
 with Session(env[1]) as db:assert db.get(MessageMedia,temp.json()['id']).viewed_at is None
 assert download(env,page['messages'][1]['id'],suffix='?thumbnail=true').status_code==400


def test_vault_protects_shared_gallery(env):
 upload(env)
 with Session(env[1]) as db:db.add(ConversationFolder(user_id='b',conversation_id='dm',locked=True,archived=False));db.commit()
 assert call(env,'b','GET','/dm/shared').status_code==403
