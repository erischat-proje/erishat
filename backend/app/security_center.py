"""Case-scoped, audited security operations; Workspace re-authentication via Gmail.

No backdoor: the account must already be authenticated, be an active DA, and own
an approved public ID. OAuth tokens are encrypted at rest and never returned.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr
from urllib.parse import urlencode

import requests
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .db import Base, get_db
from .models import User, Message
from .platform_models import Report
from .admin_models import AdminRole
from .session import UserSession, hash_token
from .config import settings

router = APIRouter(prefix='/v1/security', tags=['security center'])
START_MAIL = 'destek@lidyachat.com'
TARGET_MAIL = 'erischat@erischat.com'
PURPOSES = {'access': (START_MAIL, TARGET_MAIL), 'archive': (TARGET_MAIL, START_MAIL)}
# Mail sending is deliberately manual: the server only verifies both mailboxes.
SCOPES = 'https://www.googleapis.com/auth/gmail.readonly'
REDIRECT_PATH = '/v1/security/google/callback'
TOKEN_URL = 'https://oauth2.googleapis.com/token'
AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GMAIL_URL = 'https://gmail.googleapis.com/gmail/v1/users/me'


def now_utc():
    return datetime.now(timezone.utc)


def aware(dt):
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


class SecurityMailbox(Base):
    __tablename__ = 'security_mailboxes'
    email: Mapped[str] = mapped_column(String(320), primary_key=True)
    encrypted_refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SecurityOAuthState(Base):
    __tablename__ = 'security_oauth_states'
    state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    mailbox: Mapped[str] = mapped_column(String(320), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    session_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    pkce_verifier: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SecurityChallenge(Base):
    __tablename__ = 'security_challenges'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    session_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    purpose: Mapped[str] = mapped_column(String(16), nullable=False)
    subject: Mapped[str] = mapped_column(String(180), nullable=False, unique=True)
    target_event_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SecurityGrant(Base):
    __tablename__ = 'security_grants'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    session_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SecurityCase(Base):
    __tablename__ = 'security_cases'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    report_id: Mapped[int] = mapped_column(Integer, nullable=False)
    target_user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default='open')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SecurityEvent(Base):
    __tablename__ = 'security_events'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    subject: Mapped[str] = mapped_column(String(128), nullable=False, default='')
    details: Mapped[str] = mapped_column(String(600), nullable=False, default='')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SecurityEventVisibility(Base):
    __tablename__ = 'security_event_visibility'
    __table_args__ = (UniqueConstraint('actor_id','event_id',name='uq_security_event_hidden'),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    event_id: Mapped[int] = mapped_column(Integer, nullable=False)
    hidden_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ConnectRequest(BaseModel):
    mailbox: str


class ChallengeRequest(BaseModel):
    purpose: str
    event_id: int | None = Field(default=None, ge=1)


class ChallengeVerify(BaseModel):
    challenge_id: str = Field(min_length=32, max_length=64)


class CaseCreate(BaseModel):
    report_id: int = Field(ge=1)
    reason: str = Field(min_length=20, max_length=1500)


def configured():
    return bool(settings.security_google_client_id and settings.security_google_client_secret and
                settings.security_gmail_fernet_key and settings.security_google_redirect_uri)


def cipher():
    if not settings.security_gmail_fernet_key:
        raise HTTPException(503, 'Güvenlik bağlantısı henüz yapılandırılmadı')
    try:
        return Fernet(settings.security_gmail_fernet_key.encode())
    except (ValueError, TypeError) as exc:
        raise HTTPException(503, 'Güvenlik şifreleme anahtarı geçersiz') from exc


def hval(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def event(db, user, kind, subject='', details=''):
    db.add(SecurityEvent(actor_id=user.id, kind=kind, subject=str(subject)[:128],
                         details=str(details)[:600], created_at=now_utc()))


def require_owner(db, user):
    if not settings.security_owner_public_id or not hmac.compare_digest(user.public_id, settings.security_owner_public_id):
        raise HTTPException(403, 'Güvenlik merkezi yetkisi yok')
    role = db.get(AdminRole, user.id)
    if not role or role.role != 'DA' or not user.is_active:
        raise HTTPException(403, 'Aktif DA yetkisi gerekli')


def session_fingerprint(db, user, authorization):
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(401, 'Giriş gerekli')
    raw = authorization.split(' ',1)[1].strip()
    fingerprint = hash_token(raw)
    row = db.get(UserSession, fingerprint)
    if not row or row.user_id != user.id or aware(row.expires_at) <= now_utc():
        raise HTTPException(401, 'Oturum doğrulanamadı')
    return fingerprint


def access_grant(db, user, authorization):
    require_owner(db,user)
    fingerprint = session_fingerprint(db,user,authorization)
    grant = db.scalar(select(SecurityGrant).where(SecurityGrant.user_id == user.id,
                    SecurityGrant.session_hash == fingerprint, SecurityGrant.revoked_at.is_(None),
                    SecurityGrant.expires_at > now_utc()).order_by(SecurityGrant.expires_at.desc()))
    if not grant:
        raise HTTPException(403, '30 dakikalık güvenlik oturumu gerekli')
    return grant


def mailbox_token(db, email):
    row = db.get(SecurityMailbox, email)
    if not row:
        raise HTTPException(503, f'{email} henüz bağlanmadı')
    try:
        refresh_token = cipher().decrypt(row.encrypted_refresh_token.encode()).decode()
    except InvalidToken as exc:
        raise HTTPException(503, 'Gmail şifreleme anahtarı güncellenmeli') from exc
    try:
        r = requests.post(TOKEN_URL, data={
            'client_id':settings.security_google_client_id,
            'client_secret':settings.security_google_client_secret,
            'refresh_token':refresh_token,'grant_type':'refresh_token'},timeout=12)
        r.raise_for_status()
        return r.json()['access_token']
    except (requests.RequestException, ValueError, KeyError) as exc:
        raise HTTPException(503, 'Workspace bağlantısı kullanılamıyor; yeniden yetkilendirin') from exc


def gmail_get(access_token,path,params):
    try:
        r=requests.get(GMAIL_URL+path,params=params,headers={'Authorization':'Bearer '+access_token},timeout=12)
        r.raise_for_status()
        return r.json()
    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(503, 'Gmail API erişimi başarısız') from exc


def headers_of(payload):
    return {h.get('name','').lower():h.get('value','') for h in payload.get('payload',{}).get('headers',[])}


def matching_mails(token, label, sender, receiver, subject, issued):
    # A unique challenge in the subject, plus exact metadata verification.
    q='in:'+label+' "'+subject+'"'
    result=gmail_get(token,'/messages',{'q':q,'maxResults':10})
    matched=set()
    for item in result.get('messages',[])[:10]:
        m=gmail_get(token,'/messages/'+item['id'],{'format':'metadata',
                      'metadataHeaders':['From','To','Subject','Message-ID']})
        h=headers_of(m)
        if h.get('subject') != subject: continue
        if parseaddr(h.get('from',''))[1].lower() != sender: continue
        # Multiple To recipients supported; never accept a mismatched target.
        from email.utils import getaddresses
        if receiver not in [v.lower() for _,v in getaddresses([h.get('to','')])]:continue
        mid=h.get('message-id','').strip().lower()
        if not mid:continue
        try:msg_date=datetime.fromtimestamp(int(m['internalDate'])/1000,timezone.utc)
        except (KeyError,ValueError,TypeError):continue
        if msg_date < issued-timedelta(minutes=1) or msg_date>now_utc()+timedelta(minutes=1):continue
        matched.add(mid)
    return matched


def gmail_confirm_challenge(db,challenge):
    sender,receiver=PURPOSES[challenge.purpose]
    sent=matching_mails(mailbox_token(db,sender),'sent',sender,receiver,
                        challenge.subject,aware(challenge.created_at))
    if not sent:return False
    incoming=matching_mails(mailbox_token(db,receiver),'inbox',sender,receiver,
                            challenge.subject,aware(challenge.created_at))
    return bool(sent & incoming)


def register_auth(current_user):
    @router.get('/status')
    def status(db:Session=Depends(get_db),user:User=Depends(current_user),authorization:str|None=Header(default=None)):
        require_owner(db,user)
        f=session_fingerprint(db,user,authorization)
        g=db.scalar(select(SecurityGrant).where(SecurityGrant.user_id==user.id,
                    SecurityGrant.session_hash==f,SecurityGrant.revoked_at.is_(None),
                    SecurityGrant.expires_at>now_utc()).order_by(SecurityGrant.expires_at.desc()))
        mailboxes=[x.email for x in db.scalars(select(SecurityMailbox)).all()]
        return {'connected':{e:e in mailboxes for e in (START_MAIL,TARGET_MAIL)},
                'active':bool(g),'expires_at':g.expires_at.isoformat() if g else None,
                'configured':configured()}

    @router.post('/google/start')
    def oauth_start(payload:ConnectRequest,db:Session=Depends(get_db),user:User=Depends(current_user),authorization:str|None=Header(default=None)):
        require_owner(db,user)
        f=session_fingerprint(db,user,authorization)
        if payload.mailbox not in (START_MAIL,TARGET_MAIL):raise HTTPException(422,'Desteklenmeyen Workspace hesabı')
        if not configured():raise HTTPException(503,'Railway SECURITY_* yapılandırması eksik')
        state=secrets.token_urlsafe(36)
        verifier=secrets.token_urlsafe(64)
        challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
        db.add(SecurityOAuthState(state_hash=hval(state),mailbox=payload.mailbox,user_id=user.id,
                                 session_hash=f,pkce_verifier=verifier,expires_at=now_utc()+timedelta(minutes=10)))
        event(db,user,'google_oauth_started',payload.mailbox)
        db.commit()
        args={'client_id':settings.security_google_client_id,'redirect_uri':settings.security_google_redirect_uri,
              'response_type':'code','scope':SCOPES,'state':state,'access_type':'offline',
              'prompt':'consent select_account','login_hint':payload.mailbox,
              'code_challenge':challenge,'code_challenge_method':'S256'}
        return {'url':AUTH_URL+'?'+urlencode(args)}

    @router.get('/google/callback',response_class=HTMLResponse)
    def oauth_callback(state:str='',code:str='',error:str='',db:Session=Depends(get_db)):
        if not state or not code or error:
            raise HTTPException(400,'Google yetkilendirmesi tamamlanmadı')
        row=db.scalar(select(SecurityOAuthState).where(SecurityOAuthState.state_hash==hval(state)).with_for_update())
        if not row or aware(row.expires_at)<=now_utc():raise HTTPException(400,'OAuth talebi geçersiz veya süresi dolmuş')
        mailbox=row.mailbox
        owner=db.get(User,row.user_id)
        if not owner:raise HTTPException(403,'Hesap bulunamadı')
        require_owner(db,owner)
        s=db.get(UserSession,row.session_hash)
        if not s or s.user_id!=owner.id or aware(s.expires_at)<=now_utc():
            raise HTTPException(403,'Yetkilendirmeyi başlatan oturum kapatıldı')
        verifier=row.pkce_verifier
        db.delete(row)
        db.flush()
        try:
            t=requests.post(TOKEN_URL,data={'code':code,'client_id':settings.security_google_client_id,
              'client_secret':settings.security_google_client_secret,
              'redirect_uri':settings.security_google_redirect_uri,'code_verifier':verifier,
              'grant_type':'authorization_code'},timeout=12)
            t.raise_for_status();tok=t.json()
            granted=set(tok.get('scope','').split())
            if not set(SCOPES.split()).issubset(granted):
                raise HTTPException(403,'Gerekli Gmail izinleri verilmedi')
            refresh=tok.get('refresh_token')
            if not refresh:raise HTTPException(400,'Google yenileme anahtarı vermedi; tekrar onaylayın')
            p=requests.get(GMAIL_URL+'/profile',headers={'Authorization':'Bearer '+tok['access_token']},timeout=12)
            p.raise_for_status();actual=p.json().get('emailAddress','').lower()
            if actual!=mailbox:raise HTTPException(403,'Yanlış Workspace hesabı seçildi')
            row2=db.get(SecurityMailbox,mailbox)
            if not row2:
                row2=SecurityMailbox(email=mailbox,encrypted_refresh_token='',connected_at=now_utc());db.add(row2)
            row2.encrypted_refresh_token=cipher().encrypt(refresh.encode()).decode()
            row2.connected_at=now_utc()
            event(db,owner,'mailbox_connected',mailbox)
            db.commit()
        except requests.RequestException as exc:
            db.rollback()
            raise HTTPException(503,'Google yetkilendirme sunucusu yanıt vermedi') from exc
        return HTMLResponse('<!doctype html><html lang="tr"><meta charset="utf-8"><title>LidyaChat</title>'
          '<body style="font-family:sans-serif;padding:3rem"><h2>Workspace hesabı bağlandı.</h2>'
          '<p>Bu sekmeyi kapatıp LidyaChat Güvenlik Merkezine dönebilirsiniz.</p></body></html>')

    @router.post('/challenges')
    def start_challenge(payload:ChallengeRequest,db:Session=Depends(get_db),user:User=Depends(current_user),authorization:str|None=Header(default=None)):
        require_owner(db,user);fp=session_fingerprint(db,user,authorization)
        if payload.purpose not in PURPOSES:raise HTTPException(422,'İşlem türü geçersiz')
        if payload.purpose=='archive':
            access_grant(db,user,authorization)
            ev=db.get(SecurityEvent,payload.event_id) if payload.event_id else None
            if not ev or ev.actor_id!=user.id:raise HTTPException(404,'İşlem kaydı bulunamadı')
        elif payload.event_id is not None:raise HTTPException(422,'Bu işlem için kayıt ID kullanılamaz')
        for mailbox in PURPOSES[payload.purpose]:
            if not db.get(SecurityMailbox,mailbox):raise HTTPException(503,mailbox+' önce bağlanmalı')
        recent=db.scalar(select(SecurityChallenge).where(SecurityChallenge.user_id==user.id,
                          SecurityChallenge.purpose==payload.purpose).order_by(SecurityChallenge.created_at.desc()))
        if recent and aware(recent.created_at)>now_utc()-timedelta(seconds=60):
            raise HTTPException(429,'Yeni doğrulama için 60 saniye bekleyin')
        ident=uuid.uuid4().hex
        code=''.join(str(secrets.randbelow(10)) for _ in range(8))
        subject='LidyaChat Security '+payload.purpose.upper()+' '+code+' '+ident[:10]
        challenge=SecurityChallenge(id=ident,user_id=user.id,session_hash=fp,purpose=payload.purpose,
                     subject=subject,target_event_id=payload.event_id,created_at=now_utc(),
                     expires_at=now_utc()+timedelta(minutes=10),attempts=0)
        db.add(challenge);event(db,user,'verification_requested',payload.purpose);db.commit()
        sender,receiver=PURPOSES[payload.purpose]
        return {'challenge_id':ident,'sender':sender,'receiver':receiver,'subject':subject,
                'expires_at':challenge.expires_at.isoformat(),
                'instruction':'Belirtilen hesabın Gmail Gönderilenler bölümünden alıcıya bu konu başlığıyla e-posta gönderin.'}

    @router.post('/challenges/verify')
    def verify_challenge(payload:ChallengeVerify,db:Session=Depends(get_db),user:User=Depends(current_user),authorization:str|None=Header(default=None)):
        require_owner(db,user);fp=session_fingerprint(db,user,authorization)
        ch=db.scalar(select(SecurityChallenge).where(SecurityChallenge.id==payload.challenge_id).with_for_update())
        if not ch or ch.user_id!=user.id or ch.session_hash!=fp:raise HTTPException(404,'Doğrulama isteği bulunamadı')
        if ch.consumed_at or aware(ch.expires_at)<=now_utc():raise HTTPException(410,'Doğrulama süresi doldu veya kullanıldı')
        if ch.attempts>=5:raise HTTPException(429,'Doğrulama deneme sınırı doldu')
        if ch.checked_at and aware(ch.checked_at)>now_utc()-timedelta(seconds=10):
            raise HTTPException(429,'Yeniden denemeden önce 10 saniye bekleyin')
        ch.attempts+=1;ch.checked_at=now_utc();db.commit()
        if not gmail_confirm_challenge(db,ch):
            event(db,user,'verification_pending',ch.purpose)
            db.commit()
            raise HTTPException(409,'E-posta iki posta kutusunda henüz doğrulanamadı')
        ch=db.scalar(select(SecurityChallenge).where(SecurityChallenge.id==payload.challenge_id).with_for_update())
        if not ch or ch.consumed_at or aware(ch.expires_at)<=now_utc():
            raise HTTPException(410,'Doğrulama artık geçersiz')
        ch.consumed_at=now_utc()
        if ch.purpose=='access':
            db.add(SecurityGrant(id=uuid.uuid4().hex,user_id=user.id,session_hash=fp,
                         expires_at=now_utc()+timedelta(minutes=30)))
            event(db,user,'access_granted',details='30 minutes')
            db.commit();return {'verified':True,'active':True,'minutes':30}
        access_grant(db,user,authorization)
        ev=db.get(SecurityEvent,ch.target_event_id)
        if not ev or ev.actor_id!=user.id:raise HTTPException(404,'Kayıt artık bulunamadı')
        existing=db.scalar(select(SecurityEventVisibility).where(SecurityEventVisibility.event_id==ev.id,
                                 SecurityEventVisibility.actor_id==user.id))
        if not existing:
            db.add(SecurityEventVisibility(actor_id=user.id,event_id=ev.id,hidden_at=now_utc()))
        event(db,user,'audit_view_archived',str(ev.id),'Audit preserved; hidden in personal view')
        db.commit();return {'verified':True,'archived':ev.id,'permanent_delete':False}

    @router.post('/revoke')
    def revoke(db:Session=Depends(get_db),user:User=Depends(current_user),authorization:str|None=Header(default=None)):
        access_grant(db,user,authorization)
        fp=session_fingerprint(db,user,authorization)
        for grant in db.scalars(select(SecurityGrant).where(SecurityGrant.user_id==user.id,
                            SecurityGrant.session_hash==fp,SecurityGrant.revoked_at.is_(None))):
            grant.revoked_at=now_utc()
        event(db,user,'access_revoked');db.commit()
        return {'active':False}

    @router.post('/cases')
    def create_case(payload:CaseCreate,db:Session=Depends(get_db),user:User=Depends(current_user),authorization:str|None=Header(default=None)):
        access_grant(db,user,authorization)
        report=db.get(Report,payload.report_id)
        if not report or not report.target_user_id:raise HTTPException(404,'Hedef kullanıcı içeren şikâyet bulunamadı')
        case=SecurityCase(id=uuid.uuid4().hex,owner_id=user.id,report_id=report.id,
                  target_user_id=report.target_user_id,reason=payload.reason.strip(),status='open',created_at=now_utc())
        db.add(case);event(db,user,'case_opened',case.id,'report='+str(report.id));db.commit()
        return {'id':case.id,'report_id':report.id,'status':case.status,'target_user_id':case.target_user_id}

    @router.get('/cases')
    def list_cases(db:Session=Depends(get_db),user:User=Depends(current_user),authorization:str|None=Header(default=None)):
        access_grant(db,user,authorization)
        cases=db.scalars(select(SecurityCase).where(SecurityCase.owner_id==user.id).order_by(SecurityCase.created_at.desc()).limit(60)).all()
        event(db,user,'case_list_view');db.commit()
        return {'items':[{'id':c.id,'report_id':c.report_id,'target_user_id':c.target_user_id,
                          'reason':c.reason,'status':c.status,'created_at':c.created_at.isoformat()} for c in cases]}

    @router.get('/cases/{case_id}/evidence')
    def reported_evidence(case_id:str,db:Session=Depends(get_db),user:User=Depends(current_user),authorization:str|None=Header(default=None)):
        access_grant(db,user,authorization)
        case=db.get(SecurityCase,case_id)
        if not case or case.owner_id!=user.id or case.status!='open':raise HTTPException(404,'Aktif soruşturma bulunamadı')
        report=db.get(Report,case.report_id)
        if not report or report.target_user_id!=case.target_user_id:
            raise HTTPException(404,'Şikâyet artık erişilebilir değil')
        msg=db.get(Message,report.message_id) if report.message_id else None
        if msg and msg.expires_at and aware(msg.expires_at)<=now_utc():msg=None
        # Only the specifically reported message can be shown: no global DM scans.
        evidence={'report_id':report.id,'category':report.category,'reason':report.reason,
                 'reported_at':report.created_at.isoformat(),
                 'message':({'id':msg.id,'sender_id':msg.sender_id,'text':msg.text,
                    'created_at':msg.created_at.isoformat()} if msg else None)}
        event(db,user,'case_evidence_view',case.id,'report='+str(report.id)+';message='+str(report.message_id or 'none'))
        db.commit();return evidence

    @router.post('/cases/{case_id}/close')
    def close_case(case_id:str,db:Session=Depends(get_db),user:User=Depends(current_user),authorization:str|None=Header(default=None)):
        access_grant(db,user,authorization)
        case=db.get(SecurityCase,case_id)
        if not case or case.owner_id!=user.id:raise HTTPException(404,'Soruşturma bulunamadı')
        case.status='closed';event(db,user,'case_closed',case.id);db.commit()
        return {'id':case.id,'status':'closed'}

    @router.get('/logs')
    def logs(include_archived:bool=False,limit:int=Query(default=60,ge=1,le=100),
             db:Session=Depends(get_db),user:User=Depends(current_user),authorization:str|None=Header(default=None)):
        access_grant(db,user,authorization)
        hidden=select(SecurityEventVisibility.event_id).where(SecurityEventVisibility.actor_id==user.id)
        q=select(SecurityEvent).where(SecurityEvent.actor_id==user.id)
        if not include_archived:q=q.where(SecurityEvent.id.not_in(hidden))
        items=db.scalars(q.order_by(SecurityEvent.id.desc()).limit(limit)).all()
        # Audit the query after gathering the current page to avoid self-refresh loops.
        event(db,user,'audit_list_view',details='with_archive' if include_archived else 'regular');db.commit()
        return {'items':[{'id':e.id,'kind':e.kind,'subject':e.subject,'details':e.details,
                          'created_at':e.created_at.isoformat()} for e in items]}

    return router
