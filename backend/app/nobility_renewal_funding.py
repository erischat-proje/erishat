"""Nobility renewal funding provenance."""

from sqlalchemy import select, func

from .nobility_config import get_rank_rule
from .nobility_models import (
    NobilityMembershipFunding,
    NobilityRenewalFunding,
    NobilityPointsLedger,
    NobilityPointAllocation,
    NobilityPointLot,
)


def register_renewal(db, user_id, rank, event_key):
    rule = get_rank_rule(rank)

    funding = db.get(
        NobilityMembershipFunding,
        user_id,
        populate_existing=True,
    )

    if funding is None:
        raise ValueError("Membership funding missing")

    ledger = db.get(
        NobilityPointsLedger,
        event_key,
        populate_existing=True,
    )

    if (
        ledger is None
        or ledger.user_id != user_id
        or ledger.source != "rank_renewal"
        or ledger.amount != -rule.renewal_points
    ):
        raise ValueError("Invalid renewal funding")

    existing = db.get(
        NobilityRenewalFunding,
        event_key,
    )

    if existing is not None:
        if (
            existing.user_id != user_id
            or existing.rank != rank
            or existing.membership_event_key
            != funding.spend_event_key
            or existing.required_points
            != rule.renewal_points
        ):
            raise ValueError("Renewal funding conflict")

        return False

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

    if total != rule.renewal_points:
        raise ValueError("Incomplete renewal funding")

    db.add(NobilityRenewalFunding(
        spend_event_key=event_key,
        membership_event_key=funding.spend_event_key,
        user_id=user_id,
        rank=rank,
        required_points=rule.renewal_points,
        duration_days=rule.duration_days,
        revoked=False,
    ))

    db.flush()
    return True


def revoke_invalid_renewals(db, user_id, now):
    from datetime import timedelta
    from .nobility_models import NobilityMembership
    from .nobility_policy import utc

    funding = db.get(
        NobilityMembershipFunding,
        user_id,
        populate_existing=True,
    )

    if funding is None:
        return 0

    member = db.scalar(
        select(NobilityMembership)
        .where(NobilityMembership.user_id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if member is None:
        raise RuntimeError("Membership missing")

    renewals = db.scalars(
        select(NobilityRenewalFunding)
        .where(
            NobilityRenewalFunding.user_id == user_id,
            NobilityRenewalFunding.membership_event_key
            == funding.spend_event_key,
            NobilityRenewalFunding.revoked.is_(False),
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()

    removed_days = 0

    for renewal in renewals:
        valid_points = db.scalar(
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
                == renewal.spend_event_key,
                NobilityPointLot.user_id == user_id,
                NobilityPointLot.refunded.is_(False),
            )
        ) or 0

        if valid_points >= renewal.required_points:
            continue

        renewal.revoked = True
        renewal.revoked_at = now
        removed_days += renewal.duration_days

    if removed_days and member.expires_at is not None:
        member.expires_at = (
            utc(member.expires_at)
            - timedelta(days=removed_days)
        )

        if utc(member.expires_at) <= utc(now):
            member.rank = 0
            member.started_at = None
            member.expires_at = None

    db.flush()

    return removed_days
