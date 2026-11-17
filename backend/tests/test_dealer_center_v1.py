"""Isolated LB center V1 regression tests; no live database or payments."""
import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.db import Base
from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app.dealer_routes import DealerInventory, DealerTransfer
from backend.app import dealer_public_center as center

class DealerCenterV1Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        center.register_auth(lambda: None)
        cls.routes = {r.path:r.endpoint for r in center.router.routes}

    def setUp(self):
        self.engine = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread':False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine, tables=[User.__table__, AdminRole.__table__, DealerInventory.__table__, DealerTransfer.__table__, center.DealerPresence.__table__, center.DealerReview.__table__])
        self.db = sessionmaker(bind=self.engine,expire_on_commit=False)()
        self.dealer = self.user('dealer','810001')
        self.dealer2 = self.user('dealer2','810002')
        self.buyer = self.user('buyer','810003')
        self.other = self.user('other','810004')
        self.db.add_all([DealerInventory(user_id='dealer',stock=100,active=True),DealerInventory(user_id='dealer2',stock=100,active=True)])
        self.db.commit()

    def tearDown(self):
        self.db.rollback();self.db.close();self.engine.dispose()

    def user(self,id,public_id):
        u=User(id=id,public_id=public_id,_nickname=id,is_active=True,lidya=0)
        self.db.add(u);self.db.flush();return u

    def invoke(self,path,user=None,**kwargs):
        return self.routes[path](db=self.db,user=user or self.buyer,**kwargs)

    def err(self,code,fn):
        with self.assertRaises(HTTPException) as caught:fn()
        self.assertEqual(caught.exception.status_code,code)
        self.db.rollback()

    def tx(self,dealer='dealer',receiver='buyer'):
        t=DealerTransfer(id=str(uuid4()),dealer_id=dealer,recipient_id=receiver,amount=25,request_key=str(uuid4()),created_at=datetime.now(timezone.utc))
        self.db.add(t);self.db.commit();return t

    def review(self,tx,user=None,speed=5,communication=5,reliability=5,satisfaction=5):
        return self.invoke('/v1/dealer-center/reviews',user=user or self.buyer,body=center.ReviewBody(transfer_id=tx.id,speed=speed,communication=communication,reliability=reliability,satisfaction=satisfaction))

    def online(self):return self.invoke('/v1/dealer-center/online')['items']

    def test_01_only_lb_can_ping(self):
        self.err(403,lambda:self.invoke('/v1/dealer-center/heartbeat',user=self.buyer))
        self.assertEqual(self.online(),[])

    def test_02_heartbeat_online_and_offline(self):
        self.invoke('/v1/dealer-center/heartbeat',user=self.dealer)
        self.assertEqual([x['user_id'] for x in self.online()],['dealer'])
        self.invoke('/v1/dealer-center/offline',user=self.dealer)
        self.assertEqual(self.online(),[])

    def test_03_stale_presence_excluded(self):
        self.invoke('/v1/dealer-center/heartbeat',user=self.dealer)
        self.db.get(center.DealerPresence,'dealer').seen_at=datetime.now(timezone.utc)-timedelta(seconds=40)
        self.db.commit()
        self.assertEqual(self.online(),[])

    def test_04_disabled_lb_is_not_listed(self):
        self.invoke('/v1/dealer-center/heartbeat',user=self.dealer)
        self.db.get(DealerInventory,'dealer').active=False;self.db.commit()
        self.assertEqual(self.online(),[])
        self.err(403,lambda:self.invoke('/v1/dealer-center/heartbeat',user=self.dealer))

    def test_05_only_recipient_can_review(self):
        tx=self.tx()
        self.err(403,lambda:self.review(tx,user=self.other))
        self.assertEqual(self.review(tx),{'ok':True})

    def test_06_cannot_review_twice(self):
        tx=self.tx();self.review(tx)
        self.err(409,lambda:self.review(tx))
        self.assertEqual(self.db.query(center.DealerReview).count(),1)

    def test_07_range_validation(self):
        with self.assertRaises(ValidationError):center.ReviewBody(transfer_id='abc',speed=0,communication=5,reliability=5,satisfaction=5)
        with self.assertRaises(ValidationError):center.ReviewBody(transfer_id='abc',speed=5,communication=6,reliability=5,satisfaction=5)

    def test_08_reviewable_only_actual_transfer(self):
        own=self.tx();self.tx(receiver='other')
        rows=self.invoke('/v1/dealer-center/reviewable',dealer_id='dealer')['items']
        self.assertEqual([x['transfer_id'] for x in rows],[own.id])
        self.review(own)
        self.assertEqual(self.invoke('/v1/dealer-center/reviewable',dealer_id='dealer')['items'],[])

    def test_09_daily_ranking_updates_after_review(self):
        self.invoke('/v1/dealer-center/heartbeat',user=self.dealer)
        self.invoke('/v1/dealer-center/heartbeat',user=self.dealer2)
        before=self.online()
        self.assertEqual(len(before),2)
        tx=self.tx(dealer='dealer2')
        self.review(tx)
        self.assertEqual(self.online()[0]['user_id'],'dealer2')
        self.assertEqual(self.online()[0]['review_count'],1)

    def test_10_rating_is_read_only_for_balances(self):
        tx=self.tx()
        before=(self.db.get(User,'buyer').lidya,self.db.get(DealerInventory,'dealer').stock)
        self.review(tx)
        after=(self.db.get(User,'buyer').lidya,self.db.get(DealerInventory,'dealer').stock)
        self.assertEqual(before,after)

if __name__=='__main__':unittest.main()
