import os,sys,tempfile
from pathlib import Path
fd,dbpath=tempfile.mkstemp(suffix='.sqlite');os.close(fd)
os.environ['DATABASE_URL']=os.environ.get('SECURITY_TEST_DATABASE_URL') or 'sqlite:///'+dbpath;os.environ['ENVIRONMENT']='production';os.environ['CORS_ORIGINS']='https://www.lidyachat.com'
sys.path.insert(0,str(Path(os.environ.get('SECURITY_APP_ROOT','security/runtime')).resolve()))
from backend.app.main import app
from backend.app.db import Base,engine,SessionLocal
from backend.app.models import User,Conversation,ConversationMember,Message
from backend.app.platform_models import ConversationFolder,ConversationVault,MessageHidden
from backend.app.session import create_session,UserSession,hash_token
from backend.app.admin_models import AdminRole
from backend.app.dm_folders import _hash
from backend.app.security_limits import SecurityCounter
from fastapi.testclient import TestClient
from datetime import datetime,timezone,timedelta
from sqlalchemy import select
from sqlalchemy import BigInteger,Integer
if engine.dialect.name=='sqlite':
 for table in Base.metadata.tables.values():
  for column in table.columns:
   if column.primary_key and isinstance(column.type,BigInteger):column.type=Integer()
Base.metadata.create_all(engine)
with SessionLocal() as db:
 users=[];tokens=[]
 for i in range(3):
  u=User(id='user'+str(i),public_id=str(1000000000+i),nickname='Tester '+str(i),avatar='x',gender='male');db.add(u);db.commit();users.append(u);tokens.append(create_session(db,u))
 other=create_session(db,users[0]);outsider=create_session(db,users[2])
 db.add(Conversation(id='private',type='dm'));db.flush();db.add_all([ConversationMember(conversation_id='private',user_id='user0'),ConversationMember(conversation_id='private',user_id='user1')]);db.flush();m=Message(conversation_id='private',sender_id='user1',text='PRIVATE SECRET');db.add(m);db.flush();mid=m.id
 db.add(ConversationFolder(user_id='user0',conversation_id='private',locked=True));db.add(ConversationVault(user_id='user0',pin_hash=_hash('123456'),hint='hint',answer_hash=_hash('answer')));db.commit()
client=TestClient(app,raise_server_exceptions=True)
def h(i=0):return {'Authorization':'Bearer '+tokens[i]}
assert len([r for r in app.routes if getattr(r,'path',None)=='/v1/messages/{conversation_id}' and 'GET' in getattr(r,'methods',set())])==1
r=client.get('/v1/messages/private',headers=h(2));assert r.status_code==403,r.text
r=client.get('/v1/messages/private',headers=h());assert r.status_code==403 and 'şifre' in r.text.lower(),r.text
r=client.post('/v1/messages/private',headers=h(),json={'text':'bypass'});assert r.status_code==403,r.text
r=client.post('/v1/me/dm-vault/unlock',headers=h(),json={'pin':'123456'});assert r.status_code==200,r.text;vault=r.json()['token']
r=client.get('/v1/messages/private',headers={**h(),'X-Eris-Dm-Vault':vault});assert r.status_code==200 and 'PRIVATE SECRET' in r.text,r.text
r=client.get('/v1/messages/private',headers={**h(2),'X-Eris-Dm-Vault':vault});assert r.status_code==403
with SessionLocal() as db:db.add(MessageHidden(message_id=mid,user_id='user0'));db.commit()
r=client.get('/v1/messages/private',headers={**h(),'X-Eris-Dm-Vault':vault});assert r.status_code==200 and 'PRIVATE SECRET' not in r.text,r.text
print('PASS actual API: one DM route, outsider denied, locked read/write denied, owner PIN unlock, vault token not transferable, hidden message excluded')
# Sensitive data lookups require server-owned DA permission, not a forged client header.
for i in range(3):
 r=client.get('/v1/admin/users/user1',headers={**h(i),'X-Admin-Role':'DA'});assert r.status_code==403,r.text
r=client.get('/v1/me/security/sessions',headers=h());assert r.status_code==200 and len(r.json()['items'])==2
assert tokens[0] not in r.text and other not in r.text
r=client.delete('/v1/me/security/sessions/'+hash_token(outsider),headers=h());assert r.status_code==404
r=client.delete('/v1/me/security/sessions/others',headers=h());assert r.status_code==200 and r.json()['revoked']==1,r.text
assert client.get('/v1/me',headers={'Authorization':'Bearer '+other}).status_code==401
assert client.get('/v1/me',headers=h()).status_code==200
assert client.get('/v1/me',headers={'Authorization':'Bearer '+outsider}).status_code==200
print('PASS actual API: forged role rejected, owner-only session listing/revocation, credentials not returned, current and unrelated account preserved')
for n in range(9):r=client.post('/v1/me/dm-vault/unlock',headers=h(),json={'pin':'999999'})
assert r.status_code==429 and 'Retry-After' in r.headers,r.text
assert client.get('/v1/me',headers=h()).status_code==200
r=client.post('/v1/auth/google',json={'credential':'PRIVATE_TOKEN'});assert r.status_code==422 and 'PRIVATE_TOKEN' not in r.text,r.text
for path in ['/docs','/redoc','/openapi.json','/.env','/.git/config','/backup.sql']:
 assert client.get(path).status_code==404,path
