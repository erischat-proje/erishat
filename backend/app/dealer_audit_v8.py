"""Read-only, DA-only dealer inventory reconciliation and review signals.

Flags are investigative indicators, not proof of abuse. No financial mutations.
"""
from datetime import datetime, timedelta, timezone
from sqlalchemy import func, select

# Review-only thresholds; no transfer is blocked by this module.
HOURLY_COUNT_REVIEW = 20
HOURLY_AMOUNT_REVIEW = 1_000_000


def reconcile(granted: int, transferred: int, stock: int) -> dict:
    expected = int(granted) - int(transferred)
    difference = int(stock) - expected
    return {"granted": int(granted), "transferred": int(transferred),
            "current_stock": int(stock), "expected_stock": expected,
            "difference": difference, "balanced": difference == 0}


def review_signals(reconciliation: dict, hourly_count: int, hourly_amount: int) -> list[str]:
    flags = []
    if not reconciliation["balanced"]:
        flags.append("STOCK_LEDGER_MISMATCH_REVIEW")
    if hourly_count >= HOURLY_COUNT_REVIEW:
        flags.append("HIGH_TRANSFER_FREQUENCY_REVIEW")
    if hourly_amount >= HOURLY_AMOUNT_REVIEW:
        flags.append("HIGH_HOURLY_TRANSFER_VOLUME_REVIEW")
    return flags


def audit_inventory(db, inventory, user, grant_model, transfer_model, now=None):
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=1)
    granted = db.scalar(select(func.coalesce(func.sum(grant_model.amount), 0)).where(
        grant_model.dealer_id == inventory.user_id))
    transferred = db.scalar(select(func.coalesce(func.sum(transfer_model.amount), 0)).where(
        transfer_model.dealer_id == inventory.user_id))
    hourly_count, hourly_amount = db.execute(select(
        func.count(transfer_model.id), func.coalesce(func.sum(transfer_model.amount), 0)
    ).where(transfer_model.dealer_id == inventory.user_id,
            transfer_model.created_at >= cutoff)).one()
    balances = reconcile(granted, transferred, inventory.stock)
    flags = review_signals(balances, int(hourly_count), int(hourly_amount))
    return {"public_id": user.public_id, "active": bool(inventory.active),
            **balances, "hourly_transfer_count": int(hourly_count),
            "hourly_transfer_amount": int(hourly_amount), "review_flags": flags,
            "status": "REVIEW" if flags else "OK"}
