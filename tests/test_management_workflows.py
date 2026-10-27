"""End-to-end router/SQLite workflows; disposable DB, no live operations."""
import base64,json,sys
from io import BytesIO
from unittest.mock import patch
from datetime import timedelta
from uuid import uuid4
from PIL import Image
from sqlalchemy import select,func,BigInteger
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
import test_management_api as shared
from backend.app.models import User
from backend.app.admin_models import AdminRole,AdminAuditLog,BanApproval
from backend.app.case_models import ManagementCase,ManagementCaseEvent
from backend.app.management_workflow_models import ManagementEvidence,ManagementFinanceRequest,ManagementSignalReview
from backend.app.purchase_models import LidyaOperation
from backend.app.payment_assistance_models import PaymentRequest
from backend.app.ban_workflow_models import BanWorkflow,BanPresence,BanReviewSession,BanEvent
from backend.app.room_ban_models import RoomBanRequestBinding
from backend.app.chat_ban_models import ChatBanRequestBinding
from backend.app.support_models import SupportAgent
from backend.app.platform_models import Notification
from backend.app import system_data,purchase_routes

@compiles(BigInteger,'sqlite')
def sqlite_int(type_,compiler,**kw):return 'INTEGER'

def photo():
    b=BytesIO();Image.new('RGB',(12,12),'gold').save(b,'PNG')
    return 'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()

