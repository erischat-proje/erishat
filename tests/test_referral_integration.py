"""Isolated SQLite tests executing the actual referral route functions; never touches production."""
import ast
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, BigInteger, String, create_engine, select, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session

ROOT = Path(__file__).resolve().parents[1]
class Base(DeclarativeBase): pass
class User(Base):
    __tablename__='users'
    id:Mapped[str]=mapped_column(String,primary_key=True)
    lidya:Mapped[int]=mapped_column(BigInteger,default=0)
    nickname:Mapped[str]=mapped_column(String,default='Test')
class AdminRole(Base):
    __tablename__='admin_roles'
    user_id:Mapped[str]=mapped_column(String,primary_key=True)
    role:Mapped[str]=mapped_column(String)
class AdminAuditLog(Base):
    __tablename__='admin_audit_logs'
    id:Mapped[int]=mapped_column(Integer,primary_key=True)
    admin_id:Mapped[str]=mapped_column(String)
    action:Mapped[str]=mapped_column(String)
    target_id:Mapped[str]=mapped_column(String)
    details:Mapped[str]=mapped_column(String)
class Family(Base):
    __tablename__='families'
    id:Mapped[str]=mapped_column(String,primary_key=True)
    owner_id:Mapped[str]=mapped_column(String)
class FamilyMember(Base):
    __tablename__='family_members'
    id:Mapped[int]=mapped_column(Integer,primary_key=True)
    family_id:Mapped[str]=mapped_column(String)
    user_id:Mapped[str]=mapped_column(String)
class Notification(Base):
    __tablename__='notifications'
    id:Mapped[int]=mapped_column(Integer,primary_key=True)
    user_id:Mapped[str]=mapped_column(String)
    kind:Mapped[str]=mapped_column(String)
    title:Mapped[str]=mapped_column(String)
    body:Mapped[str]=mapped_column(String)

# Execute the actual ORM classes, using an isolated Base and only their own declarations.
model_tree=ast.parse((ROOT/'backend/app/referral_models.py').read_text())
model_nodes=[n for n in model_tree.body if isinstance(n,ast.ClassDef)]
model_env=dict(Base=Base,Mapped=Mapped,mapped_column=mapped_column,BigInteger=BigInteger,Boolean=Boolean,DateTime=DateTime,ForeignKey=ForeignKey,Integer=Integer,String=String,UniqueConstraint=__import__('sqlalchemy').UniqueConstraint,func=func,datetime=datetime)
exec(compile(ast.Module(body=model_nodes,type_ignores=[]),'referral_models.py','exec'),model_env)
ReferralCode=model_env['ReferralCode']; ReferralRedemption=model_env['ReferralRedemption']; FamilyReferralClaim=model_env['FamilyReferralClaim']; FamilyReferralReceipt=model_env['FamilyReferralReceipt']

class Router:
    def __init__(self):self.endpoints={}
    def post(self,path):return self.record('POST',path)
    def get(self,path):return self.record('GET',path)
    def delete(self,path):return self.record('DELETE',path)
    def record(self,method,path):
        def deco(fn):self.endpoints[(method,path)]=fn;return fn
        return deco
router=Router()
route_tree=ast.parse((ROOT/'backend/app/referral_routes.py').read_text())
route_nodes=[n for n in route_tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in ('NewCode','Redeem','utc','require_da','install_routes')]
route_env=dict(router=router,Depends=lambda x:None,get_db=lambda:None,BaseModel=BaseModel,Field=Field,datetime=datetime,timedelta=timedelta,timezone=timezone,token_hex=lambda n:'ABC123DEF456',HTTPException=HTTPException,select=select,Session=Session,User=User,AdminRole=AdminRole,AdminAuditLog=AdminAuditLog,Family=Family,FamilyMember=FamilyMember,Notification=Notification,ReferralCode=ReferralCode,ReferralRedemption=ReferralRedemption,FamilyReferralClaim=FamilyReferralClaim,FamilyReferralReceipt=FamilyReferralReceipt)
exec(compile(ast.Module(body=route_nodes,type_ignores=[]),'referral_routes.py','exec'),route_env)
route_env['install_routes'](lambda:None)

@pytest.fixture
def db():
    engine=create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    with Session(engine,expire_on_commit=False) as session:
        for id in ('da','a','b','c'):
            session.add(User(id=id,lidya=0,nickname=id))
        session.add(AdminRole(user_id='da',role='DA'))
        session.add(Family(id='f1',owner_id='a'))
        for n,id in enumerate(('a','b'),1):session.add(FamilyMember(id=n,family_id='f1',user_id=id))
        session.commit()
        yield session
    engine.dispose()

def endpoint(method,path):return router.endpoints[(method,path)]
def status(err,code):return isinstance(err.value,HTTPException) and err.value.status_code==code

def test_code_once_per_user_and_exact_credit(db):
    make=endpoint('POST','/admin/referrals'); redeem=endpoint('POST','/referrals/redeem')
    code=make(route_env['NewCode'](kind='USER',max_uses=2),db,db.get(User,'da'))['code']
    assert len(code)==14 and code.isalnum()
    assert redeem(route_env['Redeem'](code=code),db,db.get(User,'a'))['amount']==2500
    assert db.get(User,'a').lidya==2500
    with pytest.raises(HTTPException) as e:redeem(route_env['Redeem'](code=code),db,db.get(User,'a'))
    assert status(e,409) and db.get(User,'a').lidya==2500
    assert redeem(route_env['Redeem'](code=code),db,db.get(User,'b'))['amount']==2500
    assert db.get(User,'b').lidya==2500
    assert db.scalar(select(ReferralCode).where(ReferralCode.code==code)).active is False
    with pytest.raises(HTTPException) as e:redeem(route_env['Redeem'](code=code),db,db.get(User,'c'))
    assert status(e,409) and db.get(User,'c').lidya==0

def test_tanidik_and_da_only(db):
    make=endpoint('POST','/admin/referrals')
    with pytest.raises(HTTPException) as e:make(route_env['NewCode'](kind='TANIDIK',max_uses=1),db,db.get(User,'a'))
    assert status(e,403)
    code=make(route_env['NewCode'](kind='TANIDIK',max_uses=1),db,db.get(User,'da'))['code']
    endpoint('POST','/referrals/redeem')(route_env['Redeem'](code=code),db,db.get(User,'a'))
    assert db.get(User,'a').lidya==12500

def test_family_owner_cooldown_and_member_snapshot(db):
    claim=endpoint('POST','/families/{family_id}/referral-reward')
    with pytest.raises(HTTPException) as e:claim('f1',db,db.get(User,'b'))
    assert status(e,403)
    result=claim('f1',db,db.get(User,'a'))
    assert result['member_count']==2
    assert [db.get(User,x).lidya for x in ('a','b','c')]==[1000,1000,0]
    assert len(db.scalars(select(FamilyReferralReceipt)).all())==2
    assert len(db.scalars(select(Notification)).all())==2
    db.add(FamilyMember(id=3,family_id='f1',user_id='c'));db.commit()
    with pytest.raises(HTTPException) as e:claim('f1',db,db.get(User,'a'))
    assert status(e,409)
    assert [db.get(User,x).lidya for x in ('a','b','c')]==[1000,1000,0]
    previous=db.scalar(select(FamilyReferralClaim));previous.created_at=datetime.now(timezone.utc)-timedelta(days=31);db.commit()
    claim('f1',db,db.get(User,'a'))
    assert [db.get(User,x).lidya for x in ('a','b','c')]==[2000,2000,1000]
