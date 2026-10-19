import sys,types,importlib.util
from pathlib import Path
from sqlalchemy.orm import DeclarativeBase,Session
from sqlalchemy import create_engine,select,text
ROOT=Path(__file__).resolve().parents[1]/'backend'/'app';pkg=types.ModuleType('staff_app');pkg.__path__=[str(ROOT)];sys.modules['staff_app']=pkg
class Base(DeclarativeBase):pass
dbmod=types.ModuleType('staff_app.db');dbmod.Base=Base;sys.modules['staff_app.db']=dbmod
from staff_app.models import User
from staff_app.admin_models import AdminRole
from staff_app import staff_identity as identity
engine=create_engine('sqlite://')
Base.metadata.create_all(engine,tables=[User.__table__,AdminRole.__table__])
with Session(engine) as db:
 u=User(id='a',public_id='1000000001',nickname='Original',avatar='🦊',gender='male',avatar_asset='old.png',frame_asset='frame.png');db.add(u);db.commit()
 assert u.nickname=='Original'
 db.add(AdminRole(user_id='a',role='SA'));db.commit()
 assert u.nickname==identity.NAME and u.avatar_asset==identity.AVATAR and u.frame_asset==identity.FRAME
 row=db.execute(select(User.id,User.nickname,User.avatar_asset,User.frame_asset)).one()
 assert row.nickname==identity.NAME and row.avatar_asset==identity.AVATAR
 for key in ['nickname','avatar','avatar_asset','frame_asset']:
  try:setattr(u,key,'bad');raise AssertionError(key)
  except Exception as e:assert getattr(e,'status_code',None)==403,(key,e)
 assert db.execute(text('select nickname,avatar_asset,frame_asset from users')).one()==('Original','old.png','frame.png')
 db.expunge(u);assert u.nickname==identity.NAME
 db.delete(db.get(AdminRole,'a'));db.commit()
 u=db.get(User,'a');assert u.nickname=='Original' and u.frame_asset=='frame.png'
 print('PASS staff ORM, SQL row projection, immutable identity, preserved raw data, detached and revocation')

from sqlalchemy.orm import aliased
with Session(engine) as db:
 for i,role in enumerate(identity.ROLES):
  uid='staff-'+role
  person=User(id=uid,public_id=str(2000000000+i),nickname='Before-'+role,avatar='🐶',avatar_asset='original-avatar',frame_asset='original-frame')
  db.add(person);db.flush()
  assert person.nickname=='Before-'+role
  db.add(AdminRole(user_id=uid,role=role));db.flush()
  assert person.management_locked and person.nickname==identity.NAME
  assert person.management_badges==[role]
  assert identity.public_identity(person)['admin_role']==role
  assert len(identity.inventory())==2 and all(x['locked'] and x['equipped'] for x in identity.inventory())
  db.get(AdminRole,uid).role='DA';db.flush()
  assert person.nickname==identity.NAME and person.management_badges==['DA']
 db.commit()
 U=aliased(User)
 rows=db.execute(select(U.id,U.nickname).where(U.id.like('staff-%'))).all()
 assert len(rows)==4 and all(r.nickname==identity.NAME for r in rows)
 assert len(db.scalars(select(User.id).where(User.nickname==identity.NAME)).all())==4
 for person in db.scalars(select(User).where(User.id.like('staff-%'))):
  before=db.execute(text('select nickname,avatar_asset,frame_asset from users where id=:id'),{'id':person.id}).one()
  db.delete(db.get(AdminRole,person.id));db.flush()
  assert person.nickname==before.nickname and person.avatar_asset==before.avatar_asset and person.frame_asset==before.frame_asset
  person.nickname='Restored-'+person.id
 db.commit()
