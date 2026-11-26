from datetime import datetime, timedelta, timezone

import pytest

from sqlalchemy import event
from sqlalchemy.orm import Session

from backend.app.models import User

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityRankConfig,
)

from backend.app.nobility_config import get_rank_rule

from backend.app.nobility_room_priority import (
    member_nobility,
    members_nobility,
    order_room_members,
)

from backend.tests.test_nobility_follow_api_v15 import (
    follow_api,
    setup,
)


EMPTY = {"rank": 0, "privileges": []}


def test_original_policy_equivalence(follow_api):
    _, engine = follow_api
    now = datetime.now(timezone.utc)

    ids = [
        "knight",
        "knight2",
        "count",
        "expired",
        "missing",
    ]

    with Session(engine) as db:
        expected = {
            uid: member_nobility(db, uid, now)
            for uid in ids
        }

        assert members_nobility(
            db, ids, now
        ) == expected


@pytest.mark.parametrize("rank", [1, 2, 3, 4])
def test_all_rank_equivalence(follow_api, rank):
    _, engine = follow_api
    now = datetime.now(timezone.utc)

    with Session(engine) as db:
        rule = get_rank_rule(rank)

        config = db.get(
            NobilityRankConfig, rank
        )

        if config is None:
            config = NobilityRankConfig(rank=rank)
            db.add(config)

        config.enabled = True
        config.required_points = rule.required_points
        config.renewal_points = rule.renewal_points
        config.duration_days = rule.duration_days

        member = db.get(
            NobilityMembership, "knight"
        )

        member.rank = rank
        member.started_at = now-timedelta(days=1)
        member.expires_at = now+timedelta(days=29)

        db.commit()

        actual = members_nobility(
            db, ["knight"], now
        )["knight"]

        assert actual == member_nobility(
            db, "knight", now
        )

        assert actual["rank"] == rank


def test_expired_membership(follow_api):
    _, engine = follow_api
    now = datetime.now(timezone.utc)

    with Session(engine) as db:
        member = db.get(
            NobilityMembership, "knight"
        )

        member.started_at = now-timedelta(days=30)
        member.expires_at = now

        db.commit()

        assert members_nobility(
            db, ["knight"], now
        )["knight"] == EMPTY


def test_disabled_configuration(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        config = db.get(NobilityRankConfig, 1)
        config.enabled = False
        db.commit()

        assert members_nobility(
            db,
            ["knight"],
            datetime.now(timezone.utc),
        )["knight"] == EMPTY


def test_invalid_configuration(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        config = db.get(NobilityRankConfig, 1)
        config.required_points = 1
        db.commit()

        assert members_nobility(
            db,
            ["knight"],
            datetime.now(timezone.utc),
        )["knight"] == EMPTY


def test_disabled_system(
    follow_api, monkeypatch
):
    _, engine = follow_api

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    with Session(engine) as db:
        assert members_nobility(
            db,
            ["knight"],
            datetime.now(timezone.utc),
        )["knight"] == EMPTY


def test_duplicate_ids(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        result = members_nobility(
            db,
            ["knight", "knight", "knight"],
            datetime.now(timezone.utc),
        )

    assert len(result) == 1
    assert result["knight"]["rank"] == 1


def test_empty_list(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        assert members_nobility(
            db,
            [],
            datetime.now(timezone.utc),
        ) == {}


def test_priority_order():
    rows = [
        {"user_id": "normal", "nobility": {"rank": 0}},
        {"user_id": "knight1", "nobility": {"rank": 1}},
        {"user_id": "king", "nobility": {"rank": 4}},
        {"user_id": "count", "nobility": {"rank": 2}},
        {"user_id": "duke", "nobility": {"rank": 3}},
        {"user_id": "knight2", "nobility": {"rank": 1}},
    ]

    result = order_room_members(rows)

    assert [
        row["user_id"] for row in result
    ] == [
        "king", "duke", "count",
        "knight1", "knight2", "normal",
    ]


def test_200_room_knights_single_query(follow_api):
    _, engine = follow_api
    now = datetime.now(timezone.utc)

    ids = [
        f"room-batch-knight-{i}"
        for i in range(200)
    ]

    with Session(engine) as db:
        for i, uid in enumerate(ids):
            db.add(User(
                id=uid,
                public_id=str(890000000+i),
                _nickname=f"Room Knight {i}",
                is_active=True,
            ))

        db.flush()

        for uid in ids:
            db.add(NobilityMembership(
                user_id=uid,
                rank=1,
                points=0,
                started_at=now-timedelta(days=1),
                expires_at=now+timedelta(days=29),
            ))

        db.commit()

    queries = []

    def count_query(
        conn, cursor, statement,
        parameters, context, executemany
    ):
        queries.append(statement)

    event.listen(
        engine,
        "before_cursor_execute",
        count_query,
    )

    try:
        with Session(engine) as db:
            result = members_nobility(
                db, ids, now
            )
    finally:
        event.remove(
            engine,
            "before_cursor_execute",
            count_query,
        )

    assert len(result) == 200

    assert all(
        data["rank"] == 1
        and data["privileges"] == ["badge"]
        for data in result.values()
    )

    print("ROOM ACTIVE KNIGHTS:", len(result))
    print("ROOM NOBILITY SQL QUERIES:", len(queries))

    assert len(queries) == 1
