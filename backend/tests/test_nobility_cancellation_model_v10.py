from uuid import uuid4

import pytest
from pydantic import ValidationError

from backend.app.nobility_models import (
    NobilityActionRejection,
)
from backend.app.nobility_requests import (
    NobilityCancellationRequest,
)


def payload():
    return {
        "user_id": "u1",
        "action": "activate",
        "rank": 1,
        "request_id": str(uuid4()),
        "confirmed_revision": "a" * 64,
        "confirmed_cost": "400000",
    }


@pytest.mark.parametrize(
    "action",
    ["activate", "upgrade", "renew"],
)
def test_valid_action(action):
    data = payload()
    data["action"] = action

    result = NobilityCancellationRequest(**data)

    assert result.action == action
    assert result.user_id == "u1"


@pytest.mark.parametrize(
    "field,value",
    [
        ("action", "delete"),
        ("action", "ACTIVATE"),
        ("action", "activate\n"),
        ("action", None),
        ("rank", 0),
        ("rank", 5),
        ("rank", True),
        ("rank", "1"),
        ("user_id", ""),
        ("user_id", " u1"),
        ("user_id", "u1 "),
        ("user_id", "a" * 65),
        ("user_id", 123),
        ("request_id", "invalid"),
        ("request_id", str(uuid4()).upper()),
        ("confirmed_revision", None),
        ("confirmed_revision", "a" * 63),
        ("confirmed_revision", "A" * 64),
        ("confirmed_revision", "g" * 64),
        ("confirmed_cost", None),
        ("confirmed_cost", "0"),
        ("confirmed_cost", "-1"),
        ("confirmed_cost", "0400000"),
        ("confirmed_cost", "1.5"),
        ("confirmed_cost", 400000),
        ("confirmed_cost", "9223372036854775808"),
    ],
)
def test_invalid_payload(field, value):
    data = payload()
    data[field] = value

    with pytest.raises(ValidationError):
        NobilityCancellationRequest(**data)


@pytest.mark.parametrize(
    "field",
    [
        "user_id",
        "action",
        "rank",
        "request_id",
        "confirmed_revision",
        "confirmed_cost",
    ],
)
def test_required_field(field):
    data = payload()
    del data[field]

    with pytest.raises(ValidationError):
        NobilityCancellationRequest(**data)


def test_extra_field_rejected():
    data = payload()
    data["force"] = True

    with pytest.raises(ValidationError):
        NobilityCancellationRequest(**data)


def test_maximum_cost():
    data = payload()
    data["confirmed_cost"] = "9223372036854775807"

    result = NobilityCancellationRequest(**data)

    assert result.confirmed_cost == data["confirmed_cost"]


def test_request_is_immutable():
    result = NobilityCancellationRequest(**payload())

    with pytest.raises(ValidationError):
        result.rank = 4


def test_composite_primary_key():
    table = NobilityActionRejection.__table__

    assert set(table.primary_key.columns.keys()) == {
        "user_id",
        "request_id",
    }


def test_account_deletion_cascade():
    table = NobilityActionRejection.__table__

    fk = next(iter(table.c.user_id.foreign_keys))

    assert fk.target_fullname == "users.id"
    assert fk.ondelete == "CASCADE"


def test_no_financial_balance_columns():
    table = NobilityActionRejection.__table__

    assert "points" not in table.c
    assert "amount" not in table.c
    assert "expires_at" not in table.c


def test_required_database_columns():
    table = NobilityActionRejection.__table__

    for column in table.columns:
        assert column.nullable is False
