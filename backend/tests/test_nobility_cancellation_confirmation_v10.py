"""Cancellation with durable financial confirmation."""

import pytest

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.nobility_cancellation import (
    cancel_action,
)

from backend.app.nobility_requests import (
    NobilityCancellationRequest,
)

from backend.app.nobility_models import (
    NobilityActionConfirmation,
    NobilityActionRejection,
    NobilityPointsLedger,
)

from nobility_confirmation_helpers import (
    confirmed_payload,
)

from test_nobility_postgres_v1 import scoped_db

from test_nobility_activation_v10 import (
    engine,
    fund,
)

from test_nobility_activation_api_v10 import (
    client,
    BASE,
    H1,
)


def prepare(client, engine, action="activate"):
    fund(engine, 4000000)

    if action != "activate":
        response = client.post(
            BASE + "/activate",
            headers=H1,
            json=confirmed_payload(
                client, 1, action="activate"
            ),
        )

        assert response.status_code == 200

    rank = 2 if action == "upgrade" else 1

    body = confirmed_payload(
        client, rank, action=action
    )

    response = client.post(
        BASE + "/" + action,
        headers=H1,
        json=body,
    )

    assert response.status_code == 200

    return {
        **body,
        "action": action,
        "user_id": "u1",
    }


def cancel(engine, body):
    with Session(engine) as db:
        return cancel_action(
            db,
            "u1",
            NobilityCancellationRequest(**body),
        )


@pytest.mark.parametrize(
    "action",
    ["activate", "upgrade", "renew"],
)
def test_completed_confirmation(
    client, engine, action
):
    body = prepare(client, engine, action)

    before = client.get(
        BASE + "/me",
        headers=H1,
    ).json()

    for _ in range(2):
        result = cancel(engine, body)

        assert result["status"] == "completed"
        assert result["duplicate"] is True
        assert result["confirmed_revision"] == (
            body["confirmed_revision"]
        )

    after = client.get(
        BASE + "/me",
        headers=H1,
    ).json()

    assert before == after

    with Session(engine) as db:
        assert db.get(
            NobilityActionConfirmation,
            ("u1", body["request_id"]),
        ) is not None

        assert db.get(
            NobilityActionRejection,
            ("u1", body["request_id"]),
        ) is None


@pytest.mark.parametrize(
    "changes",
    [
        {"confirmed_revision": "b" * 64},
        {"confirmed_cost": "400001"},
        {"rank": 2},
        {"action": "upgrade"},
        {"action": "renew"},
    ],
)
def test_changed_completed_confirmation(
    client, engine, changes
):
    body = prepare(client, engine)

    before = client.get(
        BASE + "/me",
        headers=H1,
    ).json()

    changed = dict(body)
    changed.update(changes)

    with pytest.raises(HTTPException) as exc:
        cancel(engine, changed)

    assert exc.value.status_code == 409
    assert exc.value.detail == "request_conflict"

    assert client.get(
        BASE + "/me",
        headers=H1,
    ).json() == before


def test_legacy_confirmation_unavailable(
    client, engine
):
    body = prepare(client, engine)

    with Session(engine) as db:
        record = db.get(
            NobilityActionConfirmation,
            ("u1", body["request_id"]),
        )

        event_key = record.event_key

        db.delete(record)
        db.commit()

    with pytest.raises(HTTPException) as exc:
        cancel(engine, body)

    assert exc.value.status_code == 409
    assert exc.value.detail == (
        "confirmation_unavailable"
    )

    with Session(engine) as db:
        assert db.get(
            NobilityPointsLedger,
            event_key,
        ) is not None

        assert db.get(
            NobilityActionRejection,
            ("u1", body["request_id"]),
        ) is None

        assert db.get(
            NobilityActionConfirmation,
            ("u1", body["request_id"]),
        ) is None
