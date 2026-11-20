"""V25 offline configuration validator. It never enables checkout or accesses secrets.

This module is not registered in the production app. Passing these checks does
not constitute QNBpay merchant approval, verified payment, or go-live permission.
"""
from __future__ import annotations
from dataclasses import asdict, dataclass
from typing import Mapping

_ALLOWED_ENV = {'sandbox', 'production'}
_CREDENTIAL_KEYS = frozenset({'QNBPAY_MERCHANT_ID', 'QNBPAY_API_KEY', 'QNBPAY_API_SECRET'})

@dataclass(frozen=True)
class GuardReport:
    provider: str = 'QNBpay'
    guard_version: int = 25
    sandbox_configured: bool = False
    production_configured: bool = False
    merchant_approved: bool = False
    provider_callback_verified: bool = False
    provider_capture_verified: bool = False
    payment_enabled: bool = False
    coin_delivery_enabled: bool = False
    live_payment_ready: bool = False
    next_action: str = 'Await merchant approval and authenticated provider integration'


def validate_environment_config(config: Mapping[str, object]) -> dict:
    """Validate only safe metadata; never echo or inspect credential values.

    The current app does not use these setting keys to activate payments.
    Deliberately reject any flag trying to activate real payment/fulfillment.
    """
    if not isinstance(config, dict):
        raise ValueError('configuration must be a dictionary')
    if any(key in config for key in _CREDENTIAL_KEYS):
        raise ValueError('credentials must not be passed to this offline validator')
    environment = config.get('environment')
    if type(environment) is not str or environment not in _ALLOWED_ENV:
        raise ValueError('environment must be sandbox or production')
    if config.get('provider') != 'QNBpay':
        raise ValueError('unsupported provider')
    for flag in ('payment_enabled', 'coin_delivery_enabled', 'callback_enabled',
                 'provider_verified', 'capture_verified'):
        if config.get(flag, False) is not False:
            raise ValueError('V25 forbids enabling payment or credit: '+flag)
    if type(config.get('currency')) is not str or config['currency'] != 'TRY':
        raise ValueError('currency must be TRY')
    if type(config.get('checkout_channel')) is not str or config['checkout_channel'] != 'web':
        raise ValueError('checkout channel must be web')
    return asdict(GuardReport(
        next_action=(
            'Await QNBpay sandbox credentials and provider docs' if environment == 'sandbox'
            else 'Production remains disabled; sandbox verification and merchant approval required'
        )
    ))


def readiness_snapshot() -> dict:
    """Hard-coded fail-closed: environment variables cannot unlock this helper."""
    return validate_environment_config({
        'environment':'production','provider':'QNBpay','currency':'TRY',
        'checkout_channel':'web', 'payment_enabled': False,
        'coin_delivery_enabled':False, 'callback_enabled':False,
    })
