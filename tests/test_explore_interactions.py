"""Production handlers with isolated SQL fixtures: paging, policy and mutations."""
import ast,unittest
from pathlib import Path
from datetime import datetime,timedelta,timezone
from unittest.mock import patch
from sqlalchemy import select,func,update,delete,event,or_,and_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import Depends,Query,HTTPException,Response
from pydantic import BaseModel,Field
import test_explore_workspace as workspace
from backend.app.db import get_db
from backend.app.models import User
from backend.app.platform_models import (SocialPost,SocialPostLike,SocialPostComment,SocialPostCommentLike,SocialStory,SocialStoryView,SocialStoryLike,UserFollow,UserBlock,Notification)
from backend.app.admin_models import UserBan,AdminRole
from backend.app.moderation import active_ban
from backend.app import explore_interactions

class InteractionTest(unittest.TestCase):
 def setUp(self):
  self.base=workspace.ExploreWorkspace();self.base.setUp();self.addCleanup(self.base.doCleanups)
  self.engine,self.app,self.client=self.base.engine,self.base.app,self.base.client
  with self.engine.connect() as connection:connection.exec_driver_sql("PRAGMA foreign_keys=ON")
  for cls in [SocialPostCommentLike,SocialStory,SocialStoryView,SocialStoryLike,Notification]:cls.__table__.create(self.engine,checkfirst=True)
  def identity(db=Depends(get_db),x_user:str=__import__('fastapi').Header('viewer')):
   user=db.get(User,x_user)
   if not user:raise HTTPException(401)
   return user
  scope=dict(globals(),current_user=identity,require_chat_write=lambda *a:None)
  nodes=ast.parse(Path('backend/app/main.py').read_text()).body
  names=['SocialCommentInput','_social_access','_social_counts','_social_comment_row','list_social_comments','create_social_comment','edit_social_comment','pin_social_comment','unpin_social_comment','like_social_comment','unlike_social_comment','delete_social_comment','list_stories','_visible_story','get_story_media','toggle_story_like']
  for name in names:
   node=next(n for n in nodes if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name==name);node.decorator_list=[]
   exec(compile(ast.Module(body=[node],type_ignores=[]),'production-explore-handler','exec'),scope)
  self.scope=scope;self.app.include_router(explore_interactions.register_auth(identity,scope['_social_access']))
  routes=[('GET','/v1/posts/{post_id}/comments','list_social_comments'),('POST','/v1/posts/{post_id}/comments','create_social_comment'),('PATCH','/v1/posts/{post_id}/comments/{comment_id}','edit_social_comment'),('PUT','/v1/posts/{post_id}/comments/{comment_id}/pin','pin_social_comment'),('DELETE','/v1/posts/{post_id}/comments/{comment_id}/pin','unpin_social_comment'),('POST','/v1/posts/{post_id}/comments/{comment_id}/like','like_social_comment'),('DELETE','/v1/posts/{post_id}/comments/{comment_id}/like','unlike_social_comment'),('DELETE','/v1/posts/{post_id}/comments/{comment_id}','delete_social_comment'),('GET','/v1/stories','list_stories'),('GET','/v1/stories/{story_id}/media','get_story_media'),('POST','/v1/stories/{story_id}/like','toggle_story_like')]
  for method,path,name in routes:self.app.add_api_route(path,scope[name],methods=[method])
  self.app.openapi_schema=None
  with Session(self.engine) as db:
   db.add(SocialStory(id=1,user_id='followed',caption='Anı',mime_type='image/jpeg',image_bytes=b'jpeg',expires_at=datetime.now(timezone.utc)+timedelta(hours=2)))
   db.add(SocialStory(id=2,user_id='author',caption='Takip dışı',mime_type='image/jpeg',image_bytes=b'jpeg',expires_at=datetime.now(timezone.utc)+timedelta(hours=2)));db.commit()
 def tearDown(self):self.base.tearDown()
 def call(self,method,path,uid='viewer',**kw):return self.client.request(method,'/v1'+path,headers={'x-user':uid},**kw)
 def page(self,pid=1,**kw):
  r=self.call('GET',f'/explore/posts/{pid}/comments',params=kw);self.assertEqual(r.status_code,200,r.text);return r.json()
 def add(self,count=1,author='author',parent=None,pid=1):
  with Session(self.engine) as db:
   rows=[SocialPostComment(post_id=pid,user_id=author,parent_id=parent,body='Yorum '+str(i)) for i in range(count)];db.add_all(rows);db.flush();ids=[x.id for x in rows];db.commit();return ids

 def test_root_pages_stable_with_new_insert_and_oldest(self):
  self.add(64);first=self.page(limit=10);seen=[x['id'] for x in first['items']];self.add();cursor=first['next_cursor']
  while cursor:
   data=self.page(limit=10,cursor=cursor);seen += [x['id'] for x in data['items']];cursor=data['next_cursor']
  self.assertEqual(len(seen),65);self.assertEqual(seen,sorted(set(seen),reverse=True))
  data=self.page(order='oldest',limit=10);self.assertEqual([x['id'] for x in data['items']],list(range(1,11)))
 def test_replies_are_separate_paged_and_cross_post_parent_denied(self):
  root=self.add()[0];self.add(27,author='followed',parent=root);data=self.page(parent_id=root,order='oldest',limit=20)
  self.assertEqual(len(data['items']),20);self.assertTrue(data['has_more']);self.assertEqual(self.page()['items'][0]['reply_count'],27)
  self.assertTrue(all(x['parent_id'] is None for x in self.page()['items']))
  self.assertEqual(self.call('GET','/explore/posts/10/comments',params={'parent_id':root}).status_code,404)
  child=data['items'][0]['id'];self.assertEqual(self.call('GET','/explore/posts/1/comments',params={'parent_id':child}).status_code,422)
 def test_pinned_root_once_then_remaining_pages(self):
  ids=self.add(22);r=self.call('PUT',f'/posts/1/comments/{ids[2]}/pin',uid='author');self.assertEqual(r.status_code,200,r.text)
  page=self.page(limit=5);self.assertEqual(page['items'][0]['id'],ids[2]);allids=[x['id'] for x in page['items']]
  while page['has_more']:
   page=self.page(limit=5,cursor=page['next_cursor']);allids += [x['id'] for x in page['items']]
  self.assertEqual(len(set(allids)),23);self.assertEqual(len(allids),23)
 def test_comment_author_and_thread_privacy_applies_to_old_and_new_routes(self):
  root=self.add(author='blocked')[0];child=self.add(author='author',parent=root)[0]
  for uid in ['inactive','banned','device']:self.add(author=uid)
  visible=[x['id'] for x in self.page()['items']];self.assertEqual(visible,[1])
  legacy=self.call('GET','/posts/1/comments');self.assertEqual([x['id'] for x in legacy.json()],[1])
  self.assertEqual(self.call('GET',f'/explore/posts/1/comments/{child}').status_code,404)
  for suffix,method in [('', 'PATCH'),('/pin','PUT'),('/like','POST')]:
   kw={'json':{'body':'Yeni'}} if method=='PATCH' else {}
   self.assertEqual(self.call(method,f'/posts/1/comments/{child}'+suffix,**kw).status_code,403 if suffix=='/pin' else 404)
  self.assertEqual(self.call('POST','/posts/1/comments',json={'body':'Yanıt','parent_id':root}).status_code,404)
 def test_post_privacy_rechecked_on_every_page_and_read(self):
  self.add(25);cursor=self.page(limit=1)['next_cursor']
  with Session(self.engine) as db:db.get(SocialPost,1).audience='followers';db.commit()
  self.assertEqual(self.call('GET','/explore/posts/1/comments',params={'cursor':cursor}).status_code,404)
  self.assertEqual(self.call('GET','/explore/posts/1/comments/1').status_code,404)
 def test_comment_create_edit_expected_body_and_ownership(self):
  r=self.call('POST','/posts/1/comments',json={'body':'Benim yorumum'});self.assertEqual(r.status_code,200,r.text);cid=r.json()['id']
  r=self.call('PATCH',f'/posts/1/comments/{cid}',json={'body':'Yeni','expected_body':'Benim yorumum'});self.assertEqual(r.status_code,200,r.text)
  self.assertEqual(self.call('PATCH',f'/posts/1/comments/{cid}',json={'body':'Kaybolmasın','expected_body':'Benim yorumum'}).status_code,409)
  self.assertEqual(self.call('PATCH',f'/posts/1/comments/{cid}',uid='other',json={'body':'Yetkisiz'}).status_code,403)
  self.assertEqual(self.call('POST','/posts/1/comments',json={'body':' '*4}).status_code,400)
  self.assertEqual(self.call('POST','/posts/1/comments',json={'body':'x'*1001}).status_code,422)
 def test_post_owner_moderates_other_comment_and_cascade_removes_reply_likes(self):
  root=self.add(author='viewer')[0];child=self.add(author='followed',parent=root)[0]
  self.assertEqual(self.call('PUT',f'/posts/1/comments/{root}/pin',uid='author').status_code,200)
  self.assertEqual(self.call('PUT',f'/posts/1/comments/{child}/pin',uid='author').status_code,422)
  self.assertEqual(self.call('DELETE',f'/posts/1/comments/{root}',uid='other').status_code,403)
  self.call('POST',f'/posts/1/comments/{child}/like')
  self.assertEqual(self.call('DELETE',f'/posts/1/comments/{root}',uid='author').status_code,200)
  with Session(self.engine) as db:
   self.assertIsNone(db.get(SocialPostComment,child));self.assertEqual(db.scalar(select(func.count()).select_from(SocialPostCommentLike)),0)
  self.assertEqual(self.call('GET',f'/explore/posts/1/comments/{child}').status_code,404)
 def test_like_unlike_idempotent_and_wrong_post_rejected(self):
  root=self.add()[0]
  for _ in range(2):self.assertEqual(self.call('POST',f'/posts/1/comments/{root}/like').json()['like_count'],1)
  for _ in range(2):self.assertEqual(self.call('DELETE',f'/posts/1/comments/{root}/like').json()['like_count'],0)
  self.assertEqual(self.call('POST',f'/posts/10/comments/{root}/like').status_code,404)
 def test_pagination_rejects_bad_and_cross_filter_cursors(self):
  self.add(20);cursor=self.page(limit=1)['next_cursor']
  for value in ['☃','%%%','AAAA','e30',explore_interactions.pack([1,None,'newest',True,1,0]),explore_interactions.pack([1,None,'newest',10**100,1,0])]:self.assertEqual(self.call('GET','/explore/posts/1/comments',params={'cursor':value}).status_code,422)
  self.assertEqual(self.call('GET','/explore/posts/1/comments',params={'cursor':cursor,'order':'oldest'}).status_code,422)
  self.assertEqual(self.call('GET','/explore/posts/1/comments',params={'limit':51}).status_code,422)
 def test_comment_aggregates_are_batched_no_per_comment_selects(self):
  self.add(40);statements=[]
  def record(conn,cursor,statement,params,ctx,many):statements.append(statement)
  with Session(self.engine) as db:
   user=db.get(User,'viewer');event.listen(self.engine,'before_cursor_execute',record)
   try:data=explore_interactions.comment_page(db,1,user,limit=40)
   finally:event.remove(self.engine,'before_cursor_execute',record)
  self.assertEqual(len(data['items']),40);self.assertLessEqual(len(statements),6)
 def test_story_like_retries_do_not_toggle_or_duplicate_notification(self):
  for _ in range(2):
   r=self.call('PUT','/explore/stories/1/liked');self.assertEqual(r.status_code,200,r.text);self.assertTrue(r.json()['liked']);self.assertEqual(r.json()['like_count'],1)
  with Session(self.engine) as db:self.assertEqual(db.scalar(select(func.count()).select_from(Notification)),1)
  for _ in range(2):self.assertEqual(self.call('DELETE','/explore/stories/1/liked').json()['like_count'],0)
 def test_story_view_unique_and_owner_viewer_list_private(self):
  for _ in range(2):self.assertEqual(self.call('GET','/stories/1/media').status_code,200)
  with Session(self.engine) as db:self.assertEqual(db.scalar(select(func.count()).select_from(SocialStoryView)),1)
  self.assertEqual(self.call('GET','/explore/stories/1/viewers').status_code,403)
  r=self.call('GET','/explore/stories/1/viewers',uid='followed');self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['items'][0]['user_id'],'viewer');self.assertIn('no-store',r.headers['cache-control'])
 def test_story_viewer_pages_filters_and_like_state(self):
  with Session(self.engine) as db:
   for i in range(25):
    uid='v'+str(i);db.add(User(id=uid,public_id='view'+str(i),nickname=uid));db.flush();db.add(SocialStoryView(story_id=1,viewer_id=uid))
   db.add(SocialStoryLike(story_id=1,user_id='v24'));db.add(UserBlock(blocker_id='followed',blocked_id='v23'));db.commit()
  first=self.call('GET','/explore/stories/1/viewers?limit=10',uid='followed').json();self.assertEqual(len(first['items']),10);self.assertTrue(first['items'][0]['liked']);seen=[x['user_id'] for x in first['items']]
  while first['has_more']:
   first=self.call('GET','/explore/stories/1/viewers?limit=10&before='+str(first['next_before']),uid='followed').json();seen += [x['user_id'] for x in first['items']]
  self.assertEqual(len(seen),24);self.assertNotIn('v23',seen)
 def test_story_policy_media_like_reply_guard_expiry_and_author_bans(self):
  self.assertEqual(self.call('GET','/stories/2/media').status_code,404)
  for field in ['inactive','banned','device','expired','unfollow','block']:
   with Session(self.engine) as db:
    story=db.get(SocialStory,1);story.user_id=field if field in ['inactive','banned','device'] else 'followed';story.expires_at=datetime.now(timezone.utc)+timedelta(hours=1)
    if field=='expired':story.expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)
    if field=='unfollow':db.execute(delete(UserFollow).where(UserFollow.follower_id=='viewer'))
    if field=='block':db.add(UserBlock(blocker_id='followed',blocked_id='viewer'))
    db.commit()
   self.assertEqual(self.call('GET','/stories/1/media').status_code,404,field)
   self.assertEqual(self.call('PUT','/explore/stories/1/liked').status_code,404,field)
 def test_story_list_filters_before_limit_and_no_story_blob_in_json(self):
  with Session(self.engine) as db:
   db.add(UserFollow(follower_id='viewer',following_id='banned'));db.add(SocialStory(user_id='banned',mime_type='image/jpeg',image_bytes=b'private',expires_at=datetime.now(timezone.utc)+timedelta(hours=1)));db.commit()
  r=self.call('GET','/stories?limit=1');self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()[0]['id'],1);self.assertNotIn('image_bytes',r.json()[0])