print('PASS all four ranks, pending/flushed grants, rank changes, SQL aliases/filtering, locked inventory, flushed revocation and normal editing')
# Exercise the real authenticated role-badge endpoint with an isolated DB dependency.
from fastapi import FastAPI
from fastapi.testclient import TestClient
dbmod.get_db=lambda:None
from staff_app import role_badges
from sqlalchemy.pool import StaticPool
api_engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
Base.metadata.create_all(api_engine,tables=[User.__table__,AdminRole.__table__])
with Session(api_engine) as db:
 db.add(User(id='s',public_id='3000000000',nickname='PrivateName',avatar='🦊'));db.add(User(id='n',public_id='3000000001',nickname='Normal',avatar='🐶'));db.flush();db.add(AdminRole(user_id='s',role='FA'));db.commit()
def api_db():
 with Session(api_engine) as db:yield db
def auth():return object()
app=FastAPI();app.include_router(role_badges.register_auth(auth));app.dependency_overrides[dbmod.get_db]=api_db
client=TestClient(app)
r=client.get('/v1/role-badges?ids=s,n,missing');assert r.status_code==200,r.text
result=r.json();assert result['identities']['s']['nickname']==identity.NAME
assert result['identities']['n']['nickname']=='Normal' and not result['identities']['n']['management_locked']
assert result['badges']['s']=='FA' and result['badges']['missing'] is None
assert client.get('/v1/role-badges',params={'ids':','.join(str(i) for i in range(101))}).status_code==400
with Session(api_engine) as db:db.delete(db.get(AdminRole,'s'));db.commit()
r=client.get('/v1/role-badges?ids=s').json();assert r['identities']['s']['nickname']=='PrivateName' and r['badges']['s'] is None
print('PASS real FastAPI badge route, common identity, ordinary users, limit and revoked identity response')
from staff_app.schemas import UserOut
with Session(api_engine) as db:
 user=db.get(User,'s');db.add(AdminRole(user_id='s',role='UA'));db.commit()
 output=UserOut.model_validate(user).model_dump()
 assert output['nickname']==identity.NAME and output['management_locked']
 assert output['first_name']=='ErisChat' and output['last_name']=='Yönetim'
 assert output['gender']=='unspecified' and output['birth_date'] is None
 assert user._nickname=='PrivateName'
print('PASS real UserOut response schema and preserved stored identity')
# Execute the actual endpoint bodies in an isolated namespace; denied writes must stop before DB/charges.
import ast
class ForbiddenDB:
 def __getattr__(self,name):raise AssertionError('DB accessed before staff guard: '+name)
def guard_function(filename,name):
 module=ast.parse((ROOT/filename).read_text());node=next(n for n in module.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name)
 node.decorator_list=[];node.returns=None
 for arg in node.args.args:arg.annotation=None
 node.args.defaults=[]
 code=compile(ast.fix_missing_locations(ast.Module(body=[node],type_ignores=[])),str(ROOT/filename),'exec')
 ns={'__name__':'staff_app.routes_test','__package__':'staff_app','staff_identity':identity,'HTTPException':__import__('fastapi').HTTPException}
 exec(code,ns);return ns[name]
from types import SimpleNamespace
with Session(api_engine) as db:
 user=db.get(User,'s')
 for filename,name,payload in [('main.py','change_nickname',SimpleNamespace(nickname='NewName')),('main.py','update_me',SimpleNamespace(nickname=None,avatar='🐶',first_name=None,last_name=None,bio=None)),('cosmetic_routes.py','apply_cosmetic',SimpleNamespace(cosmetic_type='frame',asset_key='old')),('cosmetic_routes.py','purchase_cosmetic',SimpleNamespace(cosmetic_type='avatar',asset_key='old'))]:
  fn=guard_function(filename,name)
  try:fn(payload=payload,user=user,db=ForbiddenDB());raise AssertionError('Write allowed '+name)
  except __import__('fastapi').HTTPException as e:assert e.status_code==403
print('PASS actual endpoint bodies reject edits/purchases before database writes or charges (isolated dependencies)')

