"""Nobility confirmation revision tests."""

from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from dataclasses import dataclass, replace

import pytest

from backend.app.nobility_revision import (
    membership_revision,
)


NOW = datetime(
    2026, 11, 25, 12, 0,
    tzinfo=timezone.utc,
)


@dataclass(frozen=True)
class Member:
    rank: int = 4
    points: int = 3500000
    started_at: datetime = NOW - timedelta(days=5)
    expires_at: datetime = NOW + timedelta(days=25)
    updated_at: datetime = NOW


def revision(
    member,
    user_id="u1",
    rank=4,
    enabled=True,
    at=NOW,
):
    return membership_revision(
        user_id,
        member,
        authorized_rank=rank,
        system_enabled=enabled,
        at=at,
    )


def test_revision_format():
    result = revision(Member())

    assert len(result) == 64
    assert all(c in "0123456789abcdef" for c in result)


def test_same_state_same_revision():
    assert revision(Member()) == revision(Member())


def test_user_isolation():
    assert revision(
        Member(), user_id="u1"
    ) != revision(
        Member(), user_id="u2"
    )


@pytest.mark.parametrize("points", [
    0,
    1,
    3499999,
    3500001,
    9223372036854775807,
])
def test_balance_change(points):
    member = Member()

    assert revision(member) != revision(
        replace(member, points=points)
    )


@pytest.mark.parametrize("rank", [0, 1, 2, 3])
def test_rank_change(rank):
    member = Member()

    assert revision(member) != revision(
        replace(member, rank=rank)
    )


def test_renewal_changes_revision():
    member = Member()

    renewed = replace(
        member,
        expires_at=member.expires_at + timedelta(days=30),
    )

    assert revision(member) != revision(renewed)


def test_refund_duration_changes_revision():
    member = Member()

    refunded = replace(
        member,
        expires_at=member.expires_at - timedelta(days=10),
    )

    assert revision(member) != revision(refunded)


def test_started_at_change():
    member = Member()

    changed = replace(
        member,
        started_at=member.started_at + timedelta(seconds=1),
    )

    assert revision(member) != revision(changed)


def test_updated_at_change():
    member = Member()

    changed = replace(
        member,
        updated_at=member.updated_at + timedelta(microseconds=1),
    )

    assert revision(member) != revision(changed)


def test_balance_restored_but_revision_changed():
    member = Member()

    changed = replace(
        member,
        updated_at=member.updated_at + timedelta(seconds=2),
    )

    assert member.points == changed.points
    assert revision(member) != revision(changed)


def test_expiry_boundary():
    member = Member()

    assert revision(
        member,
        at=member.expires_at - timedelta(microseconds=1),
    ) != revision(
        member,
        at=member.expires_at,
    )


def test_membership_not_started():
    member = Member()

    assert revision(
        member,
        at=member.started_at - timedelta(seconds=1),
    ) != revision(
        member,
        at=member.started_at,
    )


def test_time_progress_without_state_change():
    member = Member()

    assert revision(
        member,
        at=NOW,
    ) == revision(
        member,
        at=NOW + timedelta(hours=1),
    )


def test_disabled_system_changes_revision():
    member = Member()

    assert revision(
        member, enabled=True
    ) != revision(
        member, enabled=False
    )


def test_authorized_rank_changes_revision():
    member = Member()

    assert revision(
        member, rank=4
    ) != revision(
        member, rank=0
    )


def test_missing_membership():
    assert revision(
        None, rank=0
    ) == revision(
        None, rank=0
    )


def test_missing_membership_user_isolation():
    assert revision(
        None, user_id="u1", rank=0
    ) != revision(
        None, user_id="u2", rank=0
    )


def test_empty_membership_differs_from_missing():
    member = Member(
        rank=0,
        points=0,
        started_at=None,
        expires_at=None,
    )

    assert revision(
        member, rank=0
    ) != revision(
        None, rank=0
    )


def test_timezone_normalization():
    member = Member()

    tz = timezone(timedelta(hours=3))

    changed = replace(
        member,
        started_at=member.started_at.astimezone(tz),
        expires_at=member.expires_at.astimezone(tz),
        updated_at=member.updated_at.astimezone(tz),
    )

    assert revision(member) == revision(changed)


def test_naive_utc_normalization():
    member = Member()

    changed = replace(
        member,
        started_at=member.started_at.replace(tzinfo=None),
        expires_at=member.expires_at.replace(tzinfo=None),
        updated_at=member.updated_at.replace(tzinfo=None),
    )

    assert revision(member) == revision(changed)


def test_revision_does_not_modify_membership():
    member = SimpleNamespace(
        **vars(Member())
    )

    before = vars(member).copy()

    revision(member)

    assert vars(member) == before
