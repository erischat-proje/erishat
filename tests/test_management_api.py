"""Real router/DB tests for the management menu (no production data)."""
import os
os.environ.setdefault('DATABASE_URL', 'sqlite://')
import unittest
from datetime import timedelta
from fastapi import FastAPI, APIRouter, Depends, Header, HTTPException
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from backend.app.db import Base, get_db
from backend.app.models import User
from backend.app.room_models import Room
from backend.app.admin_models import AdminRole, AdminAuditLog, ChatBan
from backend.app.case_models import ManagementCase, ManagementCaseEvent
from backend.app.emergency_models import EmergencyChatAction
from backend.app.purchase_models import LidyaOperation, LidyaOrder
from backend.app.platform_models import VipStatus
from backend.app import case_routes, emergency_routes, finance_audit, fraud_review, admin_routes
from backend.app.management_readiness import check_management_ready, REQUIRED_ROUTES

class ManagementAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine('sqlite://', connect_args={'check_same_thread':False}, poolclass=StaticPool)
        cls.app = FastAPI()
        def identity(x_test_user: str = Header(default=''), db:Session=Depends(get_db)):
            user = db.get(User,x_test_user) if x_test_user else None
            if not user:raise HTTPException(401,'Test identity required')
            return user
        for mod in (case_routes, emergency_routes, finance_audit, fraud_review):
            with patch.object(mod,'router',APIRouter(prefix=mod.router.prefix)):
                cls.app.include_router(mod.register_auth(identity))
        with patch.object(admin_routes,'router',APIRouter(prefix=admin_routes.router.prefix)):
            cls.app.include_router(admin_routes.register_admin_auth(identity))
        def session():
            with Session(cls.engine) as db:yield db
        cls.app.dependency_overrides[get_db] = session
        cls.client = TestClient(cls.app)
        cls.tables = [m.__table__ for m in (User,AdminRole,AdminAuditLog,ChatBan,ManagementCase,ManagementCaseEvent,EmergencyChatAction,LidyaOperation,LidyaOrder,VipStatus)]
    def setUp(self):
        Base.metadata.create_all(self.engine,tables=self.tables)
        with Session(self.engine) as db:
            for index,role in enumerate(('SA','UA','FA','DA','USER','INACTIVE')):
                db.add(User(id=role,public_id=str(1000000000+index),nickname=role,is_active=role!='INACTIVE'))
            db.flush()
            for role in ('SA','UA','FA','DA','INACTIVE'):
                db.add(AdminRole(user_id=role,role='DA' if role=='INACTIVE' else role))
            db.add(ManagementCase(id=1,reporter_id='UA',target_user_id='USER',category='harassment',summary='A real fixture incident',status='open'))
            db.commit()
    def tearDown(self):Base.metadata.drop_all(self.engine,tables=list(reversed(self.tables)))
    def request(self,path,role='DA',method='GET',**kw):
        return self.client.request(method,path,headers={'X-Test-User':role},**kw)
    def test_all_new_read_paths_exist_and_require_auth(self):
        for path in sorted(REQUIRED_ROUTES-{'/v1/admin/operations/emergency-chat'}):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code,401)
                self.assertEqual(self.request(path).status_code,200)
    def test_finance_and_fraud_are_da_only(self):
        for role in ('SA','UA','FA','USER','INACTIVE'):
            for path in ('/v1/admin/finance-audit/overview','/v1/admin/fraud-review/signals'):
                with self.subTest(role=role,path=path):self.assertEqual(self.request(path,role).status_code,403)
    def test_audit_history_is_da_only(self):
        for rank in ('SA','UA','FA','DA'):
            path='/v1/admin/role-actions/'+rank
            self.assertEqual(self.request(path,'DA').status_code,200)
            self.assertEqual(self.request(path,'UA').status_code,403)
            self.assertEqual(self.client.get(path).status_code,401)
    def test_finance_reads_preserve_balances(self):
        with Session(self.engine) as db:
            db.get(User,'USER').lidya=75
            db.add(LidyaOperation(id='op',request_key='op',admin_id='DA',admin_role='DA',admin_name='DA',user_id='USER',public_id='1000000004',amount=10,before=10,after=99,operation='EKLEME',evidence='',exemption_sha=''))
            db.commit()
        overview=self.request('/v1/admin/finance-audit/overview').json()
        self.assertEqual(overview['manual_operation_count'],1)
        self.assertFalse(self.request('/v1/admin/finance-audit/manual-operations').json()['items'][0]['balanced'])
        self.assertTrue(self.request('/v1/admin/fraud-review/signals').json()['findings'])
        with Session(self.engine) as db:
            self.assertEqual(db.get(User,'USER').lidya,75)
            self.assertEqual(db.get(LidyaOperation,'op').after,99)
    def test_scoped_cases_and_inactive_denial(self):
        self.assertEqual(self.request('/v1/admin/cases','SA').json(),[])
        self.assertEqual(len(self.request('/v1/admin/cases','UA').json()),1)
        self.assertEqual(self.request('/v1/admin/cases','INACTIVE').status_code,403)
        self.assertEqual(self.request('/v1/admin/operations/overview','USER').status_code,403)
    def test_emergency_duration_cooldown_and_audit(self):
        payload={'case_id':1,'target_public_id':'1000000004','reason':'Immediate protective measure for fixture harassment','minutes':61}
        self.assertEqual(self.request('/v1/admin/operations/emergency-chat','UA',method='POST',json=payload).status_code,422)
        payload['minutes']=60
        self.assertEqual(self.request('/v1/admin/operations/emergency-chat','SA',method='POST',json=payload).status_code,403)
        result=self.request('/v1/admin/operations/emergency-chat','UA',method='POST',json=payload)
        self.assertEqual(result.status_code,201,result.text)
        self.assertEqual(self.request('/v1/admin/operations/emergency-chat','DA',method='POST',json=payload).status_code,409)
        with Session(self.engine) as db:
            self.assertIsNotNone(db.scalar(select(ChatBan).where(ChatBan.user_id=='USER')))
            self.assertIsNotNone(db.scalar(select(AdminAuditLog).where(AdminAuditLog.action=='emergency_chat')))
            self.assertEqual(db.get(User,'USER').lidya,0)
    def test_readiness_rejects_missing_router_or_schema(self):
        with self.engine.connect() as conn:
            check_management_ready(self.app,conn)
            with self.assertRaises(RuntimeError):check_management_ready(FastAPI(),conn)
        with self.engine.begin() as conn:EmergencyChatAction.__table__.drop(conn)
        with self.engine.connect() as conn:
            with self.assertRaises(RuntimeError):check_management_ready(self.app,conn)
        EmergencyChatAction.__table__.create(self.engine)

if __name__=='__main__':unittest.main()