class Workflows(shared.ManagementAPI):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tables.extend(m.__table__ for m in (PaymentRequest,BanApproval,BanWorkflow,BanPresence,BanReviewSession,BanEvent,RoomBanRequestBinding,ChatBanRequestBinding,SupportAgent,system_data.LidyaLedger) if m.__table__ not in cls.tables)
        cls.log_patch=patch.object(system_data,'record',lambda *a,**k:None);cls.log_patch.start()
    @classmethod
    def tearDownClass(cls):cls.log_patch.stop();cls.client.close();cls.engine.dispose()
    def setUp(self):
        super().setUp()
        with Session(self.engine) as db:
            for uid,role,pid in [('FA2','FA','2000000001'),('DA2','DA','2000000002'),('UA2','UA','2000000003')]:
                db.add(User(id=uid,public_id=pid,nickname=uid));db.flush();db.add(AdminRole(user_id=uid,role=role))
            db.commit()
    def call(self,role,path,payload):return self.request(path,role,method='POST',json=payload)
    def case(self,role='UA',target='1000000004'):
        r=self.call(role,'/v1/admin/cases',{'category':'harassment','summary':'A sufficiently detailed new incident summary','target_public_id':target});self.assertEqual(r.status_code,201,r.text);return r.json()['id']
    def finance(self,role='FA',operation='EKLEME',amount=50,key=None):
        return self.call(role,'/v1/admin/management/finance-requests',{'target_public_id':'1000000004','operation':operation,'amount':amount,'reason':'A documented correction with verified source evidence','evidence':photo(),'request_key':key or str(uuid4())})
    def reviewed_finance(self,operation='EKLEME'):
        r=self.finance(operation=operation);self.assertEqual(r.status_code,201,r.text);rid=r.json()['id']
        r=self.call('FA2',f'/v1/admin/management/finance-requests/{rid}/review',{'approve':True,'note':'Independent evidence and amount verified'});self.assertEqual(r.status_code,200,r.text);return rid
    def test_case_create_search_assignment_notification_and_history(self):
        cid=self.case();p=f'/v1/admin/cases/{cid}'
        r=self.call('FA',p+'/assign',{'assignee_id':'SA','note':'Review the original complaint evidence'});self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(self.request(p,'UA2').status_code,403)
        self.assertEqual(self.request(p,'SA').status_code,200)
        r=self.call('SA',p+'/notes',{'note':'Evidence was checked against the support record'});self.assertEqual(r.status_code,201,r.text)
        self.assertEqual(self.request('/v1/admin/cases?q=1000000004&assigned_to_me=true','SA').json()[0]['id'],cid)
        with Session(self.engine) as db:self.assertIsNotNone(db.scalar(select(Notification).where(Notification.user_id=='SA')))
        self.assertTrue(any(e['event']=='assigned' for e in self.request(p,'FA').json()['history']))
    def test_case_final_decision_requires_independence_and_locks_closed(self):
        cid=self.case('FA');p=f'/v1/admin/cases/{cid}'
        payload={'status':'resolved','note':'The evidence supports the final incident disposition','expected_status':'open'}
        self.assertEqual(self.call('FA',p+'/status',payload).status_code,403)
        self.assertEqual(self.call('UA',p+'/status',payload).status_code,403)
        self.assertEqual(self.call('FA2',p+'/status',payload).status_code,200)
        self.assertEqual(self.call('FA2',p+'/notes',{'note':'No mutation should be allowed on a closed case'}).status_code,409)
    def test_assigned_investigator_cannot_decide_and_stale_status_rejected(self):
        cid=self.case();p=f'/v1/admin/cases/{cid}'
        self.call('DA',p+'/assign',{'assignee_id':'FA','note':'Investigate this complaint and submit findings'})
        self.assertFalse(self.request(p,'FA').json()['can_decide'])
        self.assertEqual(self.call('FA',p+'/status',{'status':'resolved','note':'Must be decided independently'}).status_code,403)
        self.assertEqual(self.call('UA',p+'/status',{'status':'investigating','note':'The original evidence is being investigated','expected_status':'awaiting_decision'}).status_code,409)
    def test_evidence_is_private_deduplicated_and_audited(self):
        cid=self.case();p=f'/v1/admin/cases/{cid}'
        data={'description':'Screenshot documenting the reported conduct','image':photo()}
        first=self.call('UA',p+'/evidence-upload',data);self.assertEqual(first.status_code,201,first.text)
        eid=first.json()['id'];self.assertTrue(self.call('UA',p+'/evidence-upload',data).json()['duplicate'])
        self.assertEqual(self.request(p+f'/evidence/{eid}','UA2').status_code,403)
        r=self.request(p+f'/evidence/{eid}','FA');self.assertEqual(r.status_code,200);self.assertEqual(r.headers['cache-control'],'no-store')
        wrong=self.case();self.assertEqual(self.request(f'/v1/admin/cases/{wrong}/evidence/{eid}','FA').status_code,404)
        with Session(self.engine) as db:self.assertEqual(db.scalar(select(func.count()).select_from(ManagementEvidence)),1)
    def test_invalid_and_whitespace_evidence_and_notes_are_rejected(self):
        cid=self.case();p=f'/v1/admin/cases/{cid}'
        self.assertEqual(self.call('UA',p+'/notes',{'note':' '*25}).status_code,422)
        self.assertEqual(self.call('UA',p+'/evidence',{'reference':'https://example.test/proof','description':'External fetching must not be performed'}).status_code,422)
        self.assertEqual(self.call('UA',p+'/evidence-upload',{'image':'data:image/png;base64,YWJj','description':'Bad proof bytes must be rejected'}).status_code,422)
    def test_emergency_history_and_independent_revoke_only_exact_ban(self):
        r=self.call('UA','/v1/admin/operations/emergency-chat',{'case_id':1,'target_public_id':'1000000004','reason':'An immediate and documented protective restriction','minutes':15});self.assertEqual(r.status_code,201,r.text)
        aid=r.json()['action_id'];p=f'/v1/admin/operations/emergency-chat/{aid}/revoke'
        self.assertTrue(self.request('/v1/admin/operations/emergency-chat?active_only=true','UA').json()['items'][0]['active'])
        self.assertEqual(self.call('UA',p,{'note':'Cannot reverse without a decision authority'}).status_code,403)
        r=self.call('FA',p,{'note':'Independent review found the temporary restriction unnecessary'});self.assertEqual(r.status_code,200,r.text);self.assertFalse(r.json()['active'])
        self.assertEqual(self.call('FA',p,{'note':'Repeat revocation must not create new side effects'}).status_code,200)
        self.assertEqual(self.request('/v1/admin/operations/emergency-chat?active_only=true','FA').json()['items'],[])
    def test_case_sanction_needs_proof_and_stays_pending_even_for_da(self):
        cid=self.case('DA');p=f'/v1/admin/cases/{cid}'
        payload={'kind':'chat','days':1,'note':'Evidence-backed review of the reported chat abuse'}
        self.assertEqual(self.call('DA',p+'/sanction-request',payload).status_code,422)
        self.call('DA',p+'/evidence',{'reference':'message:fixture-1','description':'An internal complaint record supporting the request'})
        r=self.call('DA',p+'/sanction-request',payload);self.assertEqual(r.status_code,201,r.text)
        with Session(self.engine) as db:self.assertEqual(db.get(BanApproval,r.json()['request_id']).status,'pending')
        self.assertEqual(self.call('DA',p+'/sanction-request',payload).status_code,409)
    def test_finance_role_identity_and_idempotent_request(self):
        key=str(uuid4());first=self.finance(key=key);self.assertEqual(first.status_code,201,first.text)
        second=self.finance(key=key);self.assertEqual(first.json()['id'],second.json()['id'])
        self.assertEqual(self.finance(amount=51,key=key).status_code,409)
        self.assertEqual(self.finance(role='UA').status_code,403)
        self.assertEqual(self.finance(amount=True).status_code,422)
        self.assertEqual(self.finance(amount=1.5).status_code,422)
        with Session(self.engine) as db:self.assertEqual(db.get(User,'USER').lidya,0)
    def test_da_direct_approval_including_own_request(self):
        for creator in ['FA','DA']:
            r=self.finance(role=creator);rid=r.json()['id'];p=f'/v1/admin/management/finance-requests/{rid}'
            payload={'approve':True,'note':'DA reviewed the evidence and approved the recorded amount'}
            self.assertTrue(self.request(p,'DA').json()['can_execute'])
            self.assertFalse(self.request(p,'FA').json()['can_execute'])
            self.assertEqual(self.call('FA',p+'/decision',payload).status_code,403)
            result=self.call('DA',p+'/decision',payload)
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['status'],'executed')
            again=self.call('DA2',p+'/decision',payload)
            self.assertEqual(again.status_code,200,again.text)
            self.assertEqual(again.json()['operation_id'],result.json()['operation_id'])
        with Session(self.engine) as db:self.assertEqual(db.get(User,'USER').lidya,100)
    def test_da_reviewer_can_execute_existing_reviewed_request(self):
        rid=self.finance().json()['id'];p=f'/v1/admin/management/finance-requests/{rid}'
        payload={'approve':True,'note':'DA verified the evidence and approves this pending request'}
        self.assertEqual(self.call('DA',p+'/review',payload).status_code,200)
        self.assertTrue(self.request(p,'DA').json()['can_execute'])
        self.assertEqual(self.call('DA',p+'/decision',payload).status_code,200)
    def test_finance_commit_is_idempotent_with_one_receipt_and_ledger(self):
        rid=self.reviewed_finance();p=f'/v1/admin/management/finance-requests/{rid}/decision';payload={'approve':True,'note':'Final independent approval with verified evidence'}
        r=self.call('DA',p,payload);self.assertEqual(r.status_code,200,r.text);operation_id=r.json()['operation_id']
        again=self.call('DA',p,payload);self.assertEqual(again.status_code,200,again.text);self.assertEqual(again.json()['operation_id'],operation_id)
        with Session(self.engine) as db:
            self.assertEqual(db.get(User,'USER').lidya,50)
            self.assertEqual(db.scalar(select(func.count()).select_from(LidyaOperation)),1)
            self.assertEqual(db.scalar(select(func.count()).select_from(system_data.LidyaLedger).where(system_data.LidyaLedger.reference_id==operation_id)),1)
    def test_finance_failure_rolls_back_wallet_receipt_and_state(self):
        rid=self.reviewed_finance();p=f'/v1/admin/management/finance-requests/{rid}/decision'
        with patch('backend.app.management_workflows.audit',side_effect=RuntimeError('test transaction failure')):
            with self.assertRaises(RuntimeError):self.call('DA',p,{'approve':True,'note':'This approval must roll back when the audit fails'})
        with Session(self.engine) as db:
            self.assertEqual(db.get(User,'USER').lidya,0)
            self.assertEqual(db.get(ManagementFinanceRequest,rid).status,'reviewed')
            self.assertEqual(db.scalar(select(func.count()).select_from(LidyaOperation)),0)
    def test_insufficient_funds_and_direct_legacy_bypass(self):
        rid=self.reviewed_finance('ÇIKARMA');r=self.call('DA',f'/v1/admin/management/finance-requests/{rid}/decision',{'approve':True,'note':'The insufficient balance must prevent withdrawal'});self.assertEqual(r.status_code,422,r.text)
        r=self.call('DA','/v1/admin/users/1000000004/lidya/add',{'amount':50,'request_key':str(uuid4()),'evidence':photo()});self.assertEqual(r.status_code,409,r.text)
    def test_signal_review_requires_matching_case_and_preserves_balance(self):
        with Session(self.engine) as db:
            db.add(LidyaOperation(id='signal-op',request_key='signal-op',admin_id='DA',admin_role='DA',admin_name='DA',user_id='USER',public_id='1000000004',amount=5,before=1,after=100,operation='EKLEME',evidence='',exemption_sha=''));db.commit()
        p='/v1/admin/management/signal-reviews';payload={'operation_id':'signal-op','signal_type':'balance_delta_mismatch','status':'escalated','case_id':1,'note':'Escalating the mismatching manual operation for independent review'}
        self.assertEqual(self.call('FA',p,payload).status_code,403)
        self.assertEqual(self.call('DA',p,{**payload,'case_id':None}).status_code,422)
        self.assertEqual(self.call('DA',p,payload).status_code,200)
        self.assertEqual(self.call('DA',p,payload).status_code,200)
        with Session(self.engine) as db:
            self.assertEqual(db.get(User,'USER').lidya,0)
            self.assertEqual(db.scalar(select(func.count()).select_from(ManagementSignalReview)),1)
    def test_reassignment_cannot_erase_investigator_conflict(self):
        cid=self.case();p=f'/v1/admin/cases/{cid}'
        for assignee in ['FA','SA']:
            self.assertEqual(self.call('DA',p+'/assign',{'assignee_id':assignee,'note':'Assign an investigator for this case review'}).status_code,200)
        self.assertEqual(self.call('FA',p+'/status',{'status':'resolved','note':'Former investigator must remain ineligible'}).status_code,403)
    def test_pending_sanction_blocks_case_closure(self):
        cid=self.case();p=f'/v1/admin/cases/{cid}'
        self.call('UA',p+'/evidence',{'reference':'message:record-one','description':'The complaint is supported by an internal message record'})
        self.assertEqual(self.call('UA',p+'/sanction-request',{'kind':'chat','days':1,'note':'Requesting independent action based on the recorded evidence'}).status_code,201)
        r=self.request(p,'FA');self.assertEqual(r.json()['linked_sanctions'][0]['status'],'pending')
        self.assertEqual(self.call('FA',p+'/status',{'status':'resolved','note':'Pending sanction must be decided before final case closure'}).status_code,409)
    def test_exact_large_integer_and_no_self_clearance(self):
        r=self.finance(amount='9007199254740993');self.assertEqual(r.status_code,201,r.text);self.assertEqual(r.json()['amount'],'9007199254740993')
        with Session(self.engine) as db:
            db.add(LidyaOperation(id='own-signal',request_key='own-signal',admin_id='DA',admin_role='DA',admin_name='DA',user_id='USER',public_id='1000000004',amount=5,before=1,after=100,operation='EKLEME',evidence='',exemption_sha=''));db.commit()
        payload={'operation_id':'own-signal','signal_type':'balance_delta_mismatch','status':'cleared','note':'Own financial signal cannot be independently cleared by its operator'}
        self.assertEqual(self.call('DA','/v1/admin/management/signal-reviews',payload).status_code,403)
        self.assertEqual(self.call('DA2','/v1/admin/management/signal-reviews',payload).status_code,200)
    def test_audit_filters_and_private_financial_evidence(self):
        cid=self.case();rid=self.finance().json()['id']
        p=f'/v1/admin/management/finance-requests/{rid}/evidence'
        self.assertEqual(self.request(p,'UA').status_code,403)
        self.assertEqual(self.request(p,'FA').headers['cache-control'],'no-store')
        r=self.request('/v1/admin/management/audit?role=FA&actor=1000000002&action=finance','DA');self.assertEqual(r.status_code,200,r.text)
        self.assertTrue(r.json()['items']);self.assertTrue(all(x['role']=='FA' for x in r.json()['items']))
        self.assertEqual(self.request('/v1/admin/management/audit','FA').status_code,403)

if __name__=='__main__':
    import unittest;unittest.main()
