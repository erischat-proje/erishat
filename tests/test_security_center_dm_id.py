"""Security owner case-scoped public ID DM inspection regression tests.
Run with PYTHONPATH=backend python -m pytest -q tests/test_security_center_dm_id.py
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app import security_center as s
from app.models import Conversation, User


def route(path, method):
    return next(r.endpoint for r in s.register_auth(lambda: None).routes
                if r.path == path and method in r.methods)


def user():
    return SimpleNamespace(id='admin_internal',public_id='0038121455')


def grant():
    return SimpleNamespace(expires_at=s.now_utc()+timedelta(minutes=30))


def case(status='open',session_hash='fingerprint',owner='admin_internal',target='target_internal'):
    return SimpleNamespace(id='case_id',owner_id=owner,target_user_id=target,
                           session_hash=session_hash,status=status,
                           expires_at=s.now_utc()+timedelta(minutes=30))


def test_input_is_public_id_not_postgres_integer_report_number():
    assert s.DMInspectionStart(public_id='5841228487',category='scam',
                               reason='Görüşmede bildirilen sahte ödeme talepleri').public_id=='5841228487'
    for invalid in ['12','58412a8487','5'*33]:
        with pytest.raises(ValidationError):
            s.DMInspectionStart(public_id=invalid,category='scam',reason='Olayla ilgili yetki gerektiren inceleme')
    with pytest.raises(ValidationError):
        s.CaseCreate(report_id=5841228487,reason='Rapor numarası olamayacak büyüklükte profil numarası')


def test_new_table_has_session_expiration_and_no_public_backdoor():
    assert s.SecurityDMInspection.__tablename__=='security_dm_inspections'
    for name in ('owner_id','session_hash','target_user_id','reason','expires_at','status'):
        assert name in s.SecurityDMInspection.__table__.columns
    assert s.DM_INSPECTION_CATEGORIES=={'threat','blackmail','scam','harassment','child_safety','other_safety'}


def test_investigation_start_requires_live_workspace_session():
    start=route('/v1/security/dm-inspections','POST')
    payload=s.DMInspectionStart(public_id='5841228487',category='threat',
                                reason='Kullanıcının ilettiği tehdit şikâyeti ve kanıtlar')
    db=Mock()
    with patch.object(s,'access_grant',side_effect=HTTPException(403,'Yetki gerekli')):
        with pytest.raises(HTTPException) as ex:
            start(payload,db=db,user=user(),authorization='Bearer token')
    assert ex.value.status_code==403 and not db.scalar.called


def test_case_creation_is_by_public_id_and_audits_without_dm_text():
    start=route('/v1/security/dm-inspections','POST')
    payload=s.DMInspectionStart(public_id='5841228487',category='scam',
                                reason='Ödeme dolandırıcılığı ve kullanıcı bildirimleri var')
    target=SimpleNamespace(id='target_internal',public_id='5841228487',nickname='Tester')
    db=Mock();db.scalar.side_effect=[target,0]
    with patch.object(s,'access_grant',return_value=grant()), \
         patch.object(s,'session_fingerprint',return_value='fingerprint'):
        result=start(payload,db=db,user=user(),authorization='Bearer token')
    assert result['target_public_id']=='5841228487'
    added=[c.args[0] for c in db.add.call_args_list]
    assert any(isinstance(item,s.SecurityDMInspection) and item.target_user_id=='target_internal'
               and item.session_hash=='fingerprint' for item in added)
    assert any(isinstance(item,s.SecurityEvent) and item.kind=='dm_investigation_opened' for item in added)
    assert db.commit.called


def test_case_cannot_be_opened_from_other_login_or_after_expiration():
    db=Mock();db.get.return_value=case(session_hash='other_session')
    with patch.object(s,'access_grant',return_value=grant()), \
         patch.object(s,'session_fingerprint',return_value='fingerprint'):
        with pytest.raises(HTTPException) as ex:
            s.authorize_dm_inspection(db,user(),'Bearer token','case_id')
    assert ex.value.status_code==404
    db.get.return_value=case(status='closed')
    with patch.object(s,'access_grant',return_value=grant()), \
         patch.object(s,'session_fingerprint',return_value='fingerprint'):
        with pytest.raises(HTTPException):
            s.authorize_dm_inspection(db,user(),'Bearer token','case_id')
    db.get.return_value=case()
    with patch.object(s,'access_grant',side_effect=HTTPException(403,'Oturum süresi doldu')):
        with pytest.raises(HTTPException) as ex:
            s.authorize_dm_inspection(db,user(),'Bearer token','case_id')
    assert ex.value.status_code==403


def test_unrelated_conversation_or_group_cannot_be_read():
    read=route('/v1/security/dm-inspections/{inspection_id}/conversations/{conversation_id}/messages','GET')
    db=Mock();db.get.return_value=SimpleNamespace(id='dm',type='group')
    with patch.object(s,'authorize_dm_inspection',return_value=case()):
        with pytest.raises(HTTPException) as ex:
            read('case_id','dm',db=db,user=user(),authorization='Bearer token',before_id=None,limit=50)
    assert ex.value.status_code==404
    db.get.return_value=SimpleNamespace(id='dm',type='dm')
    db.scalars.return_value.all.return_value=['other1','other2']
    with patch.object(s,'authorize_dm_inspection',return_value=case()):
        with pytest.raises(HTTPException) as ex:
            read('case_id','dm',db=db,user=user(),authorization='Bearer token',before_id=None,limit=50)
    assert ex.value.status_code==404


def test_message_page_displays_both_participants_and_audits_each_read():
    read=route('/v1/security/dm-inspections/{inspection_id}/conversations/{conversation_id}/messages','GET')
    db=Mock()
    target=SimpleNamespace(id='target_internal',public_id='5841228487',nickname='Target')
    peer=SimpleNamespace(id='peer',public_id='0000001234',nickname='Peer')
    conv=SimpleNamespace(id='dm',type='dm')
    db.get.side_effect=lambda cls, key: ({(Conversation,'dm'):conv,(User,'target_internal'):target,(User,'peer'):peer}).get((cls,key))
    now=datetime.now(timezone.utc)
    rows=[SimpleNamespace(id=32,sender_id='target_internal',text='A',created_at=now),
          SimpleNamespace(id=31,sender_id='peer',text='B',created_at=now),
          SimpleNamespace(id=30,sender_id='peer',text='C',created_at=now)]
    db.scalars.side_effect=[Mock(**{'all.return_value':['target_internal','peer']}),
                            Mock(**{'all.return_value':rows})]
    with patch.object(s,'authorize_dm_inspection',return_value=case()):
        result=read('case_id','dm',db=db,user=user(),authorization='Bearer token',before_id=None,limit=2)
    assert [x['sender_public_id'] for x in result['items']]==['5841228487','0000001234']
    assert [x['text'] for x in result['items']]==['A','B']
    assert result['has_more'] and result['next_before_id']==31
    added=[c.args[0] for c in db.add.call_args_list]
    assert any(isinstance(v,s.SecurityEvent) and v.kind=='dm_messages_view' for v in added)
    assert all('A' not in (v.details or '') for v in added if isinstance(v,s.SecurityEvent))


def test_list_and_close_require_case_authorization():
    list_convs=route('/v1/security/dm-inspections/{inspection_id}/conversations','GET')
    close=route('/v1/security/dm-inspections/{inspection_id}/close','POST')
    with patch.object(s,'authorize_dm_inspection',side_effect=HTTPException(404,'not yours')):
        for call in [lambda:list_convs('x',db=Mock(),user=user(),authorization='Bearer token',offset=0,limit=25),
                     lambda:close('x',db=Mock(),user=user(),authorization='Bearer token')]:
            with pytest.raises(HTTPException) as e:call()
            assert e.value.status_code==404


# DM investigation media: only authenticated case-related retained media.
def test_investigation_media_denies_unrelated_conversation():
    from types import SimpleNamespace
    from unittest.mock import Mock, patch
    from fastapi import HTTPException
    from app import security_center as s
    endpoint=route('/v1/security/dm-inspections/{inspection_id}/conversations/{conversation_id}/messages/{message_id}/media','GET')
    db=Mock()
    db.get.return_value=SimpleNamespace(id='other',type='group')
    with patch.object(s,'authorize_dm_inspection',return_value=case()):
        with pytest.raises(HTTPException) as err:
            endpoint('case_id','other',12,db=db,user=user(),authorization='Bearer token')
    assert err.value.status_code==404


def test_investigation_media_does_not_open_temporary_media():
    from types import SimpleNamespace
    from unittest.mock import Mock, patch
    from fastapi import HTTPException
    from app import security_center as s
    from app.models import Conversation,Message
    from app.platform_models import MessageMedia
    endpoint=route('/v1/security/dm-inspections/{inspection_id}/conversations/{conversation_id}/messages/{message_id}/media','GET')
    db=Mock()
    message=SimpleNamespace(id=12,conversation_id='dm',sender_id='target_internal',expires_at=None)
    temporary=SimpleNamespace(temporary=True,media_type='image',mime_type='image/jpeg',data=b'jpg',expires_at=None)
    db.get.side_effect=lambda cls,key: {(Conversation,'dm'):SimpleNamespace(type='dm'),(Message,12):message,(MessageMedia,12):temporary}.get((cls,key))
    db.scalars.return_value.all.return_value=['target_internal','peer']
    with patch.object(s,'authorize_dm_inspection',return_value=case()):
        with pytest.raises(HTTPException) as err:
            endpoint('case_id','dm',12,db=db,user=user(),authorization='Bearer token')
    assert err.value.status_code==404


def test_investigation_media_is_noncacheable_and_audited():
    from types import SimpleNamespace
    from unittest.mock import Mock, patch
    from app import security_center as s
    from app.models import Conversation,Message
    from app.platform_models import MessageMedia
    endpoint=route('/v1/security/dm-inspections/{inspection_id}/conversations/{conversation_id}/messages/{message_id}/media','GET')
    db=Mock()
    message=SimpleNamespace(id=12,conversation_id='dm',sender_id='target_internal',expires_at=None)
    media=SimpleNamespace(temporary=False,media_type='voice',mime_type='audio/ogg',data=b'OggS123',expires_at=None)
    db.get.side_effect=lambda cls,key: {(Conversation,'dm'):SimpleNamespace(type='dm'),(Message,12):message,(MessageMedia,12):media}.get((cls,key))
    db.scalars.return_value.all.return_value=['target_internal','peer']
    with patch.object(s,'authorize_dm_inspection',return_value=case()):
        out=endpoint('case_id','dm',12,db=db,user=user(),authorization='Bearer token')
    assert out.body==b'OggS123'
    assert out.headers['cache-control']=='private, no-store, max-age=0'
    assert any(isinstance(x.args[0],s.SecurityEvent) and x.args[0].kind=='dm_media_view' for x in db.add.call_args_list)
