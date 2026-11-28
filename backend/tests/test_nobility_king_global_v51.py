from datetime import datetime, timedelta, timezone

import pytest

from sqlalchemy import event
from sqlalchemy.orm import Session

from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app.platform_models import UserBlock

from backend.app.nobility_models import (
    NobilityMembership,
)

from backend.app.nobility_appearance import (
    public_appearance,
)

from backend.app.nobility_follow_appearance import (
    knight_follow_appearances,
    royal_appearance_map,
)

from backend.tests.test_nobility_follow_api_v15 import (
    follow_api,
    setup,
)


def prepare_king(db, gender):
    now = datetime.now(timezone.utc)

    user = db.get(User, "king")
    user.gender = gender

    member = db.get(NobilityMembership, "king")
    assert member is not None

    member.rank = 4
    member.started_at = now - timedelta(days=1)
    member.expires_at = now + timedelta(days=29)

    db.commit()

    return now


@pytest.mark.parametrize("gender", ["male", "female"])
def test_royal_gender(follow_api, gender):
    _, engine = follow_api

    with Session(engine) as db:
        now = prepare_king(db, gender)

        data = public_appearance(db, "king", now)

        assert data["rank"] == 4
        assert data["king_avatar_variant"] == gender
        assert "frame" in data["privileges"]
        assert "super_avatar" in data["privileges"]


@pytest.mark.parametrize("gender", ["male", "female"])
def test_batch_royal_gender(follow_api, gender):
    _, engine = follow_api

    with Session(engine) as db:
        now = prepare_king(db, gender)

        data = knight_follow_appearances(
            db, "owner", ["king"], now
        )["king"]

        assert data["rank"] == 4
        assert data["king_avatar_variant"] == gender
        assert "frame" in data["privileges"]
        assert "super_avatar" in data["privileges"]


def test_expired_king(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        now = prepare_king(db, "female")

        member = db.get(
            NobilityMembership, "king"
        )

        member.expires_at = now
        db.commit()

        result = public_appearance(
            db, "king", now
        )

        assert result["rank"] == 0
        assert "king_avatar_variant" not in result

        assert royal_appearance_map(
            db, "owner", ["king"]
        ) == {}


def test_unknown_gender(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        now = prepare_king(db, "unspecified")

        data = public_appearance(
            db, "king", now
        )

        assert data["king_avatar_variant"] is None


@pytest.mark.parametrize("rank", [1, 2, 3])
def test_lower_rank_no_royal_avatar(
    follow_api, rank
):
    _, engine = follow_api

    with Session(engine) as db:
        now = prepare_king(db, "male")

        member = db.get(
            NobilityMembership, "king"
        )

        member.rank = rank
        db.commit()

        result = public_appearance(
            db, "king", now
        )

        assert result["rank"] == rank
        assert "king_avatar_variant" not in result

        assert royal_appearance_map(
            db, "owner", ["king"]
        ) == {}


@pytest.mark.parametrize(
    "role", ["SA", "UA", "FA", "DA"]
)
def test_staff_protection(follow_api, role):
    _, engine = follow_api

    with Session(engine) as db:
        prepare_king(db, "female")

        db.add(AdminRole(
            user_id="king",
            role=role,
        ))
        db.commit()

        assert royal_appearance_map(
            db, "owner", ["king"]
        ) == {}


def test_blocked_king(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        prepare_king(db, "male")

        db.add(UserBlock(
            blocker_id="owner",
            blocked_id="king",
        ))
        db.commit()

        assert royal_appearance_map(
            db, "owner", ["king"]
        ) == {}


def test_king_renewal(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        now = prepare_king(db, "female")

        before = public_appearance(
            db, "king", now
        )

        member = db.get(
            NobilityMembership, "king"
        )

        member.expires_at += timedelta(days=30)
        db.commit()

        after = public_appearance(
            db, "king", now
        )

        assert before["king_avatar_variant"] == "female"
        assert after["king_avatar_variant"] == "female"

        assert (
            after["king_expires_at"]
            > before["king_expires_at"]
        )


def test_batch_single_query(follow_api):
    _, engine = follow_api

    with Session(engine) as db:
        now = prepare_king(db, "male")

    queries = []

    def count(*args):
        queries.append(args[2])

    event.listen(
        engine,
        "before_cursor_execute",
        count,
    )

    try:
        with Session(engine) as db:
            result = knight_follow_appearances(
                db, "owner",
                ["king", "knight", "count"],
                now
            )
    finally:
        event.remove(
            engine,
            "before_cursor_execute",
            count,
        )

    assert result["king"]["rank"] == 4
    assert len(queries) == 1


def test_royal_room_public_audience(follow_api):
    from backend.app.nobility_follow_appearance import (
        royal_room_audience,
    )

    _, engine = follow_api

    with Session(engine) as db:
        prepare_king(db, "male")

        data, viewers = royal_room_audience(
            db, "king", ["owner", "normal", "king"]
        )

        assert data["king_avatar_variant"] == "male"
        assert viewers == {"owner", "normal", "king"}


def test_royal_room_blocked_audience(follow_api):
    from backend.app.nobility_follow_appearance import (
        royal_room_audience,
    )

    _, engine = follow_api

    with Session(engine) as db:
        prepare_king(db, "female")

        db.add(UserBlock(
            blocker_id="owner",
            blocked_id="king",
        ))
        db.commit()

        data, viewers = royal_room_audience(
            db, "king", ["owner", "normal"]
        )

        assert data["king_avatar_variant"] == "female"
        assert viewers == {"normal"}


def test_royal_room_private_audience(follow_api):
    from backend.app.nobility_follow_appearance import (
        royal_room_audience,
    )

    from backend.app.platform_models import (
        PrivateProfileSetting,
        UserFollow,
    )

    _, engine = follow_api

    with Session(engine) as db:
        prepare_king(db, "female")

        db.add(PrivateProfileSetting(
            user_id="king",
            is_private=True,
        ))

        db.add(UserFollow(
            follower_id="owner",
            following_id="king",
        ))

        db.commit()

        data, viewers = royal_room_audience(
            db, "king",
            ["owner", "normal", "king"]
        )

        assert data["king_avatar_variant"] == "female"
        assert viewers == {"owner", "king"}
