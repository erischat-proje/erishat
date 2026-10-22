"""Server-side search cannot escape existing moderation scopes or expose proof."""
from datetime import datetime,timezone,timedelta
from unittest.mock import patch
from fastapi import APIRouter,Depends,Header,HTTPException
from sqlalchemy.orm import Session
import test_management_api as shared
from backend.app.models import User
from backend.app.admin_models import BanApproval
from backend.app.ban_workflow_models import BanWorkflow
from backend.app.room_ban_models import RoomBanRequestBinding
from backend.app.chat_ban_models import ChatBanRequestBinding
from backend.app import ban_workflow
from backend.app.db import get_db

class ModerationFilters(shared.ManagementAPI):
    @classmethod
    def setUpClass(cls):
        super().setUpClass();cls.tables.extend([m.__table__ for m in [BanApproval,BanWorkflow,RoomBanRequestBinding,ChatBanRequestBinding]])
        def identity(x_test_user:str=Header(default=''),db:Session=Depends(get_db)):
            user=db.get(User,x_test_user) if x_test_user else None
            if not user or not user.is_active:raise HTTPException(401,'Fixture identity required')
            return user
        with patch.object(ban_workflow,'router',APIRouter(prefix=ban_workflow.router.prefix)):
            cls.app.include_router(ban_workflow.register_auth(identity))
    def setUp(self):
        super().setUp()
        with Session(self.engine) as db:
            for rid,status,requester,assigned,days in [(1,'pending','UA','FA',0),(2,'approved','UA','FA',40),(3,'approved','DA','DA',0)]:
                db.add(BanApproval(id=rid,requester_id=requester,target_user_id='USER',kind='account',days=1,reason='unique reason '+str(rid),status=status,created_at=datetime.now(timezone.utc)-timedelta(days=days)));db.flush()
                db.add(BanWorkflow(approval_id=rid,requester_role=requester,assigned_id=assigned,evidence_json='["private proof"]',log_text='approved log '+str(rid)))
            db.commit()
    def get(self,suffix='',who='DA',logs=False):return self.request('/v1/admin/ban-workflow/'+('logs' if logs else 'requests')+suffix,who)
    def test_search_status_and_time_filter_server_records(self):
        self.assertEqual([r['id'] for r in self.get('?status=approved&days=7').json()['items']],[3])
        self.assertEqual([r['id'] for r in self.get('?q=%230002').json()['items']],[2])
        self.assertEqual([r['id'] for r in self.get('?q=unique%20reason%201').json()['items']],[1])
        self.assertEqual(len(self.get('?q=1000000004').json()['items']),3)
        self.assertEqual(self.get('?q=%25').json()['items'],[])
    def test_scopes_are_preserved_before_search_and_pagination(self):
        self.assertEqual([r['id'] for r in self.get('?q=1000000004','UA').json()['items']],[2,1])
        self.assertEqual([r['id'] for r in self.get('?q=1000000004','FA').json()['items']],[2,1])
        self.assertEqual(self.get('?q=%230003','UA').json()['items'],[])
        self.assertEqual([r['id'] for r in self.get('?before=2&status=pending').json()['items']],[1])
    def test_filtered_log_keeps_inline_evidence_private(self):
        result=self.get('?days=7',logs=True);self.assertEqual(result.status_code,200,result.text);self.assertEqual([r['id'] for r in result.json()['items']],[3]);self.assertEqual(result.json()['items'][0]['evidence'],[])
        for role in ['SA','UA','FA','USER']:self.assertEqual(self.get('?q=1000000004',role,logs=True).status_code,403)
    def test_bad_filters_are_rejected(self):
        self.assertEqual(self.get('?days=0').status_code,422);self.assertEqual(self.get('?days=366').status_code,422);self.assertEqual(self.get('?status=executed').status_code,422)
