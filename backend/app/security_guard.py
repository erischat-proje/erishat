"""Bounded transport protection. Authorization remains in the endpoint/domain layer."""
from __future__ import annotations
import asyncio
from collections import OrderedDict
import hashlib
import json
import logging
import re
import tempfile
import threading
import time
from urllib.parse import urlsplit

log = logging.getLogger('lidyachat.security')
JSON_LIMIT = 12 * 1024 * 1024  # Includes existing 8 MB base64 ban evidence.
UPLOAD_LIMIT = 84 * 1024 * 1024  # Existing 80 MiB social videos + multipart framing.
WS_LIMIT = 64 * 1024

def bounded_json_shape(data):
    depth=0;tokens=0;quoted=False;escaped=-1
    for match in re.finditer(br'[{}\[\]",\\]',data):
        position=match.start();char=match.group()
        if quoted:
            if position==escaped:escaped=-1;continue
            if char==b'\\':escaped=position+1
            elif char==b'"':quoted=False
            continue
        tokens+=1
        if tokens>50000:return False
        if char==b'"':quoted=True
        elif char in (b'{',b'['):
            depth+=1
            if depth>64:return False
        elif char in (b'}',b']'):
            depth-=1
            if depth<0:return False
    return True

class WindowLimiter:
    def __init__(self, maximum=20000, clock=time.monotonic):
        self.rows = OrderedDict(); self.lock = threading.Lock(); self.maximum = maximum; self.clock = clock
    def allow(self, key, limit, seconds=60):
        now = self.clock()
        with self.lock:
            count, until = self.rows.get(key, (0, now + seconds))
            if now >= until: count, until = 0, now + seconds
            self.rows[key] = (min(count + 1, limit + 1), until)
            self.rows.move_to_end(key)
            while len(self.rows) > self.maximum: self.rows.popitem(last=False)
            return count < limit, max(1, int(until - now) + 1)

def _origin(value):
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ('http','https') or not parsed.netloc or parsed.username or parsed.password or parsed.path not in ('','/') or parsed.query or parsed.fragment: return None
        return parsed.scheme.lower() + '://' + parsed.netloc.lower()
    except ValueError: return None

