"""Notification history and bounded read operations through production routes."""
import ast
import unittest
from pathlib import Path
from datetime import datetime,timezone
from fastapi import Depends,Header,HTTPException,Query
from sqlalchemy import select,func
from sqlalchemy.orm import Session
import test_explore_workspace as workspace
from backend.app import notification_center as center
from backend.app.db import get_db
from backend.app.models import User
from backend.app.platform_models import Notification

class NotificationCenterTest(unittest.TestCase):
    def setUp(self):
        self.base=workspace.ExploreWorkspace();self.base.setUp();self.addCleanup(self.base.doCleanups)
        self.engine,self.app,self.client=self.base.engine,self.base.app,self.base.client
        Notification.__table__.create(self.engine,checkfirst=True)
        def identity(db=Depends(get_db),x_user:str=Header('viewer')):
            user=db.get(User,x_user)
            if not user or not user.is_active:raise HTTPException(401)
            return user
        self.app.include_router(center.register_auth(identity))
        # The old banner reader and read handler remain interoperable.
        scope=dict(globals(),current_user_dependency=identity)
        tree=ast.parse(Path('backend/app/platform_routes.py').read_text())
        for name in ['notifications','mark_notification_read']:
            node=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name==name);node.decorator_list=[]
            exec(compile(ast.Module(body=[node],type_ignores=[]),'production-legacy-notification','exec'),scope)
        self.app.add_api_route('/legacy',scope['notifications'],methods=['GET'])
        self.app.add_api_route('/legacy/{notification_id}/read',scope['mark_notification_read'],methods=['POST'])
    def tearDown(self):self.base.tearDown()
    def request(self,method,path='',uid='viewer',**kw):return self.client.request(method,'/v1/notification-center'+path,headers={'x-user':uid},**kw)
    def page(self,**params):
        r=self.request('GET',params=params);self.assertEqual(r.status_code,200,r.text);return r.json()
    def add(self,n=1,uid='viewer',kind='follow',read=False,title='Başlık',body='Bir gelişme'):
        with Session(self.engine) as db:
            rows=[Notification(user_id=uid,kind=kind,title=title,body=body,read=read,created_at=datetime(2026,10,23,tzinfo=timezone.utc)) for _ in range(n)]
            db.add_all(rows);db.flush();ids=[r.id for r in rows];db.commit();return ids
    def status(self):
        with Session(self.engine) as db:return {r.id:r.read for r in db.scalars(select(Notification))}
    def mark(self,ids,read=True,uid='viewer'):return self.request('POST','/read',uid=uid,json={'ids':ids,'read':read})
    def matching(self,snapshot,uid='viewer'):return self.request('POST','/read-matching',uid=uid,json={'snapshot':snapshot})

    def test_private_history_counts_and_authentication(self):
        self.add(3);self.add(2,read=True);self.add(4,uid='author')
        r=self.request('GET');self.assertEqual(r.status_code,200);p=r.json();self.assertEqual(p['counts'],{'total':5,'unread':3});self.assertEqual(len(p['items']),5)
        self.assertIn('no-store',r.headers['cache-control']);self.assertEqual(r.headers['vary'],'Authorization');self.assertNotIn('user_id',p['items'][0])
        for uid in ['inactive','missing']:self.assertEqual(self.request('GET',uid=uid).status_code,401)
    def test_more_than_100_equal_timestamp_rows_and_stable_insert_boundary(self):
        ids=self.add(125);first=self.page(limit=20);seen=[x['id'] for x in first['items']];new=self.add()[0];cursor=first['next_cursor']
        while cursor:
            page=self.page(limit=20,cursor=cursor);seen.extend(x['id'] for x in page['items']);cursor=page['next_cursor']
        self.assertEqual(seen,list(reversed(ids)));self.assertNotIn(new,seen);self.assertEqual(self.page()['items'][0]['id'],new)
    def test_filters_are_server_side_and_search_is_literal(self):
        a=self.add(kind='dm_message',title='Merhaba %_')[0];self.add(kind='dm_message',title='Merhaba normal');b=self.add(kind='follow',body='İçerikte %_')[0]
        self.assertEqual({x['id'] for x in self.page(q='%_')['items']},{a,b});self.assertEqual([x['id'] for x in self.page(category='messages',q='%_')['items']],[a]);self.assertEqual(self.page(q='yok')['items'],[])
    def test_categories_include_unknown_system_kinds_without_overlap(self):
        samples={'messages':['dm_message','message_request','message_group_invite','message_group_reply'],'social':['follow','story_like','relationship_status','confession','marriage'],'gifts':['gift','dm_gift','couple_gift','donation','ring_credit'],'family':['family_event','family_referral_reward'],'rooms':['room_invite','room_level'],'system':['management','support_ready','ban_account','lidya_purchase','vip_upgrade','future_notice']}
        expected={k:set() for k in samples}
        for category,kinds in samples.items():
            for kind in kinds:expected[category].add(self.add(kind=kind)[0])
        all_seen=set()
        for key,ids in expected.items():
            found={r['id'] for r in self.page(category=key,limit=50)['items']};self.assertEqual(found,ids);self.assertFalse(all_seen&found);all_seen|=found
        self.assertEqual(len(all_seen),sum(map(len,samples.values())))
    def test_cursor_is_bound_to_account_state_category_and_query(self):
        self.add(30);cursor=self.page(limit=5)['next_cursor']
        for params in [{'state':'unread'},{'category':'social'},{'q':'Başlık'}]:self.assertEqual(self.request('GET',params={'cursor':cursor,**params}).status_code,422)
        self.assertEqual(self.request('GET',uid='author',params={'cursor':cursor}).status_code,422)
    def test_bad_keys_query_limits_and_json_shapes_are_rejected(self):
        for cursor in ['!','e30',center.pack([[],0]),center.pack([center.pack(['viewer',[],{},'',1]),1]),center.pack([center.pack(['viewer','all','all','',2]),True])]:self.assertEqual(self.request('GET',params={'cursor':cursor}).status_code,422)
        for params in [{'limit':0},{'limit':51},{'q':'x'*101},{'category':'bogus'},{'state':'bogus'},{'cursor':'a'*2049}]:self.assertEqual(self.request('GET',params=params).status_code,422)
        for data in [[],{},['viewer','all','all','',-1],['viewer','all','all','',True],['viewer',{},'all','',1],['viewer','all',[],'',1]]:self.assertEqual(self.matching(center.pack(data)).status_code,422)
    def test_read_unread_and_global_vs_filtered_counts(self):
        a=self.add(kind='follow')[0];self.add(kind='dm_message');self.add(kind='follow',read=True)
        self.assertEqual(self.page(state='unread',category='social')['matched'],1);self.assertEqual(self.mark([a]).status_code,200);self.assertEqual(self.page()['counts']['unread'],1)
        self.assertEqual(self.page(state='read',category='social')['matched'],2);self.assertEqual(self.mark([a],False).status_code,200);self.assertFalse(self.status()[a])
    def test_selected_repeat_is_idempotent_and_read_never_deletes(self):
        ids=self.add(3)
        for _ in range(2):self.assertEqual(self.mark(ids).json()['count'],3)
        self.assertEqual(self.page()['counts'],{'total':3,'unread':0});self.assertEqual(set(self.status()),set(ids));self.assertEqual(self.mark(ids,False).json()['counts']['unread'],3)
    def test_mixed_owner_and_missing_selection_are_all_or_nothing(self):
        mine=self.add()[0];foreign=self.add(uid='author')[0]
        for ids in [[mine,foreign],[mine,99999]]:self.assertEqual(self.mark(ids).status_code,404);self.assertFalse(self.status()[mine])
        self.assertEqual(self.mark([mine],uid='author').status_code,404)
    def test_selection_is_strict_unique_and_bounded_to_50(self):
        ids=self.add(51)
        for selection in [[],ids,[ids[0],ids[0]],[True],['1'],[1.5],[0],[-1],[2147483648]]:self.assertEqual(self.mark(selection).status_code,422)
        self.assertEqual(self.request('POST','/read',json={'ids':ids[:1],'read':'yes'}).status_code,422);self.assertEqual(self.mark(ids[:50]).status_code,200);self.assertFalse(self.status()[ids[-1]])
    def test_matching_read_covers_all_pages_but_excludes_new_arrivals(self):
        old=self.add(115);page=self.page();new=self.add()[0];foreign=self.add(uid='author')[0]
        r=self.matching(page['snapshot']);self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['count'],115);states=self.status();self.assertTrue(all(states[i] for i in old));self.assertFalse(states[new]);self.assertFalse(states[foreign])
        self.assertEqual(self.matching(page['snapshot']).json()['count'],0)
    def test_matching_read_respects_category_query_state_and_owner(self):
        target=self.add(kind='follow',body='Özel %_')[0];other=self.add(kind='dm_message',body='Özel %_')[0];different=self.add(kind='follow',body='Sıradan')[0];already=self.add(kind='follow',body='Özel %_',read=True)[0]
        page=self.page(category='social',q='%_',state='unread');self.assertEqual(page['matched_unread'],1);self.assertEqual(self.matching(page['snapshot'],uid='author').status_code,422)
        self.assertEqual(self.matching(page['snapshot']).json()['count'],1);states=self.status();self.assertTrue(states[target]);self.assertTrue(states[already]);self.assertFalse(states[other]);self.assertFalse(states[different])
        self.assertEqual(self.matching(self.page(state='read')['snapshot']).json()['count'],0)
    def test_disabled_notifications_hide_history_and_reject_changes_without_destroying_it(self):
        ids=self.add(2);snapshot=self.page()['snapshot']
        with Session(self.engine) as db:db.get(User,'viewer').notifications_enabled=False;db.commit()
        page=self.page();self.assertFalse(page['enabled']);self.assertEqual(page['items'],[]);self.assertEqual(page['counts'],{'total':0,'unread':0});self.assertIsNone(page['snapshot'])
        self.assertEqual(self.mark(ids).status_code,409);self.assertEqual(self.matching(snapshot).status_code,409);self.assertFalse(any(self.status().values()))
        with Session(self.engine) as db:db.get(User,'viewer').notifications_enabled=True;db.commit()
        self.assertEqual(self.page()['counts']['total'],2)
    def test_empty_history_and_zero_snapshot_are_usable(self):
        p=self.page();self.assertEqual(p['items'],[]);self.assertFalse(p['has_more']);self.assertIsNone(p['next_cursor']);self.assertEqual(self.matching(p['snapshot']).json()['count'],0)
        fresh=self.add()[0];self.assertEqual(self.matching(p['snapshot']).json()['count'],0);self.assertFalse(self.status()[fresh])
    def test_legacy_banner_reader_and_read_handler_see_same_records(self):
        ids=self.add(3);self.mark([ids[-1]]);r=self.client.get('/legacy');self.assertEqual(r.status_code,200);self.assertTrue(next(x for x in r.json() if x['id']==ids[-1])['read'])
        self.assertEqual(self.client.post('/legacy/'+str(ids[0])+'/read').status_code,200);self.assertEqual(self.page()['counts']['unread'],1)
        self.assertEqual(self.client.post('/legacy/'+str(ids[0])+'/read',headers={'x-user':'author'}).status_code,404)
    def test_history_operations_leave_balance_and_unrelated_profile_preferences_intact(self):
        with Session(self.engine) as db:u=db.get(User,'viewer');u.lidya=987;u.bio='Korunsun';db.commit()
        ids=self.add(4);self.mark(ids);self.mark(ids[:1],False);self.matching(self.page()['snapshot'])
        with Session(self.engine) as db:u=db.get(User,'viewer');self.assertEqual(u.lidya,987);self.assertEqual(u.bio,'Korunsun');self.assertTrue(u.notifications_enabled)

if __name__=='__main__':unittest.main()
