"""Run with pytest -q tests/test_security_center.py in backend-configured project."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from app import security_center as s


def test_owner_must_match_public_id_and_da(monkeypatch):
    monkeypatch.setattr(s.settings, 'security_owner_public_id', '0038121455')
    user = SimpleNamespace(id='user-internal', public_id='0038121455', is_active=True)
    db=Mock()
    db.get.return_value=SimpleNamespace(role='DA')
    s.require_owner(db,user)
    db.get.return_value=SimpleNamespace(role='UA')
    with pytest.raises(HTTPException) as e:s.require_owner(db,user)
    assert e.value.status_code==403
    user.public_id='9999999999'
    with pytest.raises(HTTPException):s.require_owner(db,user)


def test_single_session_binding_rejects_other_user(monkeypatch):
    db=Mock()
    db.get.return_value=SimpleNamespace(user_id='another',expires_at=s.now_utc()+timedelta(hours=1))
    with pytest.raises(HTTPException) as exc:
        s.session_fingerprint(db,SimpleNamespace(id='owner'),'Bearer sample-token')
    assert exc.value.status_code==401


def test_sent_message_must_match_expected_headers(monkeypatch):
    since=s.now_utc()-timedelta(minutes=1)
    item={'payload':{'headers':[
        {'name':'From','value':'Destek <destek@lidyachat.com>'},
        {'name':'To','value':'erischat@erischat.com'},
        {'name':'Subject','value':'LidyaChat Security ACCESS 12345678 abcdef0123'},
        {'name':'Message-ID','value':'<unique-message@lidyachat.com>'},
    ]},'internalDate':str(int(s.now_utc().timestamp()*1000))}
    def fake_get(token,path,params):
        if path=='/messages':return {'messages':[{'id':'xyz'}]}
        return item
    monkeypatch.setattr(s,'gmail_get',fake_get)
    subject='LidyaChat Security ACCESS 12345678 abcdef0123'
    match=s.matching_mails('token','sent','destek@lidyachat.com','erischat@erischat.com',subject,since)
    assert match=={'<unique-message@lidyachat.com>'}
    item['payload']['headers'][0]['value']='attacker@example.com'
    assert not s.matching_mails('token','sent','destek@lidyachat.com','erischat@erischat.com',subject,since)


def test_two_mailboxes_must_confirm_same_message(monkeypatch):
    ch=SimpleNamespace(purpose='access',subject='test',created_at=s.now_utc())
    monkeypatch.setattr(s,'mailbox_token',lambda db,email:'token:'+email)
    seen=[]
    def mails(token,label,sender,receiver,subject,issued):
        seen.append((token,label,sender,receiver))
        return {'<a@example>'} if label=='sent' else {'<b@example>'}
    monkeypatch.setattr(s,'matching_mails',mails)
    assert not s.gmail_confirm_challenge(None,ch)
    assert len(seen)==2 and seen[0][1]=='sent' and seen[1][1]=='inbox'
    monkeypatch.setattr(s,'matching_mails',lambda *args:{'<a@example>'})
    assert s.gmail_confirm_challenge(None,ch)


def test_archival_model_is_separate_from_audit_event():
    assert s.SecurityEvent.__tablename__=='security_events'
    assert s.SecurityEventVisibility.__tablename__=='security_event_visibility'
    assert 'encrypted_refresh_token' in s.SecurityMailbox.__table__.columns
    assert s.PURPOSES['access']==('destek@lidyachat.com','erischat@erischat.com')
    assert s.PURPOSES['archive']==('erischat@erischat.com','destek@lidyachat.com')
