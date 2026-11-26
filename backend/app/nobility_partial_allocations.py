"""Partial nobility refund allocation engine."""

from sqlalchemy import select

from .nobility_models import (
    NobilityPointLot,
    NobilityPointAllocation,
)


def distribute_refund(db, user_id, lot_event_key, amount):
    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("PostgreSQL required")

    if type(amount) is not int or amount <= 0:
        raise ValueError("Invalid refund amount")

    lot = db.scalar(
        select(NobilityPointLot)
        .where(
            NobilityPointLot.event_key == lot_event_key,
            NobilityPointLot.user_id == user_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if lot is None:
        raise ValueError("Point source not found")

    if lot.refunded:
        raise ValueError("Point source fully refunded")

    available = lot.original_points - lot.refunded_points

    if amount > available:
        raise ValueError("Refund exceeds available points")

    allocations = db.scalars(
        select(NobilityPointAllocation)
        .where(
            NobilityPointAllocation.lot_event_key
            == lot_event_key
        )
        .order_by(
            NobilityPointAllocation.created_at.desc(),
            NobilityPointAllocation.spend_event_key.desc(),
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()

    valid_spent = sum(
        row.amount - row.revoked_points
        for row in allocations
    )

    if lot.remaining_points + valid_spent != available:
        raise RuntimeError("Point source balance mismatch")

    removed_balance = min(lot.remaining_points, amount)
    remaining = amount - removed_balance

    revoked = []

    for row in allocations:
        if remaining == 0:
            break

        valid = row.amount - row.revoked_points
        removed = min(valid, remaining)

        if removed == 0:
            continue

        row.revoked_points += removed
        remaining -= removed

        revoked.append({
            "spend_event_key": row.spend_event_key,
            "removed_points": removed,
        })

    if remaining != 0:
        raise RuntimeError("Incomplete refund allocation")

    lot.remaining_points -= removed_balance
    lot.refunded_points += amount

    lot.refunded = (
        lot.refunded_points == lot.original_points
    )

    db.flush()

    return {
        "refunded_points": amount,
        "removed_balance": removed_balance,
        "removed_spent": amount - removed_balance,
        "total_refunded": lot.refunded_points,
        "fully_refunded": lot.refunded,
        "revoked_allocations": revoked,
    }
