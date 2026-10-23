"""Persisted finance projections: complete aggregates, precision, scope and no mutations."""
from datetime import datetime,timedelta,timezone
from sqlalchemy import select,func,update
from sqlalchemy.orm import Session
from tests.test_management_api import ManagementAPI
from backend.app.models import User
from backend.app.purchase_models import LidyaOperation,LidyaOrder
from backend.app.system_data import LidyaLedger
from backend.app.payment_assistance_models import PaymentRequest
from backend.app.vip_membership_models import VipMembership,VipPurchaseReceipt
from backend.app.platform_models import VipStatus

class ManagementLive(ManagementAPI):
    def snapshot(self,query='',role='DA'):return self.request('/v1/admin/finance-audit/live-snapshot'+query,role)
    def operation(self,db,oid,amount=10,operation='EKLEME',created_at=None):
        row=LidyaOperation(id=oid,request_key=oid,admin_id='DA',admin_role='DA',admin_name='DA',user_id='USER',public_id='1000000004',amount=amount,before=0,after=amount if operation=='EKLEME' else -amount,operation=operation,evidence='proof')
        if created_at:row.created_at=created_at
        db.add(row)
    def test_all_1005_operations_contribute_without_sample_cap(self):
        with Session(self.engine) as db:
            for i in range(1005):self.operation(db,'full-'+str(i),10)
            db.commit()
        r=self.snapshot();self.assertEqual(r.status_code,200,r.text);data=r.json();self.assertEqual(data['manual']['count'],1005);self.assertEqual(data['manual']['added'],'10050');self.assertFalse(data['sampled'])
        overview=self.request('/v1/admin/finance-audit/overview').json();self.assertEqual(overview['lidya_added'],'10050');self.assertFalse(overview['truncated']);self.assertNotIn('lidya_added_sample',overview)
    def test_exact_large_integer_wallet_and_ledger_values(self):
        exact=9007199254740993
        with Session(self.engine) as db:db.get(User,'USER').lidya=exact;db.commit()
        d=self.snapshot('?target=1000000004').json();self.assertEqual(d['wallets']['total_lidya'],str(exact));self.assertEqual(d['ledger']['credits'],str(exact));self.assertEqual(d['coverage']['latest_balance_mismatch'],0);self.assertTrue(any(r['balance_after']==str(exact) for r in d['recent_ledger']))
    def test_target_filter_applies_to_all_projections(self):
        with Session(self.engine) as db:self.operation(db,'targeted',50);db.get(User,'USER').lidya=40;db.get(User,'SA').lidya=70;db.commit()
        d=self.snapshot('?target=1000000004').json();self.assertEqual(d['wallets']['accounts'],1);self.assertEqual(d['wallets']['total_lidya'],'40');self.assertEqual(d['manual']['count'],1);self.assertTrue(all(r['public_id']=='1000000004' for r in d['recent_ledger']))
        none=self.snapshot('?target=does-not-exist').json();self.assertEqual(none['wallets']['accounts'],0);self.assertEqual(none['manual']['count'],0);self.assertEqual(none['recent_ledger'],[])
    def test_istanbul_calendar_boundary_and_future_records_excluded(self):
        d=self.snapshot('?days=1').json();start=datetime.fromisoformat(d['period_start']);end=datetime.now(timezone.utc)
        with Session(self.engine) as db:
            self.operation(db,'before',10,created_at=start-timedelta(seconds=1));self.operation(db,'inside',20,created_at=start+timedelta(seconds=1));self.operation(db,'future',40,created_at=end+timedelta(days=1));db.commit()
        d=self.snapshot('?days=1').json();self.assertEqual(d['manual']['added'],'20');self.assertEqual(d['timezone'],'Europe/Istanbul');self.assertEqual(start.hour,21)
    def test_current_balance_mismatch_and_missing_ledger_are_not_hidden(self):
        with Session(self.engine) as db:
            db.execute(update(User).where(User.id=='USER').values(lidya=55));db.query(LidyaLedger).filter(LidyaLedger.user_id=='SA').delete();db.commit()
        d=self.snapshot().json();self.assertEqual(d['coverage']['latest_balance_mismatch'],1);self.assertEqual(d['coverage']['accounts_without_ledger'],1);self.assertEqual({r['kind'] for r in d['coverage']['exceptions']},{'missing_ledger','balance_mismatch'})
    def test_recent_table_bounded_but_totals_not_bounded(self):
        with Session(self.engine) as db:
            for i in range(40):db.add(LidyaLedger(user_id='USER',delta=1,balance_after=i,operation='fixture'))
            db.commit()
        d=self.snapshot('?target=1000000004').json();self.assertEqual(len(d['recent_ledger']),30);self.assertEqual(d['ledger']['credits'],'40');self.assertEqual(d['ledger']['entry_count'],41)
    def test_order_statuses_are_separate_and_no_bank_reconciliation_claim(self):
        with Session(self.engine) as db:
            for i,status in enumerate(['approved','pending','rejected']):db.add(LidyaOrder(id='order'+str(i),request_key='order'+str(i),user_id='USER',package_id=1,price_try=100,base=1000,bonus=0,total=1000,method='iban',reference='ref'+str(i),status=status))
            db.commit()
        d=self.snapshot().json();self.assertEqual({r['status']:r['count'] for r in d['orders']},{'approved':1,'pending':1,'rejected':1});self.assertIn('banka tahsilat mutabakatı değildir',d['note'])
    def test_role_no_store_validation_and_read_only(self):
        for role in ['SA','UA','FA','USER','INACTIVE']:self.assertEqual(self.snapshot(role=role).status_code,403)
        for q in ['?days=0','?days=91','?days=abc']:self.assertEqual(self.snapshot(q).status_code,422)
        with Session(self.engine) as db:before=db.scalar(select(func.count()).select_from(LidyaLedger));balance=db.get(User,'USER').lidya
        r=self.snapshot();self.assertEqual(r.headers['vary'],'Authorization');self.assertIn('no-store',r.headers['cache-control']);self.assertEqual(r.json()['source'],'persisted_database')
        with Session(self.engine) as db:self.assertEqual(before,db.scalar(select(func.count()).select_from(LidyaLedger)));self.assertEqual(balance,db.get(User,'USER').lidya)

    def test_vip_cycles_and_assisted_paid_sources_are_actual_and_separate(self):
        at=datetime.now(timezone.utc)
        with Session(self.engine) as db:
            db.add_all([VipStatus(user_id='USER',level=2),VipStatus(user_id='SA',level=1)])
            db.add_all([VipMembership(user_id='USER',earned_level=2,cycle_started_at=at,cycle_ends_at=at+timedelta(days=1),migrated_at=at),VipMembership(user_id='SA',earned_level=1,cycle_started_at=at-timedelta(days=31),cycle_ends_at=at-timedelta(days=1),migrated_at=at)])
            db.add(VipPurchaseReceipt(user_id='USER',key='assisted:paid',amount=1000,purchased_at=at));self.operation(db,'credit',1000);db.flush()
            db.add(PaymentRequest(id='paid',user_id='USER',public_id='1000000004',nickname='USER',request_key='paid',package_id=1,price_try=100,base=900,bonus=100,total=1000,status='finishing',credit_operation_id='credit',transaction_reference='bank-ref'));db.commit()
        data=self.snapshot().json();self.assertEqual(data['vip_accounts'],2);self.assertEqual(data['vip_active_cycles'],1);self.assertEqual(data['vip_cycles_due'],1);self.assertEqual(data['vip_purchase_receipts'],{'count':1,'lidya':'1000'});self.assertEqual(data['assisted_credited'],{'count':1,'lidya':'1000','recorded_try':'100'});self.assertEqual(data['orders'],[]);self.assertEqual(data['manual']['added'],'1000')
        scoped=self.snapshot('?target=1000000000').json();self.assertEqual(scoped['assisted_credited']['count'],0)
