"""Google Play refund V2: records and decisions without wallet effects."""
import hashlib
from types import SimpleNamespace
from sqlalchemy import BigInteger,create_engine,select
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from app.db import Base
from app.models import User
from app.admin_models import AdminRole, AdminAuditLog
from app.play_billing_models import PlayPurchaseRecord
from app.play_refund_models import PlayRefundCase
from app.play_billing import _voided_audit_rows, _refund_cases_sync

@compiles(BigInteger,'sqlite')
def sqlite_bigint(type_,compiler,**kw):return 'INTEGER'

def test_sync_idempotent_and_review_state_preserved():
    engine=create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine,tables=[User.__table__,AdminRole.__table__,PlayPurchaseRecord.__table__,PlayRefundCase.__table__,AdminAuditLog.__table__])
    with Session(engine,expire_on_commit=False) as db:
        db.add(User(id='u1',public_id='1234567890',nickname='Test',lidya=200))
        db.add(PlayPurchaseRecord(token_sha256=hashlib.sha256(b'token').hexdigest(),user_id='u1',product_id='lidya_001',google_order_id='GPA.TEST',purchase_status='credited',test_purchase=True))
        db.commit()
        receipt=db.scalars(select(PlayPurchaseRecord)).first()
        rows=_voided_audit_rows([{'purchaseToken':'token','orderId':'GPA.TEST','voidedTimeMillis':'123'}],{receipt.token_sha256:receipt})
        assert _refund_cases_sync(db,rows)==1
        assert _refund_cases_sync(db,rows)==0
        case=db.scalars(select(PlayRefundCase)).one()
        case.status='reviewed';case.review_note='Checked by DA';db.commit()
        assert _refund_cases_sync(db,rows)==0
        assert db.scalars(select(PlayRefundCase)).one().status=='reviewed'
        assert db.scalar(select(User.lidya).where(User.id=='u1'))==200
        assert len(db.scalars(select(PlayRefundCase)).all())==1
    engine.dispose()

def test_mismatch_does_not_open_case():
    receipt=SimpleNamespace(id=1,user_id='u1',product_id='lidya_001',google_order_id='GPA.REAL',purchase_status='credited',test_purchase=True)
    assert _voided_audit_rows([{'purchaseToken':'token','orderId':'GPA.FAKE'}],{hashlib.sha256(b'token').hexdigest():receipt})==[]
