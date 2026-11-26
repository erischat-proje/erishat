"""Concurrent nobility membership action tests."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from datetime import timedelta
from uuid import uuid4

import pytest
from nobility_confirmation_helpers import confirmed_payload
from sqlalchemy.orm import Session

from backend.app.nobility_models import NobilityMembership
from backend.app.nobility_policy import utc

from test_nobility_postgres_v1 import scoped_db
from test_nobility_activation_v10 import (
    engine,
    fund,
    verify,
)
from test_nobility_activation_api_v10 import (
    client,
    BASE,
    H1,
    payload,
)
from test_nobility_upgrade_api_v10 import activate


ACTIVATE = BASE + "/activate"
UPGRADE = BASE + "/upgrade"
RENEW = BASE + "/renew"


def race(client, requests):
    barrier = Barrier(len(requests))

    def worker(item):
        url, body = item

        barrier.wait(timeout=15)

        response = client.post(
            url,
            headers=H1,
            json=body,
        )

        return response.status_code, response.json()

    with ThreadPoolExecutor(
        max_workers=len(requests)
    ) as pool:
        futures = [
            pool.submit(worker, item)
            for item in requests
        ]

        return [
            future.result(timeout=60)
            for future in futures
        ]


def expiry(engine):
    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        return utc(member.expires_at)


@pytest.mark.parametrize("count", [2, 4, 8])
def test_duplicate_upgrade(client, engine, count):
    fund(engine, 2_000_000)
    activate(client)

    body = confirmed_payload(client, 2, action="upgrade")

    results = race(
        client,
        [(UPGRADE, body) for _ in range(count)],
    )

    assert all(
        status == 200
        for status, data in results
    )

    assert sum(
        data["applied"] is True
        for status, data in results
    ) == 1

    assert sum(
        data["duplicate"] is True
        for status, data in results
    ) == count - 1

    verify(engine, 2, 800_000, 2)


@pytest.mark.parametrize("count", [2, 4, 8])
def test_duplicate_renewal(client, engine, count):
    fund(engine, 800_000)
    activate(client)

    original = expiry(engine)
    body = confirmed_payload(client, 1, action="renew")

    results = race(
        client,
        [(RENEW, body) for _ in range(count)],
    )

    assert all(
        status == 200
        for status, data in results
    )

    assert sum(
        data["applied"] is True
        for status, data in results
    ) == 1

    assert sum(
        data["duplicate"] is True
        for status, data in results
    ) == count - 1

    assert expiry(engine) == (
        original + timedelta(days=30)
    )

    verify(engine, 1, 300_000, 2)


@pytest.mark.parametrize("count", [2, 4, 8])
def test_distinct_upgrade_requests(
    client, engine, count
):
    fund(engine, 4_000_000)
    activate(client)

    results = race(
        client,
        [
            (UPGRADE, confirmed_payload(client, 2, action="upgrade"))
            for _ in range(count)
        ],
    )

    statuses = [
        status for status, data in results
    ]

    assert statuses.count(200) == 1
    assert statuses.count(409) == count - 1

    for status, data in results:
        if status == 409:
            assert (
                data["detail"]
                == "stale_confirmation"
            )

    verify(engine, 2, 2_800_000, 2)


@pytest.mark.parametrize("count", [2, 4, 8])
def test_distinct_renewal_requests(
    client, engine, count
):
    fund(engine, 400_000 + count * 100_000)
    activate(client)

    original = expiry(engine)

    results = race(
        client,
        [
            (RENEW, confirmed_payload(client, 1, action="renew"))
            for _ in range(count)
        ],
    )

    assert sum(
        status == 200 and data["applied"]
        for status, data in results
    ) == 1

    assert sum(
        status == 409
        and data["detail"] == "stale_confirmation"
        for status, data in results
    ) == count - 1

    assert expiry(engine) == (
        original + timedelta(days=30)
    )

    verify(
        engine, 1,
        (count - 1) * 100_000,
        2,
    )


def test_renewal_balance_contention(client, engine):
    fund(engine, 500_000)
    activate(client)

    original = expiry(engine)

    results = race(
        client,
        [(RENEW, confirmed_payload(client, 1, action="renew")) for _ in range(8)],
    )

    statuses = [
        status for status, data in results
    ]

    assert statuses.count(200) == 1
    assert statuses.count(409) == 7

    for status, data in results:
        if status == 409:
            assert (
                data["detail"]
                == "stale_confirmation"
            )

    assert expiry(engine) == (
        original + timedelta(days=30)
    )

    verify(engine, 1, 0, 2)


def test_upgrade_renew_same_key(client, engine):
    fund(engine, 2_000_000)
    activate(client)

    original = expiry(engine)
    key = str(uuid4())

    results = race(client, [
        (UPGRADE, confirmed_payload(client, 2, key, action="upgrade")),
        (RENEW, confirmed_payload(client, 1, key, action="renew")),
    ])

    assert sorted(
        status for status, data in results
    ) == [200, 409]

    winner = next(
        data for status, data in results
        if status == 200
    )

    loser = next(
        data for status, data in results
        if status == 409
    )

    assert loser["detail"] == "request_conflict"

    if winner["action"] == "upgrade":
        verify(engine, 2, 800_000, 2)
    else:
        assert winner["action"] == "renew"

        assert expiry(engine) == (
            original + timedelta(days=30)
        )

        verify(engine, 1, 1_500_000, 2)


def test_upgrade_renew_distinct_keys(client, engine):
    fund(engine, 2_000_000)
    activate(client)

    original = expiry(engine)

    results = race(client, [
        (
            UPGRADE,
            confirmed_payload(
                client, 2, action="upgrade"
            ),
        ),
        (
            RENEW,
            confirmed_payload(
                client, 1, action="renew"
            ),
        ),
    ])

    assert sorted(
        status for status, data in results
    ) == [200, 409]

    upgrade, renewal = results

    if upgrade[0] == 200:
        assert upgrade[1]["applied"] is True
        assert renewal[1]["detail"] == "stale_confirmation"

        verify(engine, 2, 800_000, 2)

        with Session(engine) as db:
            member = db.get(NobilityMembership, "u1")

            assert (
                utc(member.expires_at)
                - utc(member.started_at)
            ) == timedelta(days=30)

    else:
        assert renewal[1]["applied"] is True
        assert upgrade[1]["detail"] == "stale_confirmation"

        assert expiry(engine) == (
            original + timedelta(days=30)
        )

        verify(engine, 1, 1_500_000, 2)


def test_upgrade_renew_competing_balance(client, engine):
    fund(engine, 1_200_000)
    activate(client)

    original = expiry(engine)

    results = race(client, [
        (UPGRADE, confirmed_payload(client, 2, action="upgrade")),
        (RENEW, confirmed_payload(client, 1, action="renew")),
    ])

    assert sorted(
        status for status, data in results
    ) == [200, 409]

    upgrade, renewal = results

    if upgrade[0] == 200:
        assert renewal[1]["detail"] == "stale_confirmation"
        verify(engine, 2, 0, 2)
    else:
        assert upgrade[1]["detail"] == "stale_confirmation"

        assert expiry(engine) == (
            original + timedelta(days=30)
        )

        verify(engine, 1, 700_000, 2)


def test_activation_renew_same_key(client, engine):
    fund(engine, 800_000)

    key = str(uuid4())

    results = race(client, [
        (ACTIVATE, confirmed_payload(client, 1, key, action="activate")),
        (RENEW, confirmed_payload(client, 1, key, action="renew")),
    ])

    activation, renewal = results

    assert activation[0] == 200
    assert renewal[0] == 409

    assert renewal[1]["detail"] in (
        "request_conflict",
        "active_membership_required",
    )

    verify(engine, 1, 400_000, 1)
