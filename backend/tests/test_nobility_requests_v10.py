"""Strict nobility request validation tests."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from backend.app.nobility_requests import (
    NobilityActionRequest,
)


@pytest.mark.parametrize("rank", [1, 2, 3, 4])
def test_valid_rank(rank):
    key = str(uuid4())
    result = NobilityActionRequest(
        rank=rank,
        request_id=key,
    )
    assert result.rank == rank
    assert result.request_id == key


@pytest.mark.parametrize("rank", [
    0, 5, -1, 100,
    True, False,
    "1", "4",
    1.0, 4.0,
    None, [], {},
])
def test_invalid_rank(rank):
    with pytest.raises(ValidationError):
        NobilityActionRequest(
            rank=rank,
            request_id=str(uuid4()),
        )


@pytest.mark.parametrize("key", [
    "",
    "invalid",
    "a" * 64,
    None,
    123,
    True,
    [],
    {},
    "550e8400-e29b-11d4-a716-446655440000",
    "550E8400-E29B-41D4-A716-446655440000",
    "00000000-0000-0000-0000-000000000000",
    "550e8400e29b41d4a716446655440000",
    "550e8400-e29b-41d4-7716-446655440000",
])
def test_invalid_request_id(key):
    with pytest.raises(ValidationError):
        NobilityActionRequest(
            rank=1,
            request_id=key,
        )


@pytest.mark.parametrize("field", [
    "user_id",
    "points",
    "price",
    "required_points",
    "renewal_points",
    "duration_days",
    "expires_at",
    "started_at",
    "privileges",
    "is_admin",
    "vip",
    "balance",
    "source",
    "event_key",
])
def test_extra_fields_rejected(field):
    payload = {
        "rank": 1,
        "request_id": str(uuid4()),
        field: "forged",
    }

    with pytest.raises(ValidationError):
        NobilityActionRequest(**payload)


@pytest.mark.parametrize("payload", [
    {},
    {"rank": 1},
    {"request_id": str(uuid4())},
])
def test_missing_fields(payload):
    with pytest.raises(ValidationError):
        NobilityActionRequest(**payload)


def test_request_is_immutable():
    request = NobilityActionRequest(
        rank=1,
        request_id=str(uuid4()),
    )

    with pytest.raises(ValidationError):
        request.rank = 4
