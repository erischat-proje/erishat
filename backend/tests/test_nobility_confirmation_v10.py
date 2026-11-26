"""Strict financial confirmation tests."""

import pytest

from fastapi import HTTPException

from backend.app.nobility_confirmation import (
    expected_cost,
    valid_revision,
    valid_cost,
    verify_confirmation,
)


REVISION = "a" * 64


@pytest.mark.parametrize("action", [
    "activate",
    "upgrade",
    "renew",
])
@pytest.mark.parametrize("rank,full,renewal", [
    (1, 400000, 100000),
    (2, 800000, 200000),
    (3, 1600000, 400000),
    (4, 3200000, 800000),
])
def test_correct_price(action, rank, full, renewal):
    cost = renewal if action == "renew" else full

    assert expected_cost(action, rank) == str(cost)

    assert verify_confirmation(
        action=action,
        rank=rank,
        confirmed_revision=REVISION,
        confirmed_cost=str(cost),
        current_revision=REVISION,
    ) == str(cost)


def confirm(**changes):
    values = {
        "action": "activate",
        "rank": 1,
        "confirmed_revision": REVISION,
        "confirmed_cost": "400000",
        "current_revision": REVISION,
    }

    values.update(changes)

    return verify_confirmation(**values)


@pytest.mark.parametrize("value", [
    None,
    "",
    "a" * 63,
    "a" * 65,
    "A" * 64,
    "g" * 64,
    REVISION + "\n",
    123,
    True,
    [],
    {},
])
def test_invalid_revision(value):
    assert not valid_revision(value)

    with pytest.raises(HTTPException) as exc:
        confirm(confirmed_revision=value)

    assert exc.value.status_code == 409
    assert exc.value.detail == "confirmation_required"


@pytest.mark.parametrize("value", [
    None,
    "",
    "0",
    "-1",
    "+400000",
    "0400000",
    "400000.0",
    "4e5",
    "400000 ",
    "400000\n",
    "40000000000000000000",
    "9223372036854775808",
    400000,
    400000.0,
    True,
    [],
    {},
])
def test_invalid_cost(value):
    assert not valid_cost(value)

    with pytest.raises(HTTPException) as exc:
        confirm(confirmed_cost=value)

    assert exc.value.status_code == 409
    assert exc.value.detail == "confirmation_required"


@pytest.mark.parametrize("value", [
    "1",
    "399999",
    "400001",
    "800000",
    "9223372036854775807",
])
def test_wrong_price(value):
    with pytest.raises(HTTPException) as exc:
        confirm(confirmed_cost=value)

    assert exc.value.status_code == 409
    assert exc.value.detail == "price_changed"


def test_stale_revision():
    with pytest.raises(HTTPException) as exc:
        confirm(current_revision="b" * 64)

    assert exc.value.status_code == 409
    assert exc.value.detail == "stale_confirmation"


def test_upgrade_requires_full_price():
    with pytest.raises(HTTPException) as exc:
        confirm(
            action="upgrade",
            rank=4,
            confirmed_cost="1600000",
        )

    assert exc.value.detail == "price_changed"


def test_renewal_requires_correct_price():
    with pytest.raises(HTTPException) as exc:
        confirm(
            action="renew",
            rank=4,
            confirmed_cost="3200000",
        )

    assert exc.value.detail == "price_changed"


@pytest.mark.parametrize("rank", [
    0, 5, -1, True, False, "1", 1.0, None,
])
def test_invalid_rank(rank):
    with pytest.raises(ValueError):
        expected_cost("activate", rank)


@pytest.mark.parametrize("action", [
    "", "refund", "transfer", "gift", None,
])
def test_invalid_action(action):
    with pytest.raises(ValueError):
        expected_cost(action, 1)


def test_invalid_server_revision():
    with pytest.raises(RuntimeError):
        confirm(current_revision="invalid")
