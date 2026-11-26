"""Authenticated LidyaChat nobility API."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .nobility_models import (
    NobilityMembership,
    NobilityRankConfig,
    NobilityPointsLedger,
)
from .nobility_config import get_rank_rule
from .nobility_requests import (
    NobilityActionRequest,
    NobilityCancellationRequest,
)
from .nobility_cancellation import cancel_action
from .nobility_actions import (
    execute_action,
    membership_state,
)

from .nobility_policy import (
    RANK_NAMES,
    PRIVILEGES,
    enabled,
    active_rank,
    privileges_for_rank,
    utc,
)


from .runtime_tasks import database_task
from .nobility_banner_service import (
    prepare_action_banner,
    publish_banner,
)


async def execute_with_banner(db, user_id, action, payload):
    response = execute_action(
        db, user_id, action, payload
    )

    if (
        response.get("applied") is True
        and response.get("duplicate") is False
    ):
        try:
            banner = prepare_action_banner(
                db, user_id, action,
                payload.request_id,
            )
            await publish_banner(banner)
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                "Post-commit nobility banner failed"
            )

    return response


def register_auth(current_user):
    router = APIRouter(
        prefix="/v1/nobility",
        tags=["Lidya Asaleti"],
    )

    @router.get("/catalog")
    def catalog(
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
    ):
        ranks = []

        for rank in range(1, 5):
            config = db.get(NobilityRankConfig, rank)

            rule = get_rank_rule(rank)

            configured = bool(
                config
                and config.enabled
                and config.required_points == rule.required_points
                and config.renewal_points == rule.renewal_points
                and config.duration_days == rule.duration_days
            )

            ranks.append({
                "rank": rank,
                "name": RANK_NAMES[rank],
                "available": enabled() and configured,
                "required_points": (
                    str(config.required_points)
                    if configured else None
                ),
                "renewal_points": (
                    str(config.renewal_points)
                    if configured else None
                ),
                "duration_days": (
                    config.duration_days
                    if configured else None
                ),
                "privileges": privileges_for_rank(rank),
            })

        return {
            "ok": True,
            "enabled": enabled(),
            "ranks": ranks,
            "privileges": dict(PRIVILEGES),
        }

    @router.get("/me")
    def me(
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
    ):
        return {
            "ok": True,
            **membership_state(db, user.id),
        }


    @router.post("/collection/preference")
    def collection_preference(
        payload: dict,
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
    ):
        from .nobility_collection import set_preference

        return set_preference(
            db,
            user,
            payload.get("rank"),
            payload.get("privilege"),
            payload.get("enabled"),
        )

    @router.get("/history")
    def history(
        limit: int = Query(default=20, ge=1, le=50),
        offset: int = Query(default=0, ge=0, le=10000),
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
    ):
        rows = db.scalars(
            select(NobilityPointsLedger)
            .where(
                NobilityPointsLedger.user_id == user.id
            )
            .order_by(
                NobilityPointsLedger.created_at.desc(),
                NobilityPointsLedger.event_key.desc(),
            )
            .offset(offset)
            .limit(limit + 1)
        ).all()

        return {
            "ok": True,
            "items": [
                {
                    "amount": str(row.amount),
                    "source": row.source,
                    "created_at": utc(
                        row.created_at
                    ).isoformat(),
                }
                for row in rows[:limit]
            ],
            "has_more": len(rows) > limit,
            "next_offset": (
                offset + limit
                if len(rows) > limit else None
            ),
        }

    @router.post("/activate")
    @database_task
    async def activate(
        payload: NobilityActionRequest,
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
    ):
        return await execute_with_banner(
            db,
            user.id,
            "activate",
            payload,
        )

    @router.post("/upgrade")
    @database_task
    async def upgrade(
        payload: NobilityActionRequest,
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
    ):
        return await execute_with_banner(
            db,
            user.id,
            "upgrade",
            payload,
        )

    @router.post("/renew")
    @database_task
    async def renew(
        payload: NobilityActionRequest,
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
    ):
        return await execute_with_banner(
            db,
            user.id,
            "renew",
            payload,
        )

    @router.post("/cancel")
    def cancel(
        payload: NobilityCancellationRequest,
        db: Session = Depends(get_db),
        user: User = Depends(current_user),
    ):
        return cancel_action(
            db,
            user.id,
            payload,
        )

    return router
