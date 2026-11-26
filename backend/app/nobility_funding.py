"""Active nobility membership funding provenance."""

from sqlalchemy import select, func

from .nobility_models import (
    NobilityMembershipFunding,
    NobilityPointsLedger,
    NobilityPointAllocation,
    NobilityPointLot,
)


def set_membership_funding(db, user_id, event_key):
    ledger = db.get(NobilityPointsLedger, event_key)

    if (
        ledger is None
        or ledger.user_id != user_id
        or ledger.amount >= 0
        or ledger.source not in (
            "rank_activation",
            "rank_upgrade",
        )
    ):
        raise ValueError("Invalid membership funding")

    total = db.scalar(
        select(func.sum(
            NobilityPointAllocation.amount
            - NobilityPointAllocation.revoked_points
        ))
        .join(
            NobilityPointLot,
            NobilityPointLot.event_key
            == NobilityPointAllocation.lot_event_key,
        )
        .where(
            NobilityPointAllocation.spend_event_key
            == event_key,
            NobilityPointLot.user_id == user_id,
            NobilityPointLot.refunded.is_(False),
        )
    ) or 0

    if total != -ledger.amount:
        raise ValueError("Incomplete membership funding")

    funding = db.get(
        NobilityMembershipFunding,
        user_id,
        populate_existing=True,
    )

    if funding is None:
        funding = NobilityMembershipFunding(
            user_id=user_id,
            spend_event_key=event_key,
        )
        db.add(funding)
    else:
        funding.spend_event_key = event_key

    db.flush()


def valid_membership_points(db, user_id):
    funding = db.get(
        NobilityMembershipFunding,
        user_id,
        populate_existing=True,
    )

    if funding is None:
        raise ValueError("Membership funding missing")

    total = db.scalar(
        select(func.sum(
            NobilityPointAllocation.amount
            - NobilityPointAllocation.revoked_points
        ))
        .join(
            NobilityPointLot,
            NobilityPointLot.event_key
            == NobilityPointAllocation.lot_event_key,
        )
        .where(
            NobilityPointAllocation.spend_event_key
            == funding.spend_event_key,
            NobilityPointLot.user_id == user_id,
            NobilityPointLot.refunded.is_(False),
        )
    )

    return int(total or 0)
