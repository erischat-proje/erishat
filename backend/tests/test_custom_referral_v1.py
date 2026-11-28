from fastapi import HTTPException
import pytest
from backend.app.referral_routes import NewCode, CodeState, reward_amount
from types import SimpleNamespace
from pydantic import ValidationError


def test_custom_request():
    p=NewCode(kind='CUSTOM', code='VUSAL75', reward=7500, max_uses=75, active=False)
    assert p.reward==7500 and p.active is False


@pytest.mark.parametrize('value',[0,-1,1000001,1.5,True,'7500'])
def test_invalid_reward(value):
    with pytest.raises(ValidationError):
        NewCode(kind='CUSTOM',code='VUSAL75',reward=value,max_uses=75)


def test_legacy_and_custom_rewards():
    class DB:
        def get(self, model, id):
            return SimpleNamespace(amount=7500) if id==1 else None
    db=DB()
    for kind,expected in [('USER',2500),('TANIDIK',12500),('CUSTOM',7500)]:
        assert reward_amount(db,SimpleNamespace(kind=kind,id=1))==expected
    with pytest.raises(HTTPException):
        reward_amount(db,SimpleNamespace(kind='CUSTOM',id=2))
    with pytest.raises(HTTPException):
        reward_amount(db,SimpleNamespace(kind='UNKNOWN',id=1))


def test_strict_activation():
    with pytest.raises(ValidationError):
        CodeState(active='false')


from fastapi import FastAPI, APIRouter, Depends, Header
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from backend.app import referral_routes as routes
from backend.app.db import Base, get_db
from backend.app.models import User
from backend.app.admin_models import AdminRole, AdminAuditLog
from backend.app.referral_models import ReferralCode, CustomReferralReward, ReferralRedemption
from backend.tests.test_nobility_online_api_v13 import setup


@pytest.fixture
def api(setup, monkeypatch):
    _, engine=setup
    Base.metadata.create_all(engine, tables=[m.__table__ for m in
        (AdminAuditLog, ReferralCode, CustomReferralReward, ReferralRedemption)])
    with Session(engine) as db:
        db.add(AdminRole(user_id='owner', role='DA'))
        db.commit()
    def dependency():
        with Session(engine) as db:
            yield db
    def auth(db: Session=Depends(get_db), authorization: str=Header(default='')):
        if not authorization.startswith('Bearer '): raise HTTPException(401)
        user=db.get(User,authorization[7:])
        if not user: raise HTTPException(401)
        return user
    monkeypatch.setattr(routes,'router',APIRouter(prefix='/v1'))
    routes.install_routes(auth)
    app=FastAPI(); app.include_router(routes.router)
    app.dependency_overrides[get_db]=dependency
    with TestClient(app) as client:
        yield client,engine


def test_custom_lifecycle(api):
    client,engine=api
    da={'Authorization':'Bearer owner'}
    normal={'Authorization':'Bearer normal'}
    other={'Authorization':'Bearer outsider'}
    path='/v1/admin/referrals'
    payload=dict(kind='CUSTOM',code='vusal75',reward=7500,max_uses=2,active=False)
    assert client.post(path,json=payload,headers=normal).status_code==403
    assert client.post(path,json=payload).status_code==401
    response=client.post(path,json=payload,headers=da)
    assert response.status_code==200,response.text
    row=response.json(); assert row['code']=='VUSAL75' and not row['active']
    assert client.post(path,json={**payload,'code':'VUSAL75'},headers=da).status_code==409
    redeem='/v1/referrals/redeem'; state=path+'/'+str(row['id'])+'/state'
    assert client.post(redeem,json={'code':'VUSAL75'},headers=normal).status_code==409
    assert client.patch(state,json={'active':True},headers=normal).status_code==403
    assert client.patch(state,json={'active':True},headers=da).status_code==200
    with Session(engine) as db: before=db.get(User,'normal').lidya
    result=client.post(redeem,json={'code':'vusal75'},headers=normal)
    assert result.status_code==200,result.text
    assert result.json()['amount']==7500 and result.json()['balance']==before+7500
    assert client.post(redeem,json={'code':'VUSAL75'},headers=normal).status_code==409
    assert client.patch(state,json={'active':False},headers=da).status_code==200
    assert client.post(redeem,json={'code':'VUSAL75'},headers=other).status_code==409
    assert client.patch(state,json={'active':True},headers=da).status_code==200
    assert client.post(redeem,json={'code':'VUSAL75'},headers=other).status_code==200
    assert client.patch(state,json={'active':True},headers=da).status_code==409
    rows=client.get(path,headers=da).json()
    saved=next(r for r in rows if r['id']==row['id'])
    assert saved['uses']==2 and saved['remaining']==0 and not saved['active']
    with Session(engine) as db:
        assert db.get(User,'normal').lidya==before+7500
        assert db.query(ReferralRedemption).filter_by(code_id=row['id']).count()==2


def test_budget_and_legacy(api):
    client,_=api; da={'Authorization':'Bearer owner'}; path='/v1/admin/referrals'
    for code,reward,uses in [('   ',100,1),('TOOBIG',1000000,101)]:
        assert client.post(path,headers=da,json=dict(kind='CUSTOM',code=code,reward=reward,max_uses=uses)).status_code==422
    for kind,reward in [('USER',2500),('TANIDIK',12500)]:
        res=client.post(path,headers=da,json=dict(kind=kind,max_uses=1))
        assert res.status_code==200,res.text
        assert res.json()['reward']==reward
        assert client.post('/v1/referrals/redeem',headers={'Authorization':'Bearer normal'},json={'code':res.json()['code']}).json()['amount']==reward


@pytest.mark.parametrize('code', ['A', '58', 'SELÇUK58', 'ÇağrıŞahin', 'LİDYA-2026!', '★KRAL★', 'Lidya Chat 58', '👑VIP🔥', '👩‍👩‍👧‍👦', '<TEST>&%_', '中'*256, '👑'*256])
def test_freeform_referral_roundtrip(api, code):
    from backend.app.referral_routes import normalize_referral_code
    client,engine=api
    da={'Authorization':'Bearer owner'}
    normal={'Authorization':'Bearer normal'}
    path='/v1/admin/referrals'
    data=dict(kind='CUSTOM',code=code,reward=15000,max_uses=1)
    r=client.post(path,json=data,headers=da)
    assert r.status_code==200,r.text
    assert r.json()['code']==normalize_referral_code(code)
    assert client.post(path,json=data,headers=da).status_code==409
    result=client.post('/v1/referrals/redeem',json={'code':code},headers=normal)
    assert result.status_code==200,result.text
    assert result.json()['amount']==15000
    assert client.post('/v1/referrals/redeem',json={'code':code},headers=normal).status_code==409

@pytest.mark.parametrize('code', ['', '   ', 'A'*257, 'A\x00B', 'A\nB', 'A\u202eB', '\u200d'])
def test_freeform_invalid_codes(api, code):
    client,_=api
    r=client.post('/v1/admin/referrals',headers={'Authorization':'Bearer owner'},json=dict(kind='CUSTOM',code=code,reward=1,max_uses=1))
    assert r.status_code==422,r.text
