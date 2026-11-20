import unittest
from app.qnbpay_v25_config_guard import validate_environment_config,readiness_snapshot

class QnbpayV25GuardTests(unittest.TestCase):
    def config(self,**changes):
        val=dict(environment='sandbox',provider='QNBpay',currency='TRY',checkout_channel='web')
        val.update(changes)
        return val
    def test_valid_sandbox_blocked(self):
        self.assertFalse(validate_environment_config(self.config())['live_payment_ready'])
    def test_valid_production_blocked(self):
        self.assertFalse(validate_environment_config(self.config(environment='production'))['payment_enabled'])
    def test_wallet_off(self):
        self.assertFalse(validate_environment_config(self.config())['coin_delivery_enabled'])
    def test_not_provider_verified(self):
        self.assertFalse(validate_environment_config(self.config())['provider_capture_verified'])
    def test_offline_snapshot(self):
        self.assertFalse(readiness_snapshot()['live_payment_ready'])
    def test_invalid_environments(self):
        for env in ('dev','live','Production','',None,0,True):
            with self.subTest(env=env),self.assertRaises(ValueError):
                validate_environment_config(self.config(environment=env))
    def test_wrong_provider(self):
        with self.assertRaises(ValueError):
            validate_environment_config(self.config(provider='Other'))
    def test_wrong_currency(self):
        for currency in ('USD','try','',None):
            with self.subTest(currency=currency),self.assertRaises(ValueError):
                validate_environment_config(self.config(currency=currency))
    def test_wrong_channel(self):
        for channel in ('android','google_play',None):
            with self.subTest(channel=channel),self.assertRaises(ValueError):
                validate_environment_config(self.config(checkout_channel=channel))
    def test_live_payment_denied(self):
        with self.assertRaises(ValueError):
            validate_environment_config(self.config(payment_enabled=True))
    def test_coin_delivery_denied(self):
        with self.assertRaises(ValueError):
            validate_environment_config(self.config(coin_delivery_enabled=True))
    def test_callback_denied(self):
        with self.assertRaises(ValueError):
            validate_environment_config(self.config(callback_enabled=True))
    def test_provider_verified_denied(self):
        with self.assertRaises(ValueError):
            validate_environment_config(self.config(provider_verified=True))
    def test_capture_denied(self):
        with self.assertRaises(ValueError):
            validate_environment_config(self.config(capture_verified=True))
    def test_reject_creds(self):
        for k in ('QNBPAY_MERCHANT_ID','QNBPAY_API_KEY','QNBPAY_API_SECRET'):
            with self.subTest(k=k),self.assertRaises(ValueError):
                validate_environment_config(self.config(**{k:'REDACTED'}))
    def test_no_secrets_in_output(self):
        self.assertFalse(any('secret' in key or 'api_key' in key for key in readiness_snapshot()))
    def test_wrong_types(self):
        for value in (None,[],False,'sandbox'):
            with self.subTest(value=value),self.assertRaises(ValueError):
                validate_environment_config(value)
    def test_no_pseudo_approval(self):
        self.assertFalse(readiness_snapshot()['merchant_approved'])
