"""V13: fail-closed QNBpay readiness contract; never contacts a PSP.

This module intentionally contains no checkout creation, callback, capture,
order update, or wallet mutation paths. Do not toggle it with an env flag.
"""
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class QnbpayReadiness:
    provider: str = "QNBpay"
    channel: str = "web"
    phase: str = "awaiting_merchant_integration"
    payment_enabled: bool = False
    order_creation_enabled: bool = False
    coin_delivery_enabled: bool = False
    supports_card_entry: bool = False
    reason: str = "QNBpay uye isyeri entegrasyonu ve sunucu tarafi odeme dogrulamasi henuz tamamlanmadi."


def readiness() -> dict:
    """Return only public operational state, never credentials or secrets."""
    return asdict(QnbpayReadiness())


def deny_payment_start() -> None:
    """Unconditionally refuse checkout; do not infer readiness from a key or env flag."""
    raise PaymentDisabledError("QNBpay payment initiation is not implemented")


def deny_unverified_fulfillment() -> None:
    """Coin delivery requires a future *server-verified*, idempotent ledger path."""
    raise PaymentDisabledError("Coin delivery is not implemented")


class PaymentDisabledError(RuntimeError):
    pass
