import os,sys,tempfile,concurrent.futures
from pathlib import Path
fd,name=tempfile.mkstemp(suffix='.sqlite');os.close(fd)
os.environ['DATABASE_URL']='sqlite:///'+name
sys.path.insert(0,str(Path(os.environ.get('SECURITY_APP_ROOT','security/runtime')).resolve()))
from backend.app.security_limits import SecurityCounter,enforce_limit
from backend.app.db import engine
from fastapi import HTTPException
from sqlalchemy import select,func
SecurityCounter.__table__.create(engine)
def consume(_):
 try:enforce_limit('same-account','pin',8,bind=engine,at=300);return True
 except HTTPException as e:assert e.status_code==429;return False
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:results=list(ex.map(consume,range(40)))
assert sum(results)==8,results
with engine.connect() as c:assert c.scalar(select(func.max(SecurityCounter.count)))==9
# An unrelated account and the following window stay usable; raw identity never stored.
enforce_limit('other-account','pin',8,bind=engine,at=300)
enforce_limit('same-account','pin',8,bind=engine,at=361)
with engine.connect() as c:
 keys=c.scalars(select(SecurityCounter.key)).all();assert all(len(k)==64 and 'account' not in k for k in keys)
print('PASS shared DB atomic counter: 40 parallel attempts allow exactly 8, saturated denied count, independent account, expiry window and hashed keys')
