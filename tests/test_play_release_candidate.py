"""Google Play release: history scoped to owner; DA finances readonly."""
import hashlib
from sqlalchemy import BigInteger,create_engine,select
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from app.db import Base
from app.models import User
from app.admin_models import AdminRole
from app.play_billing_models import PlayPurchaseRecord
from app.play_refund_models import PlayRefundCase
from app.system_data import LidyaLedger
from app.play_billing import _refund_financial_review
from fastapi import HTTPException
import pytest

@compiles(BigInteger,'sqlite')
def sqlite_bigint(type_,compiler,**kw): return 'INTEGER'

def test_read_only_financial_report():
    e=create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(e,tables=[User.__table__,AdminRole.__table__,PlayPurchaseRecord.__table__,PlayRefundCase.__table__,LidyaLedger.__table__])
    with Session(e,expire_on_commit=False) as db:
        db.add(User(id='u1',public_id='1234567890',nickname='Test',lidya=27))
        db.add(PlayPurchaseRecord(token_sha256=hashlib.sha256(b'sensitive').hexdigest(),user_id='u1',product_id='lidya_001',google_order_id='GPA.TEST',purchase_status='credited',test_purchase=True))
        db.commit()
        receipt=db.scalars(select(PlayPurchaseRecord)).one()
        db.add(PlayRefundCase(receipt_id=receipt.id,user_id='u1',product_id='lidya_001',status='pending'))
        db.add(LidyaLedger(user_id='u1',delta=95,balance_after=95,operation='google_play_credit',reference_id=f'play:{receipt.id}'))
        db.add(LidyaLedger(user_id='u1',delta=-68,balance_after=27,operation='gift'))
        db.commit()
        case=db.scalars(select(PlayRefundCase)).one()
        r=_refund_financial_review(db,case)
        assert r['package_lidya']==95 and r['current_balance']==27
        assert r['purchase_credit_visible_in_recent_ledger']
        assert r['wallet_changed'] is False
        assert len(r['ledger']) == 3
        assert {x['operation'] for x in r['ledger']} == {
            'initial_balance', 'google_play_credit', 'gift'
        }
        assert 'token_sha256' not in r and 'google_order_id' not in r
        assert db.get(User,'u1').lidya==27
        assert db.get(PlayRefundCase,case.id).status=='pending'
        receipt.product_id='lidya_002'
        db.flush()
        with pytest.raises(HTTPException) as caught:_refund_financial_review(db,case)
        assert caught.value.status_code==409
        db.rollback()
    e.dispose()
