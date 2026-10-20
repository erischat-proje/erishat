import os
import asyncio,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('guard',Path(os.environ.get('SECURITY_APP_ROOT','.'))/'backend/app/security_guard.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
async def echo(scope,receive,send):
 if scope['type']=='http':
  body=b''
  while True:
   msg=await receive();body+=msg.get('body',b'')
   if not msg.get('more_body'):break
  await send({'type':'http.response.start','status':200,'headers':[(b'content-type',b'application/json')]});await send({'type':'http.response.body','body':str(len(body)).encode()})
 else:
  assert (await receive())['type']=='websocket.connect';await send({'type':'websocket.accept'})
  while True:
   msg=await receive()
   if msg['type']=='websocket.disconnect':return
   await send({'type':'websocket.send','text':msg['text']})
async def http(body=b'{}',headers=(),path='/v1/test',method='POST',chunks=None,guard=None):
 scope={'type':'http','method':method,'path':path,'query_string':b'','headers':list(headers),'client':('test',1)}
 messages=chunks or [{'type':'http.request','body':body,'more_body':False}];sent=[]
 async def receive():return messages.pop(0) if messages else {'type':'http.disconnect'}
 async def send(m):sent.append(m)
 await (guard or mod.SecurityGuard(echo))(scope,receive,send)
 return sent[0]['status'],sent
async def ws(messages,origin='https://www.lidyachat.com',token='secret',validator=None):
 headers=[] if origin is None else [(b'origin',origin.encode())];scope={'type':'websocket','path':'/ws','client':('test',1),'headers':headers,'subprotocols':['erischat','token.'+token]};sent=[];queue=asyncio.Queue()
 for m in [{'type':'websocket.connect'}]+messages+[{'type':'websocket.disconnect','code':1000}]:await queue.put(m)
 async def send(m):sent.append(m)
 guard=mod.SecurityGuard(echo,allowed_origins=['https://www.lidyachat.com'],session_validator=validator,session_check_seconds=.01)
 await guard(scope,queue.get,send);assert guard.total_connections==0 and not guard.connections
 return sent
async def main():
 assert (await http(headers=[(b'content-type',b'application/json')]))[0]==200
 assert (await http(body=b'['*65+b'0'+b']'*65,headers=[(b'content-type',b'application/json')]))[0]==400
 assert (await http(body=b'{"text":"a\\\"{[x]}"}',headers=[(b'content-type',b'application/json')]))[0]==200
 assert (await http(headers=[(b'content-length',str(mod.JSON_LIMIT+1).encode())]))[0]==413
 assert (await http(headers=[(b'content-length',b'3')]))[0]==400
 assert (await http(headers=[(b'content-length',b'2'),(b'content-length',b'2')]))[0]==400
 assert (await http(headers=[(b'content-encoding',b'gzip')]))[0]==415
 assert (await http(headers=[(b'authorization',b'x'*1025)]))[0]==401
 assert (await http(method='TRACE'))[0]==405
 assert (await http(path='/.env',method='GET'))[0]==404
 assert (await http(path='/.git/config',method='GET'))[0]==404
 assert (await http(path='/.well-known/assetlinks.json',method='GET'))[0]==200
 old=mod.JSON_LIMIT;mod.JSON_LIMIT=16
 chunks=[{'type':'http.request','body':b'a'*10,'more_body':True},{'type':'http.request','body':b'b'*10,'more_body':False}]
 assert (await http(chunks=chunks))[0]==413;mod.JSON_LIMIT=old
 assert (await http(body=b'a'*20_000_000,headers=[(b'content-type',b'multipart/form-data; boundary=test')]))[0]==200
 g=mod.SecurityGuard(echo);g.active_uploads=8
 assert (await http(headers=[(b'content-type',b'multipart/form-data; boundary=test')],guard=g))[0]==503
 valid={'type':'websocket.receive','text':'{"type":"ping"}'}
 assert any(m['type']=='websocket.send' for m in await ws([valid]))
 assert (await ws([valid],origin='https://www.lidyachat.com.evil.example'))[0]['code']==1008
 assert any(m['type']=='websocket.send' for m in await ws([valid],origin=None))
 assert (await ws([valid],token=''))[0]['code']==1008
 for text,code in [('[]',1008),('INVALID',1008),('x'*65537,1009)]:
  output=await ws([{'type':'websocket.receive','text':text}]);assert any(m.get('code')==code for m in output),output
 output=await ws([{'type':'websocket.receive','bytes':b'raw'}]);assert any(m.get('code')==1003 for m in output)
 sent=[];queue=asyncio.Queue();await queue.put({'type':'websocket.connect'})
 async def send(m):
  sent.append(m)
  if m['type']=='websocket.close':await queue.put({'type':'websocket.disconnect','code':m['code']})
 guard=mod.SecurityGuard(echo,session_validator=lambda _:False,session_check_seconds=.01)
 await asyncio.wait_for(guard({'type':'websocket','path':'/ws','client':('test',1),'headers':[],'subprotocols':['erischat','token.secret']},queue.get,send),1)
 assert any(m.get('code')==1008 for m in sent) and guard.total_connections==0
 timer=[0];lim=mod.WindowLimiter(maximum=2,clock=lambda:timer[0]);assert lim.allow('key',2)[0] and lim.allow('key',2)[0] and not lim.allow('key',2)[0];timer[0]=61;assert lim.allow('key',2)[0]
 for k in range(10):lim.allow(k,10)
 assert len(lim.rows)==2
 print('PASS transport: bounded/chunked bodies, compression, length spoofing, 20 MB upload, overload, secret paths, exact WS origin, token shape, bad JSON/binary/oversize, idle session revocation, bounded limiter')
asyncio.run(main())
