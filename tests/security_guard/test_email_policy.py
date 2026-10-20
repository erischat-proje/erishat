import os
from pathlib import Path
import importlib.util,tempfile,shutil,urllib.request
spec=importlib.util.spec_from_file_location('policy',Path(os.environ.get('SECURITY_APP_ROOT','.'))/'backend/app/email_policy.py');policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
from fastapi import HTTPException
for address in ['a@mailinator.com','a@MAILINATOR.COM','a@child.mailinator.com','a@10minutemail.com','a@guerrillamail.com','a@yopmail.com','a@mailinator。com']:
 try:policy.require_email(address);raise AssertionError(address)
 except HTTPException as e:assert e.status_code==422
for address in ['name@gmail.com','name+tag@gmail.com','name@outlook.com','name@proton.me','name@lidyachat.com','name@mailinator.com.evil.example']:
 assert policy.require_email(address)==address,address
for address in ['a@@gmail.com','a@gmail.com.','a@localhost','<script>@gmail.com','a@ gmail.com','a@x.com\r\nBcc:evil@y.com','a..b@gmail.com','@gmail.com']:
 try:policy.require_email(address);raise AssertionError(address)
 except HTTPException as e:assert e.status_code==422
original=policy.ROOT
with tempfile.TemporaryDirectory() as folder:
 policy.ROOT=Path(folder)
 for path in original.iterdir():
  if path.is_file():shutil.copy(path,policy.ROOT/path.name)
 policy.blocked_domains.cache_clear()
 class Response:
  status=200
  def __enter__(self):return self
  def __exit__(self,*args):pass
  def read(self,size):return ('\n'.join('temporary'+str(i)+'.example' for i in range(1001))).encode()
 class Opener:
  def open(self,*args,**kwargs):return Response()
 old=urllib.request.build_opener;urllib.request.build_opener=lambda *args:Opener()
 try:
  assert policy.refresh_domains()==1001
  assert policy.is_disposable('a@temporary1.example')
  before=(policy.ROOT/'disposable_domains_cache.txt').read_bytes()
  class Broken:
   def open(self,*args,**kwargs):raise OSError('offline')
  urllib.request.build_opener=lambda *args:Broken()
  try:policy.refresh_domains();raise AssertionError('failure missing')
  except OSError:pass
  assert (policy.ROOT/'disposable_domains_cache.txt').read_bytes()==before and policy.is_disposable('a@mailinator.com')
  (policy.ROOT/'disposable_allow.txt').write_text('temporary1.example\n');assert not policy.is_disposable('a@temporary1.example')
 finally:urllib.request.build_opener=old;policy.ROOT=original;policy.blocked_domains.cache_clear()
print('PASS email policy: known services, subdomains, case/IDN, valid providers/plus aliases, malformed/header injection, atomic bounded refresh, offline fallback and explicit correction')