class SecurityGuard:
    def __init__(self, app, allowed_origins=(), limiter=None, session_validator=None, session_check_seconds=30):
        self.session_validator=session_validator;self.session_check_seconds=session_check_seconds
        self.app = app; self.limiter = limiter or WindowLimiter()
        self.origins = {_origin(v.strip()) for v in allowed_origins if v.strip() != '*'} - {None}
        self.connections = {}; self.total_connections = 0; self.active_bodies=0; self.active_uploads=0
    async def reject(self, send, status, message, retry=None):
        headers = [(b'content-type',b'application/json'),(b'cache-control',b'no-store'),(b'x-content-type-options',b'nosniff')]
        if retry: headers.append((b'retry-after',str(retry).encode()))
        await send({'type':'http.response.start','status':status,'headers':headers})
        await send({'type':'http.response.body','body':json.dumps({'detail':message},ensure_ascii=False).encode()})
    async def __call__(self, scope, receive, send):
        kind = scope['type']
        if kind not in ('http','websocket'): return await self.app(scope,receive,send)
        headers = {k.lower():v for k,v in scope.get('headers',[])}
        peer = str((scope.get('client') or ('unknown',0))[0])  # Never consume arbitrary forwarding headers.
        path = scope.get('path','')
        if kind == 'websocket': return await self.websocket(scope,receive,send,headers,peer)
        sensitive = path.startswith('/v1/')
        async def secured_send(message):
            if message['type'] == 'http.response.start':
                hs = list(message.get('headers',[])); names = {k.lower() for k,v in hs}
                for k,v in [(b'x-content-type-options',b'nosniff'),(b'referrer-policy',b'no-referrer')]:
                    if k not in names: hs.append((k,v))
                if not sensitive and any(k.lower()==b'content-type' and b'text/html' in v for k,v in hs):
                    hs.extend([(b'content-security-policy',b"frame-ancestors 'self'; object-src 'none'; base-uri 'self'"),(b'x-frame-options',b'SAMEORIGIN'),(b'permissions-policy',b'screen-wake-lock=(self)')])
                if sensitive:
                    hs = [(k,v) for k,v in hs if k.lower() not in (b'cache-control',b'pragma')]
                    hs.extend([(b'cache-control',b'private, no-store, max-age=0'),(b'pragma',b'no-cache')])
                message = {**message,'headers':hs}
            await send(message)
        if not sensitive:
            if re.search(r'(?i)(^|/)(\.env[^/]*|\.git|\.svn|\.hg|\.htaccess|\.htpasswd|[^/]+\.(env|pem|key|p12|pfx|keystore|jks|sqlite|sqlite3|db|bak|sql|log|map))($|/)',path):
                return await self.reject(secured_send,404,'Bulunamadı.')
            return await self.app(scope,receive,secured_send)
        method = scope.get('method','GET').upper()
        if method not in ('GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'):
            return await self.reject(secured_send,405,'Bu istek yöntemi desteklenmiyor.')
        if len(scope.get('query_string',b'')) > 16384 or len(path) > 2048:
            return await self.reject(secured_send,414,'İstek adresi çok uzun.')
        if method == 'OPTIONS': return await self.app(scope,receive,secured_send)
        ok,retry = self.limiter.allow(('peer',peer),1200)
        if not ok: return await self.reject(secured_send,429,'Çok fazla istek. Biraz bekleyip yeniden deneyin.',retry)
        authorization = headers.get(b'authorization',b'')
        if len(authorization) > 1024: return await self.reject(secured_send,401,'Geçersiz oturum.')
        if authorization:
            key = hashlib.sha256(authorization).digest()
            ok,retry = self.limiter.allow(('session',key),900)
            if not ok: return await self.reject(secured_send,429,'İstek sınırı aşıldı.',retry)
        # Authentication requests are also limited across workers in security_limits.py.
        if path.startswith('/v1/auth/') and method == 'POST' or path == '/v1/users' and method == 'POST':
            from starlette.concurrency import run_in_threadpool
            from .security_limits import enforce_limit
            try: await run_in_threadpool(enforce_limit,'peer:'+peer,'authentication',30,60)
            except Exception as error:
                from fastapi import HTTPException
                if isinstance(error,HTTPException): return await self.reject(secured_send,error.status_code,error.detail,60 if error.status_code==429 else None)
                raise
        if method not in ('POST','PUT','PATCH','DELETE'): return await self.app(scope,receive,secured_send)
        if headers.get(b'content-encoding',b'identity').lower() != b'identity':
            return await self.reject(secured_send,415,'Sıkıştırılmış istek gövdesi desteklenmiyor.')
        content_type = headers.get(b'content-type',b'').split(b';',1)[0].strip().lower()
        maximum = UPLOAD_LIMIT if content_type == b'multipart/form-data' else JSON_LIMIT
        lengths = [v for k,v in scope.get('headers',[]) if k.lower()==b'content-length']
        try:
            if len(lengths)>1: raise ValueError()
            declared = int(lengths[0]) if lengths else None
            if declared is not None and declared < 0: raise ValueError()
        except ValueError: return await self.reject(secured_send,400,'Geçersiz gövde uzunluğu.')
        if declared is not None and declared > maximum: return await self.reject(secured_send,413,'İstek boyutu sınırı aşıldı.')
        # Bound memory even for chunked/misdeclared bodies; parse only a complete bounded body.
        upload=content_type==b'multipart/form-data'
        if self.active_bodies>=32 or upload and self.active_uploads>=8:
            return await self.reject(secured_send,503,'Yükleme yoğunluğu yüksek. Birkaç saniye sonra deneyin.',2)
        self.active_bodies+=1
        if upload:self.active_uploads+=1
        try:
            with tempfile.SpooledTemporaryFile(max_size=2*1024*1024) as spool:
                size=0;started=time.monotonic()
                while True:
                    try: message=await asyncio.wait_for(receive(),timeout=30)
                    except asyncio.TimeoutError: return await self.reject(secured_send,408,'İstek zaman aşımına uğradı.')
                    if message['type']=='http.disconnect': return
                    chunk=message.get('body',b'');size+=len(chunk)
                    if size>maximum: return await self.reject(secured_send,413,'İstek boyutu sınırı aşıldı.')
                    if time.monotonic()-started>180: return await self.reject(secured_send,408,'Yükleme zaman aşımına uğradı.')
                    spool.write(chunk)
                    if not message.get('more_body',False): break
                if declared is not None and size!=declared: return await self.reject(secured_send,400,'İstek gövdesi eksik veya geçersiz.')
                if not content_type or content_type==b'application/json' or content_type.endswith(b'+json'):
                    spool.seek(0)
                    if not bounded_json_shape(spool.read()):return await self.reject(secured_send,400,'İstek yapısı sınırı aşıldı.')
                spool.seek(0);finished=False
                async def replay():
                    nonlocal finished
                    if finished: return await receive()
                    body=spool.read(65536);more=spool.tell()<size
                    if not more:finished=True
                    return {'type':'http.request','body':body,'more_body':more}
                return await self.app(scope,replay,secured_send)
        finally:
            self.active_bodies-=1
            if upload:self.active_uploads-=1
    async def websocket(self,scope,receive,send,headers,peer):
        origin = headers.get(b'origin')
        if origin is not None and _origin(origin.decode('latin1')) not in self.origins:
            await send({'type':'websocket.close','code':1008,'reason':'Geçersiz kaynak.'});return
        protocols = scope.get('subprotocols',[])
        tokens = [p[6:] for p in protocols if p.startswith('token.')]
        if len(tokens)!=1 or not tokens[0] or len(tokens[0])>512:
            await send({'type':'websocket.close','code':1008,'reason':'Geçersiz oturum.'});return
        actor=hashlib.sha256(tokens[0].encode()).digest()
        ok,_=self.limiter.allow(('ws-open',peer),120)
        connection_key=actor
        if not ok or self.connections.get(connection_key,0)>=6 or self.total_connections>=2000:
            await send({'type':'websocket.close','code':1013,'reason':'Bağlantı sınırı.'});return
        self.connections[connection_key]=self.connections.get(connection_key,0)+1;self.total_connections+=1
        closed=False
        async def guarded_receive():
            nonlocal closed
            message=await receive()
            if message['type']!='websocket.receive': return message
            size=len(message.get('bytes') or b'')+len((message.get('text') or '').encode())
            okay,_=self.limiter.allow(('ws-message',actor),900)
            reason=None
            if size>WS_LIMIT:reason=(1009,'Mesaj çok büyük.')
            elif not okay:reason=(1008,'Mesaj sınırı aşıldı.')
            elif message.get('text') is not None:
                try:
                    data=json.loads(message['text'])
                    if not isinstance(data,dict):reason=(1008,'Geçersiz mesaj biçimi.')
                except (ValueError,RecursionError):reason=(1008,'Geçersiz JSON.')
            else:reason=(1003,'İkili mesaj desteklenmiyor.')
            if reason:
                if not closed:await send({'type':'websocket.close','code':reason[0],'reason':reason[1]});closed=True
                return {'type':'websocket.disconnect','code':reason[0]}
            return message
        async def guarded_send(message):
            nonlocal closed
            if closed:return
            if message['type']=='websocket.close':closed=True
            await send(message)
        async def watch_session():
            nonlocal closed
            from starlette.concurrency import run_in_threadpool
            while not closed:
                await asyncio.sleep(self.session_check_seconds)
                if closed:return
                try:valid=await run_in_threadpool(self.session_validator,tokens[0])
                except Exception:valid=False
                if not valid and not closed:
                    closed=True
                    await send({'type':'websocket.close','code':1008,'reason':'Oturum sona erdi.'})
                    return
        watcher=asyncio.create_task(watch_session()) if self.session_validator else None
        try:await self.app(scope,guarded_receive,guarded_send)
        finally:
            if watcher:
                watcher.cancel()
                try:await watcher
                except asyncio.CancelledError:pass
            remaining=self.connections.get(connection_key,1)-1
            if remaining:self.connections[connection_key]=remaining
            else:self.connections.pop(connection_key,None)
            self.total_connections-=1
