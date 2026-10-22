"""Real upper-button workflows with isolated SQLite; no production account or data."""
import json
from datetime import datetime,timezone,timedelta
from uuid import uuid4
from unittest.mock import patch
from fastapi import APIRouter,Depends,Header,HTTPException
from sqlalchemy import select,func
from sqlalchemy.orm import Session
import test_management_api as shared
from test_management_workflows import photo
from backend.app.db import get_db
from backend.app.models import User
from backend.app.admin_models import AdminRole,SupportAssignment,SupportMessage,BanApproval,BanAppeal,UserBan,ChatBan,SystemAnnouncement
from backend.app.support_models import SupportTicket,SupportFlow,SupportReview
from backend.app.suggestion_models import UserSuggestion,SuggestionReviewSession,SuggestionEvent
from backend.app.admin_operations_models import OperationHistory,OperationCaseLink,FeedbackWork,AnnouncementDraft
from backend.app.referral_models import ReferralCode,ReferralRedemption
from backend.app.case_models import ManagementCase
from backend.app.ban_workflow_models import BanWorkflow,BanReviewSession,BanPresence,BanEvent
from backend.app.room_ban_models import RoomBanRequestBinding,RoomUserBan,BanRestrictionReason
from backend.app.chat_ban_models import ChatBanRequestBinding
from backend.app.room_models import Room
from backend.app import ban_workflow,suggestion_routes
from backend.app.payment_assistance_models import PaymentRequest

