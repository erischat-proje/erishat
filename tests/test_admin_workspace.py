"""Real workspace routers, role transitions and transaction boundaries in a disposable DB."""
import unittest
from unittest.mock import patch
from datetime import datetime,timezone,timedelta
from uuid import uuid4
from sqlalchemy import select,func
from sqlalchemy.orm import Session
import test_management_api as shared
from backend.app.models import User
from backend.app.room_models import Room,RoomMember
from backend.app.admin_models import AdminRole,AdminAuditLog,FaActionLog
from backend.app.admin_workspace_models import ManagementRoleRequest
from backend.app.support_models import SupportTicket,SupportFlow
from backend.app.platform_models import Notification
from backend.app.config import settings

class Workspace(shared.ManagementAPI):
    def setUp(self):
        super().setUp()
        with Session(self.engine) as db:
            for uid,pid in [('DA2','2000000001'),('DA3','2000000002')]:
                db.add(User(id=uid,public_id=pid,nickname=uid));db.flush();db.add(AdminRole(user_id=uid,role='DA'))
            db.commit()
    def post(self,path,data,who='DA'):return self.request('/v1/admin/workspace'+path,who,method='POST',json=data)
    def proposal(self,role='UA',who='DA',target='USER',key=None):
        target_info=self.request('/v1/admin/workspace/users/'+target,who).json()
        return self.post('/role-requests',{'target_id':target,'role':role,'expected_snapshot':target_info['role_snapshot'],'confirm_public_id':target_info['public_id'],'reason':'Evidence-backed staffing change for the designated duty','request_key':key or str(uuid4())},who)
    def decision(self,rid,action='approve',who='DA2'):
        return self.post(f'/role-requests/{rid}/decision',{'action':action,'note':'Independent management review verified the staffing request'},who)
    def test_catalog_is_role_scoped_and_private_features_are_absent(self):
        for role in ['SA','UA','FA','DA']:
            r=self.request('/v1/admin/workspace',role);self.assertEqual(r.status_code,200,r.text);data=r.json();keys={t['key'] for t in data['tools']}
            self.assertIn('tickets',keys);self.assertIn('lm-cases',keys);self.assertEqual(len(keys),len(data['tools']))
            if role!='DA':
                for key in ['ghost','roles','lookup','deleteaccount','security','payments','lm-audit']:self.assertNotIn(key,keys)
                self.assertNotIn('ghost',str(data).lower())
        self.assertEqual(self.request('/v1/admin/workspace','INACTIVE').status_code,403)
    def test_security_owner_is_required_even_for_catalog(self):
        with patch.object(settings,'security_owner_public_id','1000000003'):
            self.assertIn('security',{t['key'] for t in self.request('/v1/admin/workspace','DA').json()['tools']})
            self.assertNotIn('security',{t['key'] for t in self.request('/v1/admin/workspace','DA2').json()['tools']})
    def test_support_count_is_scoped_and_read_does_not_route_tickets(self):
        with Session(self.engine) as db:
            for tid,uid in [(1,'SA'),(2,'UA')]:
                db.add(SupportTicket(id=tid,user_id='USER',category='other',subject='Fixture support',message='Private fixture'));db.flush();db.add(SupportFlow(ticket_id=tid,phase='pending',offered_to=uid,offer_until=datetime.now(timezone.utc)+timedelta(minutes=5),tier=0,not_assigned_json='[]',snapshot='',context_json='{}',customer_read_id=0,agent_read_id=0))
            db.commit()
        self.assertEqual(self.request('/v1/admin/workspace','SA').json()['counts']['tickets'],1)
        self.assertEqual(self.request('/v1/admin/workspace','DA').json()['counts']['tickets'],0)
        with Session(self.engine) as db:self.assertEqual(db.get(SupportFlow,2).offered_to,'UA')
    def test_directory_filters_cursor_and_no_sensitive_fields(self):
        p='/v1/admin/workspace/users?limit=2';d=self.request(p).json();self.assertEqual(len(d['items']),2);self.assertIsNotNone(d['next_after'])
        nxt=self.request(p+'&after='+d['next_after']).json();self.assertTrue({r['id'] for r in d['items']}.isdisjoint({r['id'] for r in nxt['items']}))
        for r in d['items']:self.assertTrue(set(r)<=set(['id','public_id','nickname','role','is_active','created_at']))
        staff=self.request('/v1/admin/workspace/users?role=STAFF').json()['items'];self.assertTrue(staff);self.assertNotIn('USER',{r['id'] for r in staff})
        found=self.request('/v1/admin/workspace/users?q=1000000004').json()['items'];self.assertEqual([r['id'] for r in found],['USER'])
        self.assertEqual(self.request('/v1/admin/workspace/users?role=UNKNOWN').status_code,422)
        for role in ['SA','UA','FA','USER','INACTIVE']:self.assertEqual(self.request('/v1/admin/workspace/users',role).status_code,403)
    def test_profile_preserves_integer_and_records_access(self):
        with Session(self.engine) as db:db.get(User,'USER').lidya=9007199254740993;db.commit()
        d=self.request('/v1/admin/workspace/users/1000000004').json();self.assertEqual(d['balance'],'9007199254740993');self.assertTrue(d['can_delete']);self.assertTrue(d['can_request_role']);self.assertNotIn('ip',d)
        with Session(self.engine) as db:self.assertIsNotNone(db.scalar(select(AdminAuditLog).where(AdminAuditLog.action=='workspace_user_viewed')))
        own=self.request('/v1/admin/workspace/users/DA').json();self.assertFalse(own['can_delete']);self.assertFalse(own['can_request_role'])
    def test_proposal_is_idempotent_and_does_not_change_role(self):
        key=str(uuid4());first=self.proposal(key=key);self.assertEqual(first.status_code,201,first.text);second=self.proposal(key=key);self.assertEqual(first.json()['id'],second.json()['id'])
        with Session(self.engine) as db:self.assertIsNone(db.get(AdminRole,'USER'));self.assertEqual(db.scalar(select(func.count()).select_from(ManagementRoleRequest)),1)
        self.assertEqual(self.proposal(role='FA',key=key).status_code,409)
    def test_role_change_needs_distinct_actor_and_cannot_target_self(self):
        r=self.proposal(target='DA');self.assertEqual(r.status_code,403)
        rid=self.proposal().json()['id'];self.assertEqual(self.decision(rid,who='DA').status_code,403)
        for role in ['SA','UA','FA','USER','INACTIVE']:self.assertEqual(self.decision(rid,who=role).status_code,403)
        self.assertEqual(self.decision(rid).status_code,200)
        with Session(self.engine) as db:self.assertEqual(db.get(AdminRole,'USER').role,'UA')
    def test_target_cannot_approve_own_promotion(self):
        rid=self.proposal(role='FA',target='DA3').json()['id'];self.assertEqual(self.decision(rid,who='DA3').status_code,403)
    def test_execution_receipt_repeat_never_reapplies_role(self):
        rid=self.proposal().json()['id'];self.assertEqual(self.decision(rid).status_code,200)
        with Session(self.engine) as db:db.get(AdminRole,'USER').role='FA';db.commit()
        self.assertEqual(self.decision(rid).status_code,200)
        with Session(self.engine) as db:
            self.assertEqual(db.get(AdminRole,'USER').role,'FA');self.assertEqual(db.scalar(select(func.count()).select_from(AdminAuditLog).where(AdminAuditLog.action=='role_change_executed')),1)
    def test_stale_snapshot_and_revoked_requester_fail_closed(self):
        rid=self.proposal().json()['id']
        with Session(self.engine) as db:db.add(AdminRole(user_id='USER',role='SA'));db.commit()
        self.assertEqual(self.decision(rid).status_code,409)
        with Session(self.engine) as db:db.delete(db.get(AdminRole,'USER'));db.commit()
        rid=self.proposal().json()['id']
        with Session(self.engine) as db:db.get(AdminRole,'DA').role='FA';db.commit()
        self.assertEqual(self.decision(rid).status_code,409)
    def test_reject_and_cancel_do_not_mutate_roles(self):
        rid=self.proposal().json()['id'];self.assertEqual(self.decision(rid,'reject').status_code,200);self.assertEqual(self.decision(rid).status_code,409)
        rid=self.proposal().json()['id'];self.assertEqual(self.decision(rid,'cancel','DA2').status_code,403);self.assertEqual(self.decision(rid,'cancel','DA').status_code,200)
        with Session(self.engine) as db:self.assertIsNone(db.get(AdminRole,'USER'))
    def test_role_revocation_uses_same_independent_workflow(self):
        rid=self.proposal(role=None,target='UA').json()['id'];r=self.decision(rid);self.assertEqual(r.status_code,200,r.text)
        with Session(self.engine) as db:self.assertIsNone(db.get(AdminRole,'UA'))
    def test_legacy_role_write_cannot_bypass_approval(self):
        self.assertEqual(self.request('/v1/admin/roles',method='PUT',json={'user_id':'USER','role':'DA'}).status_code,409)
        self.assertEqual(self.request('/v1/admin/roles/UA',method='DELETE').status_code,409)
        with Session(self.engine) as db:self.assertIsNone(db.get(AdminRole,'USER'));self.assertIsNotNone(db.get(AdminRole,'UA'))
    def test_failure_rolls_back_role_request_and_audit(self):
        rid=self.proposal().json()['id']
        with patch('backend.app.admin_workspace.audit',side_effect=RuntimeError('Forced commit boundary failure')):
            with self.assertRaises(RuntimeError):self.decision(rid)
        with Session(self.engine) as db:self.assertIsNone(db.get(AdminRole,'USER'));self.assertEqual(db.get(ManagementRoleRequest,rid).status,'pending')
    def test_whitespace_reason_confirmation_and_implicit_revoke_are_rejected(self):
        target=self.request('/v1/admin/workspace/users/USER').json();body={'target_id':'USER','role':'UA','expected_snapshot':target['role_snapshot'],'confirm_public_id':'WRONG','reason':'A proper explanation for independent staffing review','request_key':str(uuid4())}
        self.assertEqual(self.post('/role-requests',body).status_code,422)
        self.assertEqual(self.post('/role-requests',{**body,'confirm_public_id':target['public_id'],'reason':' '*30}).status_code,422)
        body.pop('role');self.assertEqual(self.post('/role-requests',{**body,'confirm_public_id':target['public_id']}).status_code,422)

    def test_legacy_fa_history_remains_queryable_without_raw_credentials(self):
        with Session(self.engine) as db:
            db.add(FaActionLog(admin_id='FA',action='legacy_review',target_user_id='USER',details='{"note":"historic independent review","token":"private"}'));db.commit()
        r=self.request('/v1/admin/management/audit?source=fa_legacy&role=FA');self.assertEqual(r.status_code,200,r.text);items=r.json()['items'];self.assertEqual(len(items),1);self.assertEqual(items[0]['role'],'FA');self.assertEqual(items[0]['source'],'fa_legacy');self.assertNotIn('token',items[0]['details'])
        self.assertEqual(self.request('/v1/admin/management/audit?source=fa_legacy&role=SA').status_code,422)
        self.assertEqual(self.request('/v1/admin/management/audit?source=fa_legacy','FA').status_code,403)

    def test_demotion_clears_ghost_and_removes_access_to_locked_room(self):
        with Session(self.engine) as db:
            db.get(AdminRole,'DA3').ghost_mode=True
            db.add(Room(id='private',public_id='123456789012',owner_id='USER',name='Private fixture',locked=True));db.flush()
            db.add(RoomMember(room_id='private',user_id='DA3',ghost=True));db.commit()
        rid=self.proposal(role='FA',target='DA3').json()['id'];result=self.decision(rid);self.assertEqual(result.status_code,200,result.text)
        with Session(self.engine) as db:
            self.assertEqual(db.get(AdminRole,'DA3').role,'FA');self.assertFalse(db.get(AdminRole,'DA3').ghost_mode)
            self.assertIsNone(db.scalar(select(RoomMember).where(RoomMember.user_id=='DA3')))

if __name__=='__main__':unittest.main()
