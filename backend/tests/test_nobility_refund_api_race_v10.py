"""Concurrent refund and membership HTTP security tests."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from nobility_confirmation_helpers import confirmed_payload
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityPointLot,
    NobilityRefundEvent,
)
from backend.app.nobility_points import apply_points
from backend.app.nobility_refunds import refund_points
from backend.app.nobility_policy import (
    has_privilege,
    utc,
)

from test_nobility_postgres_v1 import scoped_db
from test_nobility_activation_v10 import (
    engine,
    verify,
)
from test_nobility_activation_api_v10 import (
    client,
    BASE,
    H1,
)
from test_nobility_upgrade_api_v10 import activate


ACTIVATE = BASE + "/activate"
UPGRADE = BASE + "/upgrade"
RENEW = BASE + "/renew"


def credit(engine, amount, key):
    with Session(engine) as db:
        apply_points(
            db, "u1", amount, key, "test"
        )
        db.commit()


def expiry(engine):
    with Session(engine) as db:
        member = db.get(NobilityMembership, "u1")
        return utc(member.expires_at)


def run_race(
    client,
    engine,
    url,
    rank,
    lot_key,
    points=None,
    refund_count=1,
):
    barrier = Barrier(refund_count + 1)
    action = {
        ACTIVATE: "activate",
        UPGRADE: "upgrade",
        RENEW: "renew",
    }[url]

    body = confirmed_payload(
        client,
        rank,
        action=action,
        headers=H1,
    )

    def action_worker():
        barrier.wait(timeout=15)

        response = client.post(
            url,
            headers=H1,
            json=body,
        )

        return response.status_code, response.json()

    def refund_worker():
        with Session(engine) as db:
            barrier.wait(timeout=15)

            result = refund_points(
                db,
                "u1",
                lot_key,
                "race-refund",
                points=points,
            )

            db.commit()
            return result

    with ThreadPoolExecutor(
        max_workers=refund_count + 1
    ) as pool:
        action = pool.submit(action_worker)

        refunds = [
            pool.submit(refund_worker)
            for _ in range(refund_count)
        ]

        response = action.result(timeout=60)

        results = [
            future.result(timeout=60)
            for future in refunds
        ]

    assert sum(
        x["applied"] is True for x in results
    ) == 1

    assert sum(
        x["duplicate"] is True for x in results
    ) == refund_count - 1

    return response


def verify_refund(engine, key, amount, full):
    with Session(engine) as db:
        lot = db.get(NobilityPointLot, key)

        assert lot.refunded_points == amount
        assert lot.refunded == full

        events = db.scalars(
            select(NobilityRefundEvent)
        ).all()

        assert len(events) == 1
        assert events[0].lot_event_key == key
        assert events[0].refunded_points == amount

        member = db.get(NobilityMembership, "u1")
        assert member.points >= 0


@pytest.mark.parametrize("refund_count", [1, 4])
def test_activation_full_refund(
    client, engine, refund_count
):
    credit(engine, 400_000, "purchase1")

    status, data = run_race(
        client,
        engine,
        ACTIVATE,
        1,
        "purchase1",
        refund_count=refund_count,
    )

    if status == 200:
        assert data["applied"]
        verify(engine, 0, 0, 2)
    else:
        assert status == 409
        assert data["detail"] == "stale_confirmation"
        verify(engine, 0, 0, 1)

    verify_refund(
        engine, "purchase1", 400_000, True
    )

    with Session(engine) as db:
        assert not has_privilege(
            db, "u1", "badge"
        )


@pytest.mark.parametrize("refund_count", [1, 4])
def test_king_activation_partial_refund(
    client, engine, refund_count
):
    credit(engine, 3_200_000, "purchase1")

    status, data = run_race(
        client,
        engine,
        ACTIVATE,
        4,
        "purchase1",
        points=200_000,
        refund_count=refund_count,
    )

    if status == 200:
        assert data["applied"]
        verify(engine, 3, 0, 2)
    else:
        assert status == 409
        assert data["detail"] == "stale_confirmation"
        verify(engine, 0, 3_000_000, 1)

    verify_refund(
        engine, "purchase1", 200_000, False
    )

    with Session(engine) as db:
        assert not has_privilege(
            db, "u1", "super_kick"
        )


@pytest.mark.parametrize("refund_count", [1, 4])
def test_upgrade_full_refund(
    client, engine, refund_count
):
    credit(engine, 400_000, "initial")
    activate(client)

    credit(engine, 3_200_000, "upgradefund")

    status, data = run_race(
        client,
        engine,
        UPGRADE,
        4,
        "upgradefund",
        refund_count=refund_count,
    )

    if status == 200:
        assert data["applied"]
        verify(engine, 0, 0, 3)
    else:
        assert status == 409
        assert data["detail"] == "stale_confirmation"
        verify(engine, 1, 0, 2)

    verify_refund(
        engine, "upgradefund", 3_200_000, True
    )

    with Session(engine) as db:
        assert not has_privilege(
            db, "u1", "super_kick"
        )


@pytest.mark.parametrize("refund_count", [1, 4])
def test_upgrade_partial_refund(
    client, engine, refund_count
):
    credit(engine, 400_000, "initial")
    activate(client)

    credit(engine, 3_200_000, "upgradefund")

    status, data = run_race(
        client,
        engine,
        UPGRADE,
        4,
        "upgradefund",
        points=200_000,
        refund_count=refund_count,
    )

    if status == 200:
        assert data["applied"]
        verify(engine, 3, 0, 3)
    else:
        assert status == 409
        assert data["detail"] == "stale_confirmation"
        verify(engine, 1, 3_000_000, 2)

    verify_refund(
        engine, "upgradefund", 200_000, False
    )

    with Session(engine) as db:
        assert not has_privilege(
            db, "u1", "super_kick"
        )


@pytest.mark.parametrize("refund_count", [1, 4])
def test_renewal_full_refund(
    client, engine, refund_count
):
    credit(engine, 3_200_000, "initial")
    activate(client, 4)

    original_expiry = expiry(engine)

    credit(engine, 800_000, "renewfund")

    status, data = run_race(
        client,
        engine,
        RENEW,
        4,
        "renewfund",
        refund_count=refund_count,
    )

    if status == 200:
        assert data["applied"]
        verify(engine, 4, 0, 3)
    else:
        assert status == 409
        assert data["detail"] == "stale_confirmation"
        verify(engine, 4, 0, 2)

    assert expiry(engine) == original_expiry

    verify_refund(
        engine, "renewfund", 800_000, True
    )

    with Session(engine) as db:
        assert has_privilege(
            db, "u1", "super_kick"
        )


@pytest.mark.parametrize("refund_count", [1, 4])
def test_renewal_partial_refund(
    client, engine, refund_count
):
    credit(engine, 3_200_000, "initial")
    activate(client, 4)

    original_expiry = expiry(engine)

    credit(engine, 800_000, "renewfund")

    status, data = run_race(
        client,
        engine,
        RENEW,
        4,
        "renewfund",
        points=100_000,
        refund_count=refund_count,
    )

    if status == 200:
        assert data["applied"]
        verify(engine, 4, 0, 3)
    else:
        assert status == 409
        assert data["detail"] == "stale_confirmation"
        verify(engine, 4, 700_000, 2)

    assert expiry(engine) == original_expiry

    verify_refund(
        engine, "renewfund", 100_000, False
    )

    with Session(engine) as db:
        assert has_privilege(
            db, "u1", "super_kick"
        )
