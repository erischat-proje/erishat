"""Private profile and owned-post management against production routes."""
import unittest,ast
from datetime import datetime,timedelta,timezone
from pathlib import Path
from unittest.mock import patch
from fastapi import Depends,Header,HTTPException,Form,UploadFile,File
from sqlalchemy import select,func,update,delete,text
from sqlalchemy.orm import Session
import test_explore_workspace as workspace
from backend.app import profile_workspace as pw
from backend.app.db import get_db
from backend.app.models import User
from backend.app.platform_models import SocialPost,SocialPostComment,SocialPostCommentLike,SocialPostLike
from backend.app.explore_models import SavedPost,HiddenPost
from backend.app.admin_models import AdminRole,ChatBan
from backend.app.schemas import NicknameChange,UserOut

class ProfileWorkspaceTest(unittest.TestCase):
 def setUp(self):
  self.base=workspace.ExploreWorkspace();self.base.setUp();self.addCleanup(self.base.doCleanups)
  self.engine,self.app,self.client=self.base.engine,self.base.app,self.base.client
  with self.engine.connect() as conn:conn.exec_driver_sql('PRAGMA foreign_keys=ON')
  SocialPostCommentLike.__table__.create(self.engine,checkfirst=True)
  ChatBan.__table__.create(self.engine,checkfirst=True)
  def identity(db=Depends(get_db),x_user:str=Header('viewer')):
   user=db.get(User,x_user)
   if not user or not user.is_active:raise HTTPException(401)
   return user
  self.app.include_router(pw.register_auth(identity));self.app.openapi_schema=None
  scope=dict(globals(),__name__='backend.app.main',__package__='backend.app',current_user=identity,require_chat_write=lambda *a:None)
  tree=ast.parse(Path('backend/app/main.py').read_text())
  for name in ['update_social_post','pin_social_post','unpin_social_post','change_nickname']:
   node=next(n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name);node.decorator_list=[];exec(compile(ast.Module(body=[node],type_ignores=[]),'production-profile-handler','exec'),scope)
  self.scope=scope
  self.app.add_api_route('/v1/test/posts/{post_id}',scope['update_social_post'],methods=['PATCH'])
  self.app.add_api_route('/v1/test/posts/{post_id}/pin',scope['pin_social_post'],methods=['PUT'])
  self.app.add_api_route('/v1/test/posts/{post_id}/pin',scope['unpin_social_post'],methods=['DELETE'])
  self.app.add_api_route('/v1/test/nickname',scope['change_nickname'],methods=['POST'],response_model=UserOut)
 def tearDown(self):self.base.tearDown()
 def call(self,method,path='',uid='viewer',**kw):return self.client.request(method,'/v1/profile-workspace'+path,headers={'x-user':uid},**kw)
 def page(self,**params):
  r=self.call('GET','/posts',params=params);self.assertEqual(r.status_code,200,r.text);return r.json()
 def add(self,n=1,uid='viewer',hidden=False,audience='public',mime=None):
  with Session(self.engine) as db:
   rows=[SocialPost(user_id=uid,caption='Anı %_ '+str(i),is_hidden=hidden,audience=audience,mime_type=mime,image_bytes=b'blob' if mime else None) for i in range(n)]
   db.add_all(rows);db.flush();ids=[x.id for x in rows];db.commit();return ids
 def selected(self,*ids):
  with Session(self.engine) as db:return [{'id':i,'updated_at':db.get(SocialPost,i).updated_at.isoformat()} for i in ids]
 def action(self,action,ids,**extra):return self.call('POST','/posts/action',json={'action':action,'items':self.selected(*ids),**extra})

 def test_private_snapshot_counts_identity_and_authorization(self):
  self.add(2,hidden=True);self.add(2,audience='followers');r=self.call('GET');self.assertEqual(r.status_code,200,r.text);data=r.json();self.assertEqual(data['profile']['id'],'viewer');self.assertEqual(data['posts']['hidden'],2);self.assertEqual(data['posts']['followers'],3);self.assertEqual(data['posts']['total'],5)
  self.assertIn('no-store',r.headers['cache-control']);self.assertEqual(r.headers['vary'],'Authorization');self.assertNotIn('image_bytes',r.text)
  self.assertEqual(self.call('GET',uid='inactive').status_code,401);self.assertEqual(self.call('GET',uid='missing').status_code,401)
 def test_info_updates_only_changed_fields_and_can_clear_optional_names(self):
  with Session(self.engine) as db:u=db.get(User,'viewer');u.first_name='Ad';u.last_name='Soyad';u.bio='Eski';db.commit()
  r=self.call('PATCH','/info',json={'changes':{'bio':'  Yeni\r\nBilgi  '},'expected':{'bio':'Eski'}});self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['bio'],'Yeni\nBilgi')
  with Session(self.engine) as db:u=db.get(User,'viewer');self.assertEqual(u.first_name,'Ad');self.assertEqual(u.last_name,'Soyad');self.assertEqual(u.lidya,0)
  r=self.call('PATCH','/info',json={'changes':{'first_name':''},'expected':{'first_name':'Ad'}});self.assertEqual(r.status_code,200,r.text)
  with Session(self.engine) as db:self.assertIsNone(db.get(User,'viewer').first_name)
 def test_stale_info_is_atomic_and_unrelated_notifications_do_not_conflict(self):
  self.call('PATCH','/info',json={'changes':{'bio':'Başka cihaz'},'expected':{'bio':''}})
  r=self.call('PATCH','/info',json={'changes':{'bio':'Benimki','first_name':'Değişmesin'},'expected':{'bio':'','first_name':''}});self.assertEqual(r.status_code,409)
  with Session(self.engine) as db:u=db.get(User,'viewer');self.assertEqual(u.bio,'Başka cihaz');self.assertIsNone(u.first_name);u.notifications_enabled=False;db.commit()
  r=self.call('PATCH','/info',json={'changes':{'bio':'Yeni'},'expected':{'bio':'Başka cihaz'}});self.assertEqual(r.status_code,200,r.text)
  with Session(self.engine) as db:self.assertFalse(db.get(User,'viewer').notifications_enabled)
 def test_info_does_not_allow_name_fee_bypass_currency_or_unknown_fields(self):
  for changes in [{'nickname':'Bedava'},{'lidya':'1000'},{'avatar':'x'},{'gender':'male'},{'first_name':'x'*65},{'bio':'x'*301},{'bio':'a\x00b'},{'first_name':123}]:
   r=self.call('PATCH','/info',json={'changes':changes,'expected':{k:'' for k in changes}});self.assertEqual(r.status_code,422,r.text)
  self.assertEqual(self.call('PATCH','/info',json={'changes':{'bio':'Yeni'},'expected':{'last_name':''}}).status_code,422)
  with Session(self.engine) as db:u=db.get(User,'viewer');self.assertEqual(u.nickname,'viewer');self.assertEqual(u.lidya,0)
 def test_management_identity_cannot_be_modified(self):
  with Session(self.engine) as db:db.add(AdminRole(user_id='viewer',role='SA'));db.commit()
  self.assertTrue(self.call('GET').json()['profile']['management_locked'])
  self.assertEqual(self.call('PATCH','/info',json={'changes':{'bio':'Yeni'},'expected':{'bio':''}}).status_code,403)
 def test_owned_posts_more_than_100_cursor_stable_and_private(self):
  ids=self.add(121);first=self.page(limit=20);seen=[x['id'] for x in first['items']];self.add();cursor=first['next_cursor']
  while cursor:
   page=self.page(limit=20,cursor=cursor);seen += [x['id'] for x in page['items']];cursor=page['next_cursor']
  self.assertEqual(len(seen),122);self.assertEqual(seen,sorted(set(seen),reverse=True));self.assertTrue(set(ids).issubset(seen));self.assertNotIn(1,seen)
  self.assertEqual(self.call('GET','/posts',uid='author',params={'cursor':first['next_cursor']}).status_code,422)
 def test_scope_media_search_and_literal_wildcards(self):
  image=self.add(hidden=True,mime='image/png')[0];video=self.add(audience='followers',mime='video/mp4')[0]
  ordinary=self.add()[0]
  with Session(self.engine) as db:db.get(SocialPost,ordinary).caption='Normal text';db.commit()
  self.assertEqual([x['id'] for x in self.page(scope='hidden')['items']],[image]);self.assertEqual([x['id'] for x in self.page(media='video')['items']],[video]);self.assertEqual({x['id'] for x in self.page(q='%_')['items']},{9,image,video})
  self.assertTrue(self.page(scope='hidden')['items'][0]['is_hidden']);self.assertNotIn('image_bytes',self.page()['items'][0]);self.assertEqual(self.page(q='yok')['items'],[])
 def test_pinned_oldest_pages_and_filter_binding(self):
  ids=self.add(28)
  with Session(self.engine) as db:db.get(SocialPost,ids[-1]).is_pinned=True;db.commit()
  page=self.page(order='oldest',limit=5);self.assertEqual(page['items'][0]['id'],ids[-1]);allids=[x['id'] for x in page['items']];cursor=page['next_cursor']
  self.assertEqual(self.call('GET','/posts',params={'cursor':cursor,'scope':'hidden','order':'oldest'}).status_code,422)
  while cursor:
   page=self.page(order='oldest',limit=5,cursor=cursor);allids += [x['id'] for x in page['items']];cursor=page['next_cursor']
  self.assertEqual(len(set(allids)),29);self.assertEqual(len(allids),29)
 def test_bulk_hide_show_and_audience_keep_other_properties(self):
  ids=self.add(2,audience='followers');r=self.action('hide',ids);self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['count'],2)
  r=self.action('show',ids);self.assertEqual(r.status_code,200,r.text)
  with Session(self.engine) as db:
   for i in ids:p=db.get(SocialPost,i);self.assertFalse(p.is_hidden);self.assertEqual(p.audience,'followers')
  self.assertEqual(self.action('public',ids).status_code,200)
  with Session(self.engine) as db:self.assertTrue(all(db.get(SocialPost,i).audience=='public' for i in ids))
 def test_bulk_mixed_owner_and_stale_snapshot_are_all_or_nothing(self):
  ids=self.add(2);self.assertEqual(self.action('hide',[ids[0],1]).status_code,404)
  payload={'action':'hide','items':self.selected(*ids)}
  with Session(self.engine) as db:db.get(SocialPost,ids[-1]).updated_at=datetime.now(timezone.utc)+timedelta(seconds=1);db.commit()
  self.assertEqual(self.call('POST','/posts/action',json=payload).status_code,409)
  with Session(self.engine) as db:self.assertTrue(all(not db.get(SocialPost,i).is_hidden for i in ids))
 def test_bulk_limit_duplicates_strict_confirmation_and_unknown_actions(self):
  ids=self.add(21);self.assertEqual(self.action('hide',ids).status_code,422);self.assertEqual(self.action('hide',[ids[0],ids[0]]).status_code,422)
  self.assertEqual(self.action('delete',ids[:1]).status_code,422);self.assertEqual(self.action('delete',ids[:1],confirm_delete='yes').status_code,422);self.assertEqual(self.action('bad',ids[:1]).status_code,422)
  with Session(self.engine) as db:db.add(ChatBan(user_id='viewer',banned_by='author',active=True));db.commit()
  with patch('backend.app.moderation.chat_ban_detail',return_value={'code':'chat_dm_banned'}):
   for action in ['hide','show','public','followers']:self.assertEqual(self.action(action,ids[:1]).status_code,403)
  self.assertEqual(self.action('delete',ids[:1],confirm_delete=True).status_code,200)
 def test_bulk_delete_cascades_comments_likes_preferences_and_never_debits_wallet(self):
  pid=self.add()[0]
  with Session(self.engine) as db:
   root=SocialPostComment(post_id=pid,user_id='viewer',body='Ana');db.add(root);db.flush();reply=SocialPostComment(post_id=pid,user_id='author',parent_id=root.id,body='Yanıt');db.add(reply);db.flush()
   db.add_all([SocialPostCommentLike(comment_id=reply.id,user_id='viewer'),SocialPostLike(post_id=pid,user_id='author'),SavedPost(post_id=pid,user_id='viewer'),HiddenPost(post_id=pid,user_id='author')]);db.commit()
  r=self.action('delete',[pid],confirm_delete=True);self.assertEqual(r.status_code,200,r.text)
  with Session(self.engine) as db:
   self.assertIsNone(db.get(SocialPost,pid));self.assertEqual(db.scalar(select(func.count()).select_from(SocialPostComment).where(SocialPostComment.post_id==pid)),0);self.assertEqual(db.scalar(select(func.count()).select_from(SocialPostCommentLike)),0);self.assertEqual(db.get(User,'viewer').lidya,0);self.assertIsNone(db.get(SavedPost,('viewer',pid)))
 def test_applied_snapshot_cannot_be_replayed_after_action(self):
  ids=self.add();payload={'action':'hide','items':self.selected(*ids)};self.assertEqual(self.call('POST','/posts/action',json=payload).status_code,200);self.assertEqual(self.call('POST','/posts/action',json=payload).status_code,409)
 def test_legacy_edit_pin_and_unpin_invalidate_stale_bulk_versions(self):
  pid=self.add()[0]
  for method,suffix,options in [('PATCH','',{'data':{'caption':'Yeni'}}),('PUT','/pin',{}),('DELETE','/pin',{})]:
   before=self.selected(pid);r=self.client.request(method,'/v1/test/posts/'+str(pid)+suffix,headers={'x-user':'viewer'},**options);self.assertEqual(r.status_code,200,r.text)
   self.assertEqual(self.call('POST','/posts/action',json={'action':'hide','items':before}).status_code,409)
 def test_nickname_existing_cost_and_same_name_retry_remain_150(self):
  with Session(self.engine) as db:db.get(User,'viewer').lidya=500;db.commit()
  from backend.app import vip_spending
  with patch.object(vip_spending,'record_spend',lambda *a:None):
   for _ in range(2):
    r=self.client.post('/v1/test/nickname',headers={'x-user':'viewer'},json={'nickname':'YeniKaan'});self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['lidya'],350)
  with Session(self.engine) as db:self.assertEqual(db.get(User,'viewer').nickname,'YeniKaan');self.assertEqual(db.get(User,'viewer').lidya,350)
 def test_invalid_cursor_and_parameters_do_not_expose_or_crash(self):
  for cursor in ['%%%','☃',pw.cursor_pack([10**100,1,0,['viewer','all','all','','newest']])]:self.assertEqual(self.call('GET','/posts',params={'cursor':cursor}).status_code,422)
  self.assertEqual(self.call('GET','/posts?limit=51').status_code,422);self.assertEqual(self.call('GET','/posts?scope=other').status_code,422)
