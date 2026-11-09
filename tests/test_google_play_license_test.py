"""Google Play license-test mode guard regression tests."""
import importlib
from types import SimpleNamespace
import pytest
from fastapi import HTTPException

play = importlib.import_module('app.play_billing')


def test_test_mode_closed_without_allowlist(monkeypatch):
    for key, value in {'google_play_test_mode': True, 'google_play_billing_enabled': True,
                       'google_play_fulfillment_enabled': True,
                       'google_play_policy_approved': False,
                       'google_play_service_account_json': '{"type":"service_account"}',
                       'google_play_test_user_emails': '',
                       'google_play_test_user_public_ids': ''}.items():
        monkeypatch.setattr(play.settings, key, value)
    assert play._checkout_ready() is False


def test_whitelisted_user_and_no_commercial_override(monkeypatch):
    monkeypatch.setattr(play.settings, 'google_play_test_mode', True)
    monkeypatch.setattr(play.settings, 'google_play_test_user_emails', 'kemalturkmen729@gmail.com')
    monkeypatch.setattr(play.settings, 'google_play_test_user_public_ids', '')
    good = SimpleNamespace(is_active=True, google_sub='verified-google-sub',
                           google_email='KemalTurkmen729@gmail.com', public_id='100')
    other = SimpleNamespace(is_active=True, google_sub='verified-google-sub',
                            google_email='unlisted@example.com', public_id='200')
    spoof = SimpleNamespace(is_active=True, google_sub=None,
                            google_email='kemalturkmen729@gmail.com', public_id='300')
    assert play._checkout_authorized(good)
    assert not play._checkout_authorized(other)
    assert not play._checkout_authorized(spoof)
    assert not play._checkout_authorized(SimpleNamespace(is_active=False,google_sub='x',google_email='kemalturkmen729@gmail.com',public_id='0'))


def test_public_id_allowlist(monkeypatch):
    monkeypatch.setattr(play.settings, 'google_play_test_mode', True)
    monkeypatch.setattr(play.settings, 'google_play_test_user_emails', '')
    monkeypatch.setattr(play.settings, 'google_play_test_user_public_ids', '12345')
    assert play._checkout_authorized(SimpleNamespace(is_active=True,public_id='12345'))
    assert not play._checkout_authorized(SimpleNamespace(is_active=True,public_id='12346'))


def test_only_play_test_receipt(monkeypatch):
    monkeypatch.setattr(play.settings, 'google_play_test_mode', True)
    with pytest.raises(HTTPException) as e:
        play._require_test_receipt({'test_purchase': False})
    assert e.value.status_code == 422
    play._require_test_receipt({'test_purchase': True})


def test_commercial_still_requires_policy(monkeypatch):
    monkeypatch.setattr(play.settings, 'google_play_test_mode', False)
    monkeypatch.setattr(play.settings, 'google_play_billing_enabled', True)
    monkeypatch.setattr(play.settings, 'google_play_fulfillment_enabled', True)
    monkeypatch.setattr(play.settings, 'google_play_service_account_json', '{"type":"service_account"}')
    monkeypatch.setattr(play.settings, 'google_play_policy_approved', False)
    assert play._checkout_ready() is False
