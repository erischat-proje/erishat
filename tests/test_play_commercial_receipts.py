"""Regression: test purchases must never credit wallets in commercial mode."""
import pytest
from fastapi import HTTPException
from app import play_billing


def test_commercial_rejects_license_test_receipt(monkeypatch):
    monkeypatch.setattr(play_billing.settings, 'google_play_test_mode', False)
    with pytest.raises(HTTPException) as exc:
        play_billing._require_test_receipt({'test_purchase': True})
    assert exc.value.status_code == 422


def test_commercial_accepts_real_receipt(monkeypatch):
    monkeypatch.setattr(play_billing.settings, 'google_play_test_mode', False)
    assert play_billing._require_test_receipt({'test_purchase': False}) is None


def test_test_mode_rejects_real_receipt(monkeypatch):
    monkeypatch.setattr(play_billing.settings, 'google_play_test_mode', True)
    with pytest.raises(HTTPException) as exc:
        play_billing._require_test_receipt({'test_purchase': False})
    assert exc.value.status_code == 422


def test_test_mode_accepts_test_receipt(monkeypatch):
    monkeypatch.setattr(play_billing.settings, 'google_play_test_mode', True)
    assert play_billing._require_test_receipt({'test_purchase': True}) is None
