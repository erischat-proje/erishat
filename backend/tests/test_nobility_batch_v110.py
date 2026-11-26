from datetime import datetime, timedelta, timezone

import pytest

from backend.app.nobility_ranking import knight_ranking

from sqlalchemy import event
from sqlalchemy.orm import Session

from backend.app.models import User
from backend.app.admin_models import AdminRole, UserBan
from backend.app.ban_workflow_models import UserBrowserDevice

from backend.app.nobility_models import (
    NobilityMembership,
)

from backend.app.platform_models import (
    UserBlock,
    PrivateProfileSetting,
)

from backend.app.nobility_follow_appearance import (
    knight_follow_appearance,
    knight_follow_appearances,
)

from backend.tests.test_nobility_follow_api_v15 import (
    follow_api,
    setup,
)


EMPTY = {"rank": 0, "privileges": []}

KNIGHT = {
    "rank": 1,
    "privileges": ["badge", "frame"],
}

IDS = [
    "knight",
    "knight2",
    "count",
    "expired",
    "missing",
]


def compare(engine):
    now = datetime.now(timezone.utc)

    with Session(engine) as db:
        expected = {
            uid: knight_follow_appearance(
                db, "owner", uid, now
            )
            for uid in IDS
        }

        actual = knight_follow_appearances(
            db, "owner", IDS, now
        )

        assert actual == expected

        return actual


def test_original_policy_equivalence(follow_api):
    _, engine = follow_api

    actual = compare(engine)

    assert actual["knight"] == KNIGHT
    assert actual["expired"] == EMPTY
    assert actual["count"] == EMPTY
    assert actual["missing"] == EMPTY


def test_private_profile_equivalence(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        db.add(PrivateProfileSetting(
            user_id="knight2",
            is_private=True,
        ))
        db.commit()

    assert compare(engine)["knight2"] == EMPTY


def test_block_equivalence(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        db.add(UserBlock(
            blocker_id="knight",
            blocked_id="owner",
        ))
        db.commit()

    assert compare(engine)["knight"] == EMPTY


def test_staff_equivalence(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        db.add(AdminRole(
            user_id="knight",
            role="DA",
        ))
        db.commit()

    assert compare(engine)["knight"] == EMPTY


def test_account_ban_equivalence(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        db.add(UserBan(
            user_id="knight",
            ban_type="account",
            banned_by="owner",
            reason="Test",
            active=True,
        ))
        db.commit()

    assert compare(engine)["knight"] == EMPTY


def test_device_ban_equivalence(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        db.add_all([
            UserBrowserDevice(
                user_id="knight",
                device_hash="test-shared-device",
            ),
            UserBrowserDevice(
                user_id="count",
                device_hash="test-shared-device",
            ),
            UserBan(
                user_id="count",
                ban_type="device",
                banned_by="owner",
                reason="Test",
                active=True,
            ),
        ])

        db.commit()

    assert compare(engine)["knight"] == EMPTY


def test_disabled_system(
    follow_api, monkeypatch
):
    _, engine = follow_api

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )

    assert compare(engine)["knight"] == EMPTY


def test_duplicate_ids(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        result = knight_follow_appearances(
            db,
            "owner",
            ["knight", "knight", "knight"],
            datetime.now(timezone.utc),
        )

    assert result == {"knight": KNIGHT}


def test_empty_list(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        assert knight_follow_appearances(
            db,
            "owner",
            [],
            datetime.now(timezone.utc),
        ) == {}


@pytest.mark.parametrize(
    "size,mode",
    [
        (200, "follow"),
        (50, "game"),
        (50, "fan"),
    ],
)
def test_active_knights_single_query(
    follow_api, size, mode
):
    _, engine = follow_api
    now = datetime.now(timezone.utc)

    ids = [
        f"batch-knight-{i}"
        for i in range(size)
    ]

    with Session(engine) as db:
        for i, uid in enumerate(ids):
            db.add(User(
                id=uid,
                public_id=str(880000000+i),
                _nickname=f"Batch {i}",
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
            if mode == "follow":
                result = knight_follow_appearances(
                    db, "owner", ids, now
                )
            else:
                rows = [
                    {
                        "rank": i+1,
                        "user_id": uid,
                        **(
                            {"winnings": 100000-i}
                            if mode == "game"
                            else {"gifts_hidden": True}
                        ),
                    }
                    for i, uid in enumerate(ids)
                ]

                decorated = knight_ranking(
                    db,
                    "owner",
                    {"items": rows},
                )["items"]

                assert len(decorated) == size

                for before, after in zip(rows, decorated):
                    assert {
                        k: v for k, v in after.items()
                        if k != "nobility"
                    } == before

                    if mode == "fan":
                        assert "total_lidya" not in after
                        assert "fan_level" not in after

                result = {
                    row["user_id"]: row["nobility"]
                    for row in decorated
                }
    finally:
        event.remove(
            engine,
            "before_cursor_execute",
            count_query,
        )

    assert len(result) == size

    assert all(
        result[uid] == KNIGHT
        for uid in ids
    )

    print("MODE:", mode)
    print("ACTIVE KNIGHTS:", len(result))
    print("SQL QUERIES:", len(queries))

    assert len(queries) == 1
