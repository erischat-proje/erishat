"""CI-only PostgreSQL interleaving check, after test_integration.py has seeded the DB."""
import os,sys,threading,concurrent.futures
from pathlib import Path
url=os.environ.get('SECURITY_TEST_DATABASE_URL')
if not url:print('SKIP PostgreSQL concurrency: no isolated test database configured');raise SystemExit(0)
os.environ['DATABASE_URL']=url;os.environ['ENVIRONMENT']='production'
sys.path.insert(0,str(Path(os.environ.get('SECURITY_APP_ROOT','security/runtime')).resolve()))
from backend.app.main import app
from backend.app.platform_routes import router,WalletExchange
from backend.app.db import SessionLocal
from backend.app.models import User
from fastapi import HTTPException
route=next(r.endpoint for r in router.routes if getattr(r,'path',None)=='/v1/me/wallet/exchange')
def reset():
 with SessionLocal() as db:u=db.get(User,'user0');u.lidya=200;u.lidya_gem=0;db.commit()
def run(keys,amount):
 gate=threading.Barrier(2)
 def one(key):
  with SessionLocal() as db:
   user=db.get(User,'user0');assert user.lidya==200;gate.wait(timeout=10)
   try:return route(WalletExchange(direction='lidya_to_gem',amount=amount,idempotency_key=key),db,user)
   except HTTPException as e:db.rollback();return e.status_code
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:return list(ex.map(one,keys))
reset();rows=run(['pg-repeat-security-key']*2,100);assert all(isinstance(r,dict) for r in rows) and sum(bool(r.get('replayed')) for r in rows)==1,rows
with SessionLocal() as db:u=db.get(User,'user0');assert (u.lidya,u.lidya_gem)==(100,100)
reset();rows=run(['pg-different-security-1','pg-different-security-2'],150);assert sum(isinstance(r,dict) for r in rows)==1 and 400 in rows,rows
with SessionLocal() as db:u=db.get(User,'user0');assert (u.lidya,u.lidya_gem)==(50,150)
print('PASS PostgreSQL: concurrent duplicate key applied once; concurrent independent overspend denied; total currency conserved')
