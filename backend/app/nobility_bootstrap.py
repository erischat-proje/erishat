"""Idempotent LidyaChat nobility configuration bootstrap."""

import logging

from sqlalchemy.dialects.postgresql import insert

from .nobility_config import RANK_RULES
from .nobility_models import NobilityRankConfig

logger = logging.getLogger(__name__)


def initialize_nobility_config(db):
    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError(
            "Nobility configuration requires PostgreSQL"
        )

    created = 0
    invalid = []

    for rank, rule in sorted(RANK_RULES.items()):
        statement = (
            insert(NobilityRankConfig)
            .values(
                rank=rank,
                required_points=rule.required_points,
                renewal_points=rule.renewal_points,
                duration_days=rule.duration_days,
                enabled=True,
            )
            .on_conflict_do_nothing(
                index_elements=["rank"]
            )
            .returning(NobilityRankConfig.rank)
        )

        if db.scalar(statement) is not None:
            created += 1

        config = db.get(
            NobilityRankConfig,
            rank,
            populate_existing=True,
        )

        if (
            config is None
            or config.required_points != rule.required_points
            or config.renewal_points != rule.renewal_points
            or config.duration_days != rule.duration_days
        ):
            invalid.append(rank)

    if invalid:
        logger.error(
            "Nobility configuration mismatch: ranks=%s",
            invalid,
        )

    return {
        "created": created,
        "invalid_ranks": invalid,
    }