class Operations(shared.ManagementAPI):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tables.extend([m.__table__ for m in (BanApproval,BanAppeal,BanWorkflow,BanReviewSession,BanPresence,BanEvent,RoomBanRequestBinding,RoomUserBan,BanRestrictionReason,ChatBanRequestBinding,SuggestionReviewSession,SuggestionEvent,SupportReview,PaymentRequest)])
        def identity(x_test_user:str=Header(default=''),db:Session=Depends(get_db)):
            user=db.get(User,x_test_user) if x_test_user else None
            if not user:raise HTTPException(401,'Fixture identity required')
            return user
        for module in (ban_workflow,suggestion_routes):
            with patch.object(module,'router',APIRouter(prefix=module.router.prefix)):
                cls.app.include_router(module.register_auth(identity))
    def setUp(self):
        super().setUp()
        with Session(self.engine) as db:
            for uid,role,pid in [('FA2','FA','2000000001'),('DA2','DA','2000000002')]:
                db.add(User(id=uid,public_id=pid,nickname=uid));db.flush();db.add(AdminRole(user_id=uid,role=role))
            for tid,agent in [(1,'SA'),(2,'UA')]:
                db.add(SupportTicket(id=tid,user_id='USER',category='account',subject='Assigned private fixture '+str(tid),message='Private initial complaint'));db.flush()
                db.add(SupportFlow(ticket_id=tid,phase='active',snapshot='',context_json='{}',not_assigned_json='[]',tier=0,customer_read_id=0,agent_read_id=0));db.add(SupportAssignment(ticket_id=tid,admin_id=agent,decision='accepted'))
            db.add(UserSuggestion(id=1,user_id='USER',message='A concrete product improvement idea'))
            db.add(ReferralCode(id=1,code='FIXTURECODE',kind='USER',max_uses=5,uses=1,created_by='DA',active=True));db.flush();db.add(ReferralRedemption(code_id=1,user_id='USER',amount=2500))
            for rid,state in [(10,'rejected'),(11,'pending')]:
                db.add(BanApproval(id=rid,requester_id='UA',target_user_id='USER',kind='account',days=1,reason='An original documented complaint',status=state,decision_by='FA' if state=='rejected' else None));db.flush()
                db.add(BanWorkflow(approval_id=rid,assigned_id='FA',requester_role='UA',reviewer_role='FA' if state=='rejected' else None,evidence_json='[]',skipped_json='[]',log_text='Original rejected request' if state=='rejected' else ''))
            db.commit()
    def post(self,path,data,role='DA'):return self.request('/v1/admin/operations-desk'+path,role,method='POST',json=data)
    def draft(self,role='FA',key=None):return self.post('/announcement-drafts',{'message':'A reviewed announcement message for all users','request_key':key or str(uuid4())},role)
    def ack(self,role='DA'):
        r=self.request('/v1/suggestions/admin/1',role);self.assertEqual(r.status_code,200,r.text)
        r=self.request('/v1/suggestions/admin/1/read',role,method='POST');self.assertEqual(r.status_code,200,r.text)
    def appeal(self):
        r=self.request('/v1/admin/ban-workflow/requests/10/appeal','UA',method='POST',json={'reason':'New evidence requires independent reconsideration','explanation':'The attached source photo addresses the earlier decision','images':[photo()]});self.assertEqual(r.status_code,201,r.text);return r.json()['id']
    def test_support_list_and_notes_do_not_escape_assignment(self):
        for role,expected in [('SA',[1]),('UA',[2]),('DA',[])]:self.assertEqual([r['id'] for r in self.request('/v1/admin/operations-desk/support',role).json()['items']],expected)
        self.assertEqual(self.request('/v1/admin/operations-desk/support?q=1000000004','SA').json()['items'],[])
        self.assertEqual(self.post('/sources/support/2/notes',{'note':'An internal note must remain in the assigned support scope','request_key':str(uuid4())},'SA').status_code,403)
        self.assertEqual(self.request('/v1/admin/operations-desk/support','USER').status_code,403)
    def test_internal_note_retry_and_customer_denial(self):
        data={'note':'An internal note describing the verified source evidence','request_key':str(uuid4())};r=self.post('/sources/support/1/notes',data,'SA');self.assertEqual(r.status_code,201,r.text);self.assertEqual(self.post('/sources/support/01/notes',data,'SA').json()['id'],r.json()['id'])
        self.assertEqual(self.request('/v1/admin/operations-desk/sources/support/1','USER').status_code,403)
        self.assertEqual(self.request('/v1/admin/operations-desk/sources/support/1','UA').status_code,403)
        with Session(self.engine) as db:self.assertEqual(db.scalar(select(func.count()).select_from(OperationHistory).where(OperationHistory.action=='internal_note')),1)
    def test_source_to_case_is_atomic_idempotent_and_preserves_hidden_identity(self):
        payload={'category':'account_safety','summary':'Escalate the assigned support complaint for a separate evidence review'}
        r=self.post('/sources/support/1/case',payload,'SA');self.assertEqual(r.status_code,201,r.text);cid=r.json()['case_id'];self.assertTrue(self.post('/sources/support/01/case',payload,'SA').json()['existing'])
        with Session(self.engine) as db:
            self.assertIsNone(db.get(ManagementCase,cid).target_user_id);self.assertEqual(db.scalar(select(func.count()).select_from(OperationCaseLink)),1);self.assertEqual(db.scalar(select(func.count()).select_from(ManagementCase)),2)
        self.assertEqual(self.request('/v1/admin/cases/'+str(cid),'SA').json()['case']['target_public_id'],None)
    def test_no_case_or_link_survives_failed_audit(self):
        with patch('backend.app.admin_operations.event',side_effect=RuntimeError('Forced failure before commit')):
            with self.assertRaises(RuntimeError):self.post('/sources/support/1/case',{'category':'other','summary':'This case creation must roll back when the operation event fails'},'SA')
        with Session(self.engine) as db:self.assertEqual(db.scalar(select(func.count()).select_from(ManagementCase)),1);self.assertEqual(db.scalar(select(func.count()).select_from(OperationCaseLink)),0)
    def test_reference_filters_usage_and_private_access(self):
        d=self.request('/v1/admin/operations-desk/referrals?q=fixture&state=active').json();self.assertEqual(d['items'][0]['total_awarded'],'2500')
        uses=self.request('/v1/admin/operations-desk/referrals/1/uses').json();self.assertEqual(uses['items'][0]['public_id'],'1000000004')
        for role in ['SA','UA','FA','USER','INACTIVE']:self.assertEqual(self.request('/v1/admin/operations-desk/referrals',role).status_code,403)
    def test_reference_create_and_cancel_are_idempotent_and_keep_awards(self):
        payload={'kind':'TANIDIK','max_uses':3,'request_key':str(uuid4())};a=self.post('/referrals',payload);self.assertEqual(a.status_code,201,a.text);self.assertEqual(self.post('/referrals',payload).json()['id'],a.json()['id'])
        self.assertEqual(self.post('/referrals',{**payload,'max_uses':4}).status_code,409)
        self.assertEqual(self.post('/referrals',{**payload,'request_key':str(uuid4()),'max_uses':True}).status_code,422)
        note={'note':'Withdraw this fixture referral code after the documented review','request_key':str(uuid4())};self.assertEqual(self.post('/referrals/1/cancel',note).status_code,200);self.assertEqual(self.post('/referrals/1/cancel',note).status_code,200)
        with Session(self.engine) as db:self.assertFalse(db.get(ReferralCode,1).active);self.assertEqual(db.scalar(select(func.sum(ReferralRedemption.amount))),2500);self.assertEqual(db.get(User,'USER').lidya,0)
    def test_feedback_requires_own_original_read_ack(self):
        payload={'status':'planned','assignee_id':'DA2','revision':0,'note':'The suggestion is accepted into planning with a clear accountable owner'}
        self.assertEqual(self.post('/feedback/1/workflow',payload).status_code,409);self.ack();r=self.post('/feedback/1/workflow',payload);self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(self.post('/feedback/1/workflow',{**payload,'revision':1},'DA2').status_code,409)
        self.assertEqual(self.post('/feedback/1/workflow',payload).status_code,409)
        items=self.request('/v1/suggestions/mine','USER').json();self.assertEqual(items[0]['workflow_status'],'planned');self.assertNotIn('note',items[0]);self.assertNotIn('assignee_id',items[0])
    def test_feedback_assignee_and_revision_are_checked(self):
        self.ack();payload={'status':'in_progress','assignee_id':'FA','revision':0,'note':'Track the implementation with a verified accountable staff owner'}
        self.assertEqual(self.post('/feedback/1/workflow',payload).status_code,422)
        self.assertEqual(self.post('/feedback/1/workflow',{**payload,'assignee_id':'DA2'}).status_code,200)
        self.assertEqual(self.request('/v1/admin/operations-desk/feedback?mine=true','DA2').json()['items'][0]['status'],'in_progress')
    def test_draft_is_private_versioned_and_does_not_publish_on_save(self):
        key=str(uuid4());r=self.draft(key=key);self.assertEqual(r.status_code,201,r.text);did=r.json()['id'];self.assertEqual(self.draft(key=key).json()['id'],did)
        self.assertEqual(self.request('/v1/admin/operations-desk/announcement-drafts','DA').json()['items'],[])
        edit={'message':'A revised draft for independent review before publishing','revision':1};r=self.request(f'/v1/admin/operations-desk/announcement-drafts/{did}','FA',method='PUT',json=edit);self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(self.request(f'/v1/admin/operations-desk/announcement-drafts/{did}','FA',method='PUT',json=edit).status_code,409)
        self.assertEqual(self.post(f'/announcement-drafts/{did}/publish',{'revision':2},'DA').status_code,404)
        with Session(self.engine) as db:self.assertEqual(db.scalar(select(func.count()).select_from(SystemAnnouncement)),0)
    def test_publish_retry_and_withdraw_keep_one_receipt(self):
        r=self.draft();did=r.json()['id'];p=f'/announcement-drafts/{did}/publish';r=self.post(p,{'revision':1},'FA');self.assertEqual(r.status_code,200,r.text);aid=r.json()['announcement_id'];self.assertEqual(self.post(p,{'revision':1},'FA').json()['announcement_id'],aid)
        data={'note':'Withdraw this published fixture after a documented content correction','request_key':str(uuid4())};self.assertEqual(self.post(f'/announcements/{aid}/withdraw',data,'FA').status_code,200);self.assertEqual(self.post(f'/announcements/{aid}/withdraw',data,'FA').status_code,200)
        with Session(self.engine) as db:self.assertEqual(db.scalar(select(func.count()).select_from(SystemAnnouncement)),1);self.assertFalse(db.get(SystemAnnouncement,aid).active);self.assertEqual(db.get(AnnouncementDraft,did).status,'published')
        self.assertEqual(self.post(p,{'revision':1},'FA').json()['announcement_id'],aid)
    def test_discard_and_stale_preview_do_not_publish(self):
        did=self.draft().json()['id'];self.assertEqual(self.post(f'/announcement-drafts/{did}/publish',{'revision':2},'FA').status_code,409)
        self.assertEqual(self.post(f'/announcement-drafts/{did}/discard',{'revision':1},'FA').status_code,200);self.assertEqual(self.post(f'/announcement-drafts/{did}/publish',{'revision':1},'FA').status_code,409)
    def test_publish_failure_rolls_back_receipt_and_draft_state(self):
        did=self.draft().json()['id']
        with patch('backend.app.admin_operations.event',side_effect=RuntimeError('Forced publish audit failure')):
            with self.assertRaises(RuntimeError):self.post(f'/announcement-drafts/{did}/publish',{'revision':1},'FA')
        with Session(self.engine) as db:self.assertEqual(db.get(AnnouncementDraft,did).status,'draft');self.assertEqual(db.scalar(select(func.count()).select_from(SystemAnnouncement)),0)
    def test_target_preview_is_minimal_and_blocks_personnel(self):
        r=self.request('/v1/admin/operations-desk/targets/1000000004','UA');self.assertEqual(r.status_code,200,r.text);self.assertEqual(set(r.json()),{'public_id','nickname','is_active','can_submit','reason'});self.assertTrue(r.json()['can_submit'])
        self.assertFalse(self.request('/v1/admin/operations-desk/targets/FA','UA').json()['can_submit']);self.assertEqual(self.request('/v1/admin/operations-desk/targets/USER','FA').status_code,403)
    def test_legitimate_fa_rejection_does_not_restrict_reviewer(self):
        with Session(self.engine) as db:db.add(BanReviewSession(user_id='FA',pending_id=11));db.commit()
        r=self.request('/v1/admin/ban-workflow/requests/11/decision','FA',method='POST',json={'action':'reject','note':'The evidence does not support imposing the requested sanction'});self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['restriction_seconds'],0)
        with Session(self.engine) as db:self.assertEqual(db.get(BanApproval,11).status,'rejected');self.assertIsNotNone(db.scalar(select(OperationHistory).where(OperationHistory.action=='decision_reject')))
    def test_modern_appeal_requires_photo_once_and_independent_reviewer(self):
        payload={'reason':'A second review is warranted','explanation':'The new evidence changes the interpretation','images':[]}
        self.assertEqual(self.request('/v1/admin/ban-workflow/requests/10/appeal','UA',method='POST',json=payload).status_code,422)
        aid=self.appeal();self.assertEqual(self.request('/v1/admin/ban-workflow/requests/10/appeal','UA',method='POST',json={**payload,'images':[photo()]}).status_code,409)
        self.assertFalse(self.request(f'/v1/admin/operations-desk/appeals/{aid}','FA').json()['can_decide'])
        path=f'/v1/admin/ban-workflow/appeals/{aid}/decision';data={'action':'approve','note':'Independent appeal review finds the new source evidence sufficient'}
        self.assertEqual(self.request(path,'FA',method='POST',json=data).status_code,403)
        self.assertEqual(self.request(path,'FA2',method='POST',json=data).status_code,200)
        self.assertEqual(self.request(f'/v1/admin/operations-desk/appeals/{aid}','FA2').json()['first_reviewer_id'],'FA')
        self.assertEqual(self.request(path,'FA2',method='POST',json=data).status_code,409)
        with Session(self.engine) as db:self.assertEqual(db.get(BanAppeal,aid).status,'approved');self.assertEqual(db.get(BanApproval,10).status,'approved');self.assertEqual(db.scalar(select(func.count()).select_from(UserBan)),1)
    def test_appeal_rechecks_target_staff_role_before_apply(self):
        aid=self.appeal()
        with Session(self.engine) as db:db.add(AdminRole(user_id='USER',role='SA'));db.commit()
        self.assertEqual(self.request(f'/v1/admin/ban-workflow/appeals/{aid}/decision','FA2',method='POST',json={'action':'approve','note':'This request must fail after the target became a member of staff'}).status_code,403)
        with Session(self.engine) as db:self.assertEqual(db.scalar(select(func.count()).select_from(UserBan)),0);self.assertEqual(db.get(BanAppeal,aid).status,'pending')
    def test_room_appeal_updates_only_the_bound_room_ban(self):
        with Session(self.engine) as db:
            db.add(Room(id='room',public_id='123456789012',owner_id='USER',name='Fixture room'));db.flush();b=db.get(BanApproval,10);b.kind='room_user';b.target_room_id='room';db.add(RoomBanRequestBinding(approval_id=10));db.commit()
        aid=self.appeal();r=self.request(f'/v1/admin/ban-workflow/appeals/{aid}/decision','FA2',method='POST',json={'action':'approve','note':'Independent review approves only the room-specific scope'});self.assertEqual(r.status_code,200,r.text)
        with Session(self.engine) as db:self.assertEqual(db.scalar(select(func.count()).select_from(RoomUserBan)),1);self.assertEqual(db.scalar(select(func.count()).select_from(UserBan)),0)
    def test_private_reads_are_not_cacheable(self):
        r=self.request('/v1/admin/operations-desk/announcement-drafts','FA');self.assertEqual(r.headers['cache-control'],'no-store');self.assertEqual(r.headers['vary'],'Authorization')

    def test_active_payment_annotations_do_not_expose_another_da_chat(self):
        with Session(self.engine) as db:
            db.add(PaymentRequest(id='fixture-payment',user_id='USER',public_id='1000000004',nickname='Fixture customer',request_key='fixture-pay-key',package_id=1,price_try=10,base=80,bonus=15,total=95,status='chat',assigned_to='DA2',customer_ack=True,agent_ack=True,customer_read=0,agent_read=0,reason=''));db.commit()
        self.assertEqual(self.request('/v1/admin/operations-desk/sources/payment/fixture-payment','DA').status_code,403)
        self.assertEqual(self.request('/v1/admin/operations-desk/sources/payment/fixture-payment','DA2').status_code,200)
        self.assertEqual(self.request('/v1/admin/operations-desk/sources/payment/fixture-payment','FA').status_code,403)