r=client.get('/v1/me',headers=h());assert 'no-store' in r.headers['cache-control'] and r.headers['x-content-type-options']=='nosniff'
r=client.options('/v1/me',headers={'Origin':'https://www.lidyachat.com','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'});assert r.status_code==200 and r.headers.get('access-control-allow-origin')=='https://www.lidyachat.com'
r=client.options('/v1/me',headers={'Origin':'https://www.lidyachat.com.evil.example','Access-Control-Request-Method':'GET'});assert r.status_code==400
print('PASS actual API: PIN throttled without general account lockout, input secret redaction, production docs closed, secret paths denied, no-store/nosniff, exact CORS origins')
# Reproduce a balance cached before another committed transaction, then invoke the actual wallet route.
from backend.app.platform_routes import WalletExchange
from backend.app.platform_routes import router as platform_router
wallet_route=next(route.endpoint for route in platform_router.routes if getattr(route,'path',None)=='/v1/me/wallet/exchange')
from fastapi import HTTPException
with SessionLocal() as db:
 owner=db.get(User,'user0');owner.lidya=1000;owner.lidya_gem=0;db.commit()
with SessionLocal() as stale_db:
 stale=stale_db.get(User,'user0');assert stale.lidya==1000
 with SessionLocal() as concurrent_db:
  owner=concurrent_db.get(User,'user0');owner.lidya=500;concurrent_db.commit()
 try:wallet_route(payload=WalletExchange(direction='lidya_to_gem',amount=600,idempotency_key='security-wallet-test'),db=stale_db,user=stale);raise AssertionError('stale overspend allowed')
 except HTTPException as e:assert e.status_code==400
 stale_db.rollback()
 result=wallet_route(payload=WalletExchange(direction='lidya_to_gem',amount=200,idempotency_key='security-wallet-test'),db=stale_db,user=stale)
 assert result['lidya']==300 and result['lidya_gem']==200,result
 repeat=wallet_route(payload=WalletExchange(direction='lidya_to_gem',amount=200,idempotency_key='security-wallet-test'),db=stale_db,user=stale)
 assert repeat['replayed'] and repeat['lidya']==300
 try:wallet_route(payload=WalletExchange(direction='gem_to_lidya',amount=200,idempotency_key='security-wallet-test'),db=stale_db,user=stale);raise AssertionError('key conflict not rejected')
 except HTTPException as e:assert e.status_code==409
print('PASS actual wallet route: stale balance refreshed, overspend denied, conversion applied once, replay stable, conflicting operation key rejected')
# Actual shared OTP consumer: a second session holding an old object cannot consume it twice.
from backend.app.otp import create_otp,verify_otp
from backend.app.models import AuthOTP
with SessionLocal() as first,SessionLocal() as second:
 otp,code=create_otp(first,'email','security-test@example.invalid','login')
 stale_otp=second.get(AuthOTP,otp.id)
 assert verify_otp(first,otp,code)
 assert not verify_otp(second,stale_otp,code)
print('PASS actual shared OTP consumer: single-use and stale-session replay rejection')
# Disposable policy acts before delivery and again before redemption, including older OTPs.
for purpose in ('register','login','link'):
 r=client.post('/v1/auth/otp/request',json={'provider':'email','identifier':'example@mailinator.com','purpose':purpose})
 assert r.status_code==422 and 'tek kullanımlık' in r.text,r.text
r=client.post('/v1/users',json={'nickname':'Anonim_test','gender':'male','avatar':'x'});assert r.status_code==410,r.text
print('PASS actual API: disposable register/login/link requests rejected, unverified legacy signup cannot bypass the email policy')
from starlette.websockets import WebSocketDisconnect
for origin,token in [('https://www.lidyachat.com.evil.example',tokens[0]),('https://www.lidyachat.com','forged-token')]:
 try:
  with client.websocket_connect('/ws',subprotocols=['erischat','token.'+token],headers={'origin':origin}):raise AssertionError('unauthorized websocket')
 except WebSocketDisconnect as e:assert e.code==1008
with client.websocket_connect('/ws',subprotocols=['erischat','token.'+tokens[0]],headers={'origin':'https://www.lidyachat.com'}) as ws:
 ws.send_json({'type':'ping'});assert ws.receive_json()['type']=='pong'
 ws.send_json([])
 try:ws.receive_json();raise AssertionError('invalid websocket message accepted')
 except WebSocketDisconnect as e:assert e.code==1008
print('PASS actual websocket: forged/suffix-origin handshake rejected, live session ping works, non-object message closes connection')
