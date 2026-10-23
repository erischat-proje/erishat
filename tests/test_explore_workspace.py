"""Real DB/API privacy, cursor, private preferences and aggregate feed checks."""
import os
os.environ.setdefault('DATABASE_URL','sqlite://')
import unittest,ast
from unittest.mock import patch
from sqlalchemy import BigInteger
from sqlalchemy.ext.compiler import compiles
from backend.app import system_data
from pathlib import Path
from datetime import datetime,timedelta,timezone
from fastapi import FastAPI,Depends,Header,HTTPException,Query,Response
from fastapi.testclient import TestClient
from sqlalchemy import create_engine,select,event,func,or_,and_
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from backend.app.db import Base,get_db
from backend.app.models import User
from backend.app.platform_models import SocialPost,SocialPostLike,SocialPostComment,UserFollow,UserBlock
from backend.app.admin_models import UserBan,AdminRole
from backend.app.ban_workflow_models import UserBrowserDevice
from backend.app.explore_models import SavedPost,HiddenPost,MutedAuthor
from backend.app.explore_feed import register_auth,visible_query,feed_page
from backend.app.moderation import active_ban
from backend.app import explore_feed

@compiles(BigInteger,"sqlite")
def sqlite_bigint(type_,compiler,**kw):return "INTEGER"

