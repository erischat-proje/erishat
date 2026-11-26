"""Google Play verified full-refund nobility adapter."""

from sqlalchemy import select

from .models import User
from .nobility_models import (
    NobilityPointLot,
    NobilityPointsLedger,
)
from .nobility_refunds import refund_points


def refund_play_nobility(db, receipt):
    """Caller must hold the purchase receipt row lock.

    The caller owns the transaction and commit.
    Never change the user's Lidya wallet.
    """

    if receipt.test_purchase is not False:
        return False

    if receipt.purchase_status != "credited":
        return False

    fingerprint = receipt.token_sha256

    if (
        not isinstance(fingerprint, str)
        or len(fingerprint) != 64
        or any(c not in "0123456789abcdef" for c in fingerprint)
    ):
        raise ValueError("Invalid receipt fingerprint")

    lot_key = f"nobility:play:{fingerprint}"
    refund_key = f"nobility:play:refund:{fingerprint}"

    user = db.scalar(
        select(User.id)
        .where(User.id == receipt.user_id)
        .with_for_update()
    )

    if user is None:
        raise RuntimeError("Receipt user missing")

    ledger = db.get(
        NobilityPointsLedger,
        lot_key,
        populate_existing=True,
    )

    lot = db.get(
        NobilityPointLot,
        lot_key,
        populate_existing=True,
    )

    # Historical purchases may have no nobility credit.
    if ledger is None and lot is None:
        return False

    if ledger is None or lot is None:
        raise RuntimeError("Incomplete nobility funding")

    if (
        ledger.user_id != receipt.user_id
        or lot.user_id != receipt.user_id
        or ledger.source != "google_play_purchase"
        or ledger.amount <= 0
        or ledger.amount != lot.original_points
    ):
        raise RuntimeError("Nobility funding mismatch")

    # Refunds remain operational even when new credits
    # or nobility privileges are disabled.
    result = refund_points(
        db,
        receipt.user_id,
        lot_key,
        refund_key,
    )

    return result["applied"]
