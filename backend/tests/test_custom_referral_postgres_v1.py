"""Test real referral HTTP endpoints with concurrent PostgreSQL transactions."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.app import referral_routes as routes
from backend.app.admin_models import AdminRole, AdminAuditLog
from backend.app.db import Base, get_db
from backend.app.models import User
from backend.app.room_models import Room
from backend.app.referral_models import ReferralCode, CustomReferralReward, ReferralRedemption
from backend.app.system_data import LidyaLedger


@pytest.fixture
def pg_api(monkeypatch):
    raw = os.environ.get('SECURITY_TEST_DATABASE_URL', '')
    if not raw:
        if os.environ.get('CUSTOM_REFERRAL_PG_CONFIRM') == 'YES':
            pytest.fail('CI PostgreSQL test URL missing')
        pytest.skip('Isolated PostgreSQL environment not configured')
    url = make_url(raw)
    assert url.drivername.startswith('postgresql')
    assert url.host in ('localhost', '127.0.0.1', '::1')
    assert url.database == 'lidyachat_security_test'
    assert os.environ.get('CUSTOM_REFERRAL_PG_CONFIRM') == 'YES'
    engine = create_engine(raw, pool_size=6, max_overflow=0)
    schema = 'customref_' + uuid.uuid4().hex[:12]
    created = False
    try:
        with engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        created = True
        scoped = engine.execution_options(schema_translate_map={None: schema})
        Base.metadata.create_all(scoped, tables=[m.__table__ for m in (
            User, Room, AdminRole, AdminAuditLog, ReferralCode, CustomReferralReward,
            ReferralRedemption, LidyaLedger)])
        with Session(scoped) as db:
            db.add_all([User(id=uid, public_id=str(9900000000+i), _nickname=uid,
                             lidya=0, is_active=True)
                        for i, uid in enumerate(('da','u1','u2','u3','u4'))])
            db.flush()
            db.add(AdminRole(user_id='da', role='DA'))
            db.commit()
        def test_db():
            with Session(scoped) as db:
                yield db
        def auth(db: Session = Depends(get_db), authorization: str = Header(default='')):
            if not authorization.startswith('Bearer '):
                raise HTTPException(401)
            user = db.get(User, authorization[7:])
            if not user:
                raise HTTPException(401)
            return user
        monkeypatch.setattr(routes, 'router', APIRouter(prefix='/v1'))
        routes.install_routes(auth)
        app = FastAPI()
        app.include_router(routes.router)
        app.dependency_overrides[get_db] = test_db
        yield app, scoped
    finally:
        if created:
            with engine.begin() as conn:
                conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()


def headers(uid):
    return {'Authorization': 'Bearer '+uid}


def race(app, calls):
    barrier = Barrier(len(calls))
    def run(call):
        uid, path, payload = call
        with TestClient(app) as client:
            barrier.wait(timeout=15)
            response = client.post(path, headers=headers(uid), json=payload)
            return response.status_code
    with ThreadPoolExecutor(max_workers=len(calls)) as pool:
        futures = [pool.submit(run, c) for c in calls]
        return sorted(f.result(timeout=40) for f in futures)


def create(app, code, count):
    with TestClient(app) as client:
        res = client.post('/v1/admin/referrals', headers=headers('da'),
                          json=dict(kind='CUSTOM', code=code, reward=7500, max_uses=count))
    assert res.status_code == 200, res.text
    return res.json()['id']


@pytest.mark.parametrize('users,limit,expected', [
    (['u1','u1','u1','u1'], 4, [200,409,409,409]),
    (['u1','u2','u3','u4'], 2, [200,200,409,409]),
])
def test_concurrent_redemption(pg_api, users, limit, expected):
    app, engine = pg_api
    code_id = create(app, 'VUSAL75', limit)
    assert race(app, [(uid, '/v1/referrals/redeem', {'code':'VUSAL75'})
                      for uid in users]) == expected
    wins = expected.count(200)
    with Session(engine) as db:
        code = db.get(ReferralCode, code_id)
        rows = db.scalars(select(ReferralRedemption).where(ReferralRedemption.code_id==code_id)).all()
        assert code.uses == wins == len(rows)
        assert code.active == (wins < limit)
        assert len({r.user_id for r in rows}) == wins
        assert all(r.amount == 7500 for r in rows)
        balances = {u.id:u.lidya for u in db.scalars(select(User))}
        assert sum(balances.values()) == wins*7500
        assert all(balances[r.user_id] == 7500 for r in rows)
        ledger = db.scalars(select(LidyaLedger).where(LidyaLedger.operation=='referral_reward')).all()
        assert len(ledger) == wins and sum(r.delta for r in ledger) == wins*7500


def test_duplicate_code_race(pg_api):
    app, engine = pg_api
    payload = dict(kind='CUSTOM', code='VUSAL75', reward=7500, max_uses=2)
    calls = [('da','/v1/admin/referrals', dict(payload, code=c)) for c in ('VUSAL75','vusal75')]
    assert race(app, calls) == [200,409]
    with Session(engine) as db:
        codes = db.scalars(select(ReferralCode)).all()
        assert len(codes) == 1 and codes[0].code == 'VUSAL75'
        assert db.get(CustomReferralReward, codes[0].id).amount == 7500
        assert len(db.scalars(select(AdminAuditLog).where(AdminAuditLog.action=='referral_create')).all()) == 1
