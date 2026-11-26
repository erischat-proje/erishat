"""Concurrent PostgreSQL nobility HTTP security tests."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from nobility_confirmation_helpers import confirmed_payload
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_points import apply_points
from backend.app.nobility_models import (
    NobilityMembership,
    NobilityAuditLog,
    NobilityPointsLedger,
)

from test_nobility_postgres_v1 import scoped_db
from test_nobility_activation_v10 import (
    engine,
    fund,
    verify,
)
from test_nobility_activation_api_v10 import (
    client,
    URL,
    H1,
    H2,
)


def race(client, requests):
    barrier = Barrier(len(requests))

    def worker(item):
        headers, body = item

        barrier.wait(timeout=15)

        response = client.post(
            URL,
            headers=headers,
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


@pytest.mark.parametrize("count", [2, 4, 8])
def test_same_request_concurrent(
    client, engine, count
):
    fund(engine, 800_000)

    body = confirmed_payload(client, headers=H1)

    results = race(
        client,
        [(H1, body) for _ in range(count)],
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

    verify(engine, 1, 400_000, 1)


@pytest.mark.parametrize("count", [2, 4, 8])
def test_different_requests_concurrent(
    client, engine, count
):
    fund(engine, 4_000_000)

    results = race(
        client,
        [(H1, confirmed_payload(client, headers=H1)) for _ in range(count)],
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

    verify(engine, 1, 3_600_000, 1)


def test_same_key_different_ranks(
    client, engine
):
    fund(engine, 4_000_000)

    key = str(uuid4())

    results = race(client, [
        (H1, confirmed_payload(client, 1, key, headers=H1)),
        (H1, confirmed_payload(client, 4, key, headers=H1)),
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

    rank = winner["membership"]["rank"]

    assert rank in (1, 4)

    cost = {
        1: 400_000,
        4: 3_200_000,
    }[rank]

    verify(engine, rank, 4_000_000-cost, 1)


def test_different_ranks_different_keys(
    client, engine
):
    fund(engine, 4_000_000)

    results = race(client, [
        (H1, confirmed_payload(client, 1, headers=H1)),
        (H1, confirmed_payload(client, 2, headers=H1)),
        (H1, confirmed_payload(client, 3, headers=H1)),
        (H1, confirmed_payload(client, 4, headers=H1)),
    ])

    assert sorted(
        status for status, data in results
    ) == [200, 409, 409, 409]

    winner = next(
        data for status, data in results
        if status == 200
    )

    rank = winner["membership"]["rank"]

    cost = {
        1: 400_000,
        2: 800_000,
        3: 1_600_000,
        4: 3_200_000,
    }[rank]

    verify(engine, rank, 4_000_000-cost, 1)


def test_insufficient_concurrent(
    client, engine
):
    fund(engine, 399_999)

    results = race(
        client,
        [(H1, confirmed_payload(client, headers=H1)) for _ in range(4)],
    )

    assert all(
        status == 409
        and data["detail"] == "insufficient_points"
        for status, data in results
    )

    verify(engine, 0, 399_999, 0)


def test_same_uuid_separate_accounts(
    client, engine
):
    fund(engine, 800_000)

    with Session(engine) as db:
        apply_points(
            db,
            "u2",
            800_000,
            "test-funding-u2",
            "test",
        )
        db.commit()

    key = str(uuid4())

    results = race(client, [
        (H1, confirmed_payload(client, 1, key, headers=H1)),
        (H2, confirmed_payload(client, 2, key, headers=H2)),
    ])

    assert all(
        status == 200 and data["applied"]
        for status, data in results
    )

    with Session(engine) as db:
        first = db.get(NobilityMembership, "u1")
        second = db.get(NobilityMembership, "u2")

        assert first.rank == 1
        assert first.points == 400_000

        assert second.rank == 2
        assert second.points == 0

        logs = db.scalars(
            select(NobilityAuditLog)
        ).all()

        assert len(logs) == 2
        assert {
            row.user_id for row in logs
        } == {"u1", "u2"}

        for uid, expected in [
            ("u1", 400_000),
            ("u2", 0),
        ]:
            rows = db.scalars(
                select(NobilityPointsLedger)
                .where(
                    NobilityPointsLedger.user_id == uid
                )
            ).all()

            assert sum(
                row.amount for row in rows
            ) == expected
