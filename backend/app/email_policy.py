"""Disposable mailbox policy. No email address is sent to an external lookup API."""
from functools import lru_cache
from pathlib import Path
import re
from fastapi import HTTPException

ROOT=Path(__file__).resolve().parent/'security_data'
# Common legitimate providers are never inferred to be disposable from substrings.
PROTECTED={'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','icloud.com','proton.me','protonmail.com'}

def domain_of(address):
    if not isinstance(address,str) or len(address)>320 or address.count('@')!=1 or any(c.isspace() or ord(c)<33 or ord(c)==127 for c in address):raise ValueError('invalid email')
    local,domain=address.rsplit('@',1)
    if not local or len(local)>64 or local.startswith('.') or local.endswith('.') or '..' in local:raise ValueError('invalid email')
    if not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+",local):raise ValueError('invalid email')
    domain=domain.encode('idna').decode('ascii').lower()
    if len(domain)>253 or domain.endswith('.') or len(domain.split('.'))<2:raise ValueError('invalid email')
    if any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?',part) for part in domain.split('.')):raise ValueError('invalid email')
    return domain

@lru_cache(maxsize=1)
def blocked_domains():
    rows=set()
    for path in [ROOT/'disposable_domains.txt',ROOT/'disposable_extra.txt',ROOT/'disposable_domains_cache.txt']:
        if not path.exists():continue
        for line in path.read_text(encoding='utf-8').splitlines():
            domain=line.strip().lower()
            if domain and not domain.startswith('#'):rows.add(domain)
    if not rows:raise RuntimeError('Disposable email policy is unavailable')
    return frozenset(rows-PROTECTED)

def is_disposable(address):
    domain=domain_of(address)
    allow={line.strip().lower() for line in (ROOT/'disposable_allow.txt').read_text().splitlines() if line.strip() and not line.startswith('#')}|PROTECTED
    if any(domain==entry or domain.endswith('.'+entry) for entry in allow):return False
    parts=domain.split('.')
    return any('.'.join(parts[index:]) in blocked_domains() for index in range(len(parts)-1))

def require_email(address):
    try:blocked=is_disposable(address)
    except (ValueError,UnicodeError):raise HTTPException(422,'Geçerli bir e-posta adresi girin.') from None
    if blocked:raise HTTPException(422,'Geçici veya tek kullanımlık e-posta adresleri kabul edilmiyor. Kalıcı e-posta adresinizi kullanın.')
    return address

SOURCE_URLS=(
 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf',
 'https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt',
)

def parse_domains(text):
    result=set()
    for line in text.splitlines():
        line=line.strip()
        if not line or line.startswith('#'):continue
        try:result.add(domain_of('x@'+line))
        except (ValueError,UnicodeError):continue
    return result-PROTECTED

def refresh_domains():
    import os,tempfile,urllib.request
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    opener=urllib.request.build_opener(NoRedirect())
    rows=set()
    for url in SOURCE_URLS:
        with opener.open(urllib.request.Request(url,headers={'User-Agent':'LidyaChat-domain-policy/1'}),timeout=8) as response:
            if response.status!=200:raise ValueError('domain source status')
            data=response.read(3_000_001)
        if len(data)>3_000_000:raise ValueError('domain source too large')
        part=parse_domains(data.decode('utf-8'))
        if len(part)<1000:raise ValueError('domain source incomplete')
        rows.update(part)
    if len(rows)>250000:raise ValueError('domain list too large')
    data='\n'.join(sorted(rows))+'\n'
    handle,path=tempfile.mkstemp(dir=ROOT,prefix='domains-',suffix='.tmp')
    try:
        with os.fdopen(handle,'w',encoding='utf-8') as stream:stream.write(data)
        os.replace(path,ROOT/'disposable_domains_cache.txt');blocked_domains.cache_clear()
    finally:
        if os.path.exists(path):os.unlink(path)
    return len(rows)

async def refresh_loop():
    import asyncio,logging
    logger=logging.getLogger('lidyachat.security')
    while True:
        try:
            count=await asyncio.to_thread(refresh_domains)
            logger.info('disposable_domains_refreshed count=%s',count)
        except Exception as error:
            # A network outage never disables the bundled blocklist or blocks all email.
            logger.warning('disposable_domains_refresh_failed kind=%s',type(error).__name__)
        await asyncio.sleep(24*60*60)
