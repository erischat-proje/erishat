"""Transactional LidyaChat nobility points engine."""

from sqlalchemy import select
from .models import User
from .nobility_models import (
    NobilityMembership,
    NobilityPointsLedger,
)
from .nobility_policy import enabled
from .nobility_event_lock import lock_event_key
from .nobility_models import NobilityRefundEvent
from .nobility_allocations import (
    create_point_lot,
    allocate_fifo,
)

MAX_POINTS = 9223372036854775807


def apply_points(
    db,
    user_id,
    amount,
    event_key,
    source,
):
    if not enabled():
        raise ValueError("Nobility disabled")

    if type(amount) is not int or amount == 0:
        raise ValueError("Invalid amount")

    if abs(amount) > MAX_POINTS:
        raise ValueError("Amount overflow")

    if not isinstance(event_key, str):
        raise ValueError("Invalid event key")

    if not event_key.strip() or len(event_key) > 160:
        raise ValueError("Invalid event key")

    if not isinstance(source, str):
        raise ValueError("Invalid source")

    if not source.strip() or len(source) > 48:
        raise ValueError("Invalid source")

    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("PostgreSQL required")

    with db.begin_nested():
        user = db.scalar(
            select(User.id)
            .where(User.id == user_id)
            .with_for_update()
        )

        if user is None:
            raise ValueError("User not found")

        lock_event_key(db, event_key)

        refund_conflict = db.scalar(
            select(NobilityRefundEvent)
            .where(
                NobilityRefundEvent.refund_key
                == event_key
            )
        )

        if refund_conflict is not None:
            raise ValueError("Event key conflict")

        previous = db.get(
            NobilityPointsLedger,
            event_key,
            populate_existing=True,
        )

        if previous is not None:
            if (
                previous.user_id != user_id
                or previous.amount != amount
                or previous.source != source
            ):
                raise ValueError("Event key conflict")

            return False

        member = db.scalar(
            select(NobilityMembership)
            .where(NobilityMembership.user_id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if member is None:
            member = NobilityMembership(
                user_id=user_id,
                rank=0,
                points=0,
            )
            db.add(member)

        balance = int(member.points or 0)
        new_balance = balance + amount

        if new_balance < 0:
            raise ValueError("Insufficient points")

        if new_balance > MAX_POINTS:
            raise ValueError("Points overflow")

        member.points = new_balance

        db.add(NobilityPointsLedger(
            event_key=event_key,
            user_id=user_id,
            amount=amount,
            source=source,
        ))

        db.flush()

        if amount > 0:
            create_point_lot(
                db, user_id, event_key, amount,
            )
        else:
            allocate_fifo(
                db, user_id, event_key, -amount,
            )

        db.flush()

    return True
