"""Nobility database bootstrap regression tests."""

import pytest

from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.nobility_bootstrap import (
    initialize_nobility_config,
)
from backend.app.nobility_models import (
    NobilityRankConfig,
    NobilityMembership,
    NobilityPointsLedger,
)

from test_nobility_postgres_v1 import scoped_db


@pytest.fixture
def engine(scoped_db):
    Base.metadata.create_all(
        scoped_db,
        tables=[NobilityRankConfig.__table__],
    )
    return scoped_db


def test_initial_configuration(engine):
    with Session(engine) as db:
        result = initialize_nobility_config(db)
        db.commit()

        assert result == {
            "created": 4,
            "invalid_ranks": [],
        }

        rows = db.scalars(
            select(NobilityRankConfig)
            .order_by(NobilityRankConfig.rank)
        ).all()

        assert [
            (
                r.rank,
                r.required_points,
                r.renewal_points,
                r.duration_days,
                r.enabled,
            )
            for r in rows
        ] == [
            (1, 400000, 100000, 30, True),
            (2, 800000, 200000, 30, True),
            (3, 1600000, 400000, 30, True),
            (4, 3200000, 800000, 30, True),
        ]


def test_repeated_startup(engine):
    with Session(engine) as db:
        initialize_nobility_config(db)
        db.commit()

        result = initialize_nobility_config(db)
        db.commit()

        assert result["created"] == 0
        assert result["invalid_ranks"] == []


@pytest.mark.parametrize("rank", [1, 2, 3, 4])
def test_missing_rank_restored(engine, rank):
    with Session(engine) as db:
        initialize_nobility_config(db)
        db.commit()

        db.execute(
            delete(NobilityRankConfig)
            .where(NobilityRankConfig.rank == rank)
        )
        db.commit()

        result = initialize_nobility_config(db)
        db.commit()

        assert result["created"] == 1
        assert result["invalid_ranks"] == []


@pytest.mark.parametrize("rank", [1, 2, 3, 4])
def test_disabled_rank_preserved(engine, rank):
    with Session(engine) as db:
        initialize_nobility_config(db)

        config = db.get(NobilityRankConfig, rank)
        config.enabled = False
        db.commit()

        initialize_nobility_config(db)
        db.commit()

        assert db.get(
            NobilityRankConfig, rank
        ).enabled is False


@pytest.mark.parametrize(
    "field,value",
    [
        ("required_points", 1),
        ("renewal_points", 1),
        ("duration_days", 1),
        ("required_points", None),
        ("renewal_points", None),
        ("duration_days", None),
    ],
)
def test_invalid_configuration_not_overwritten(
    engine, field, value
):
    with Session(engine) as db:
        initialize_nobility_config(db)

        config = db.get(NobilityRankConfig, 1)
        setattr(config, field, value)
        db.commit()

        result = initialize_nobility_config(db)
        db.commit()

        assert result["created"] == 0
        assert result["invalid_ranks"] == [1]

        assert getattr(
            db.get(NobilityRankConfig, 1),
            field,
        ) == value


def test_bootstrap_rollback(engine):
    with Session(engine) as db:
        initialize_nobility_config(db)
        db.rollback()

    with Session(engine) as db:
        assert db.scalars(
            select(NobilityRankConfig)
        ).all() == []


def test_no_financial_records_created(engine):
    with Session(engine) as db:
        initialize_nobility_config(db)
        db.commit()

        assert db.scalars(
            select(NobilityMembership)
        ).all() == []

        assert db.scalars(
            select(NobilityPointsLedger)
        ).all() == []
