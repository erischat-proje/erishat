"""LidyaChat nobility point provenance and FIFO allocation."""

from sqlalchemy import select

from .nobility_models import (
    NobilityPointLot,
    NobilityPointAllocation,
    NobilityPointsLedger,
)


def create_point_lot(db, user_id, event_key, amount):
    if type(amount) is not int or amount <= 0:
        raise ValueError("Invalid lot amount")

    ledger = db.get(NobilityPointsLedger, event_key)

    if (
        ledger is None
        or ledger.user_id != user_id
        or ledger.amount != amount
    ):
        raise ValueError("Invalid credit ledger")

    existing = db.get(NobilityPointLot, event_key)

    if existing is not None:
        if (
            existing.user_id != user_id
            or existing.original_points != amount
        ):
            raise ValueError("Point lot conflict")

        return False

    db.add(NobilityPointLot(
        event_key=event_key,
        user_id=user_id,
        original_points=amount,
        remaining_points=amount,
        refunded=False,
    ))

    db.flush()
    return True


def allocate_fifo(db, user_id, event_key, amount):
    if type(amount) is not int or amount <= 0:
        raise ValueError("Invalid allocation amount")

    ledger = db.get(NobilityPointsLedger, event_key)

    if (
        ledger is None
        or ledger.user_id != user_id
        or ledger.amount != -amount
    ):
        raise ValueError("Invalid debit ledger")

    existing = db.scalars(
        select(NobilityPointAllocation)
        .where(
            NobilityPointAllocation.spend_event_key
            == event_key
        )
    ).all()

    if existing:
        if sum(row.amount for row in existing) != amount:
            raise ValueError("Allocation conflict")

        return False

    lots = db.scalars(
        select(NobilityPointLot)
        .where(
            NobilityPointLot.user_id == user_id,
            NobilityPointLot.refunded.is_(False),
            NobilityPointLot.remaining_points > 0,
        )
        .order_by(
            NobilityPointLot.created_at.asc(),
            NobilityPointLot.event_key.asc(),
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()

    available = sum(
        lot.remaining_points for lot in lots
    )

    if available < amount:
        raise ValueError("Insufficient tracked points")

    remaining = amount

    for lot in lots:
        if remaining == 0:
            break

        used = min(lot.remaining_points, remaining)

        lot.remaining_points -= used
        remaining -= used

        db.add(NobilityPointAllocation(
            lot_event_key=lot.event_key,
            spend_event_key=event_key,
            amount=used,
        ))

    if remaining != 0:
        raise RuntimeError("Incomplete allocation")

    db.flush()
    return True