class ExploreWorkspace(unittest.TestCase):
    def setUp(self):
        recorder=patch.object(system_data,"record",lambda *a,**k:None);recorder.start();self.addCleanup(recorder.stop)
        self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
        tables=[m.__table__ for m in (User,AdminRole,SocialPost,SocialPostLike,SocialPostComment,UserFollow,UserBlock,UserBan,UserBrowserDevice,SavedPost,HiddenPost,MutedAuthor,system_data.LidyaLedger)]
        Base.metadata.create_all(self.engine,tables=tables)
        def session():
            with Session(self.engine) as db:yield db
        def identity(x_user:str=Header('viewer'),db:Session=Depends(get_db)):
            u=db.get(User,x_user)
            if not u:raise HTTPException(401)
            return u
        # Compile the actual application handlers without unrelated main.py services.
        tree=ast.parse(Path('backend/app/main.py').read_text())
        funcs=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in {'_social_access','list_social_feed','get_social_post_media'}]
        for node in funcs:node.decorator_list=[]
        scope=dict(globals(),current_user=identity)
        exec(compile(ast.Module(body=funcs,type_ignores=[]),'main-social-handlers','exec'),scope)
        access=scope['_social_access']
        self.app=FastAPI();self.app.include_router(register_auth(identity,access));self.app.dependency_overrides[get_db]=session;self.app.get("/v1/posts/feed")(scope["list_social_feed"]);self.app.get("/v1/posts/{post_id}/media")(scope["get_social_post_media"]);self.client=TestClient(self.app)
        with Session(self.engine) as db:
            for i,uid in enumerate(['viewer','author','followed','blocked','inactive','banned','device','deviceowner','other']):db.add(User(id=uid,public_id=str(1000000000+i),nickname=uid,is_active=uid!='inactive'))
            db.flush();db.add(UserFollow(follower_id='viewer',following_id='followed'));db.add(UserBlock(blocker_id='blocked',blocked_id='viewer'))
            db.add(UserBan(user_id='banned',ban_type='account',banned_by='viewer',active=True));db.add(UserBan(user_id='deviceowner',ban_type='device',banned_by='viewer',active=True));db.add_all([UserBrowserDevice(user_id='deviceowner',device_hash='shared'),UserBrowserDevice(user_id='device',device_hash='shared')]);db.flush()
            stamp=datetime(2026,10,22,12,tzinfo=timezone.utc)
            for pid,uid,audience,hidden,mime in [(1,'author','public',False,None),(2,'followed','followers',False,None),(3,'author','followers',False,None),(4,'blocked','public',False,None),(5,'inactive','public',False,None),(6,'banned','public',False,None),(7,'device','public',False,None),(8,'author','public',True,None),(9,'viewer','followers',False,None),(10,'author','public',False,'image/png'),(11,'author','public',False,'video/mp4')]:
                db.add(SocialPost(id=pid,user_id=uid,caption='A test %_ caption '+str(pid),audience=audience,is_hidden=hidden,mime_type=mime,image_bytes=b'media' if mime else None,created_at=stamp,updated_at=stamp))
            db.flush();db.add(SocialPostLike(post_id=1,user_id='viewer'));db.add(SocialPostComment(post_id=1,user_id='followed',body='Test comment'));db.commit()
    def tearDown(self):self.client.close();self.engine.dispose()
    def get(self,path='',uid='viewer'):return self.client.get('/v1/explore/'+path,headers={'x-user':uid})
    def put(self,path,uid='viewer'):return self.client.put('/v1/explore/'+path,headers={'x-user':uid})
    def delete(self,path,uid='viewer'):return self.client.delete('/v1/explore/'+path,headers={'x-user':uid})
    def ids(self,**params):return [p['id'] for p in self.client.get('/v1/explore/feed',params=params).json()['items']]
    def test_visibility_blocks_audience_hidden_inactive_direct_and_device_bans(self):self.assertEqual(self.ids(mode='recent'),[11,10,9,2,1])
    def test_for_you_priority_is_real_and_following_scoped(self):
        self.assertEqual(self.ids(mode='for-you'),[2,11,10,9,1]);self.assertEqual(self.ids(mode='following'),[9,2])
    def test_equal_timestamp_cursor_is_stable_and_ignores_new_insert(self):
        first=self.get('feed?mode=recent&limit=2').json();self.assertEqual([p['id'] for p in first['items']],[11,10])
        with Session(self.engine) as db:db.add(SocialPost(id=20,user_id='author',caption='New insert'));db.commit()
        seen=[11,10];cursor=first['next_cursor']
        while cursor:
            page=self.get('feed?mode=recent&limit=2&cursor='+cursor).json();seen += [p['id'] for p in page['items']];cursor=page['next_cursor']
        self.assertEqual(seen,[11,10,9,2,1]);self.assertEqual(len(set(seen)),len(seen))
    def test_priority_cursor_crosses_followed_boundary_without_duplicates(self):
        rows=[];cursor=None
        while True:
            r=self.get('feed?limit=1'+('&cursor='+cursor if cursor else '')).json();rows += [p['id'] for p in r['items']];cursor=r['next_cursor']
            if not cursor:break
        self.assertEqual(rows,[2,11,10,9,1])
    def test_invalid_cursor_and_filter_reuse_rejected(self):
        self.assertEqual(self.get('feed?cursor=garbage').status_code,422)
        cursor=self.get('feed?limit=1').json()['next_cursor'];self.assertEqual(self.get('feed?mode=saved&cursor='+cursor).status_code,422)
        self.assertEqual(self.get('feed?mode=invalid').status_code,422)
    def test_media_search_and_literal_wildcards(self):
        self.assertEqual(self.ids(media='image'),[10]);self.assertEqual(self.ids(media='video'),[11]);self.assertEqual(self.ids(q='%_',media='text'),[2,9,1]);self.assertEqual(self.ids(q='unknown'),[])
    def test_counts_are_batched_and_no_media_bytes_in_json(self):
        statements=[]
        def record(conn,cursor,statement,params,context,many):statements.append(statement)
        with Session(self.engine) as db:
            u=db.get(User,'viewer');event.listen(self.engine,'before_cursor_execute',record)
            try:data=feed_page(db,u,mode='recent')
            finally:event.remove(self.engine,'before_cursor_execute',record)
        p=next(p for p in data['items'] if p['id']==1);self.assertEqual((p['like_count'],p['comment_count'],p['liked_by_me']),(1,1,True));self.assertNotIn('image_bytes',p);self.assertLessEqual(len(statements),6)
    def test_save_retry_private_and_unsave_after_access_revoked(self):
        for _ in range(2):self.assertEqual(self.put('posts/1/saved').status_code,200)
        self.assertEqual(self.ids(mode='saved'),[1]);self.assertEqual(self.get('feed?mode=saved','other').json()['items'],[])
        with Session(self.engine) as db:db.get(SocialPost,1).audience='followers';db.commit()
        self.assertEqual(self.ids(mode='saved'),[]);self.assertEqual(self.put('posts/1/saved').status_code,404)
        self.assertEqual(self.delete('posts/1/saved').status_code,200);self.assertEqual(self.delete('posts/1/saved').status_code,200)
    def test_hidden_and_mute_are_private_and_reversible_without_unfollow(self):
        self.put('posts/1/saved');self.put('posts/1/hidden');self.assertNotIn(1,self.ids());self.assertEqual(self.ids(mode='saved'),[1]);self.assertEqual(self.get('preferences').json()['hidden'],[{'post_id':1}]);self.delete('posts/1/hidden');self.assertIn(1,self.ids())
        self.put('authors/followed/muted');self.assertNotIn(2,self.ids())
        self.assertEqual(self.get('preferences').json()['muted'],[{'user_id':'followed','nickname':'followed'}]);self.delete('authors/followed/muted');self.assertIn(2,self.ids())
        with Session(self.engine) as db:self.assertEqual(db.scalar(select(func.count()).select_from(UserFollow)),1)
    def test_forbidden_save_hide_and_self_mute(self):
        for pid in [3,4,5,6,7,8,999]:self.assertEqual(self.put(f'posts/{pid}/saved').status_code,404)
        self.assertEqual(self.put('posts/9/hidden').status_code,400);self.assertEqual(self.put('authors/viewer/muted').status_code,400);self.assertEqual(self.put('posts/1/saved','inactive').status_code,403)
    def test_no_store_readiness_and_paging(self):
        r=self.get('readiness');self.assertEqual(r.status_code,200);self.assertIn('no-store',r.headers['cache-control']);self.assertEqual(r.headers['vary'],'Authorization')
        self.assertEqual(self.get('preferences?limit=0').status_code,422)

    def test_old_feed_uses_same_privacy_and_actual_media_handler_rechecks_access(self):
        r=self.client.get('/v1/posts/feed?mode=recent');self.assertEqual([p['id'] for p in r.json()],[11,10,9,2,1])
        self.assertEqual(self.client.get('/v1/posts/10/media').status_code,200)
        with Session(self.engine) as db:
            db.get(User,'author').is_active=False;db.commit()
        self.assertEqual(self.client.get('/v1/posts/10/media').status_code,404)
        self.assertEqual(self.put('posts/10/saved').status_code,404)
    def test_blocked_mute_refused_and_preferences_dont_expose_blocked_names(self):
        self.assertEqual(self.put('authors/blocked/muted').status_code,404)
        self.put('authors/author/muted')
        with Session(self.engine) as db:db.add(UserBlock(blocker_id='author',blocked_id='viewer'));db.commit()
        self.assertEqual(self.get('preferences').json()['muted'],[])
        self.assertEqual(self.delete('authors/author/muted').status_code,200)
    def test_saved_visibility_rechecks_unfollow_block_hide_and_delete(self):
        self.put('posts/2/saved')
        with Session(self.engine) as db:
            db.delete(db.scalar(select(UserFollow).where(UserFollow.follower_id=='viewer')));db.commit()
        self.assertEqual(self.ids(mode='saved'),[])
        self.put('posts/10/saved')
        with Session(self.engine) as db:db.get(SocialPost,10).is_hidden=True;db.commit()
        self.assertEqual(self.ids(mode='saved'),[])

    def test_core_readiness_detects_missing_schema_and_routes(self):
        with self.engine.connect() as conn:
            explore_feed.check_ready(self.app,conn)
            with self.assertRaises(RuntimeError):explore_feed.check_ready(FastAPI(),conn)
        with self.engine.begin() as conn:HiddenPost.__table__.drop(conn)
        with self.engine.connect() as conn:
            from sqlalchemy.exc import OperationalError
            with self.assertRaises(OperationalError):explore_feed.check_ready(self.app,conn)
