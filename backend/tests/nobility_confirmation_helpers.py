"""Shared nobility HTTP confirmation helpers."""

from uuid import uuid4


FULL_COSTS = {
    1: 400000,
    2: 800000,
    3: 1600000,
    4: 3200000,
}


def confirmed_payload(
    client,
    rank=1,
    key=None,
    *,
    action="activate",
    headers=None,
):
    if headers is None:
        headers = {
            "Authorization": "Bearer test-u1",
        }

    assert action in (
        "activate",
        "upgrade",
        "renew",
    )

    assert type(rank) is int
    assert rank in FULL_COSTS

    response = client.get(
        "/v1/nobility/me",
        headers=headers,
    )

    assert response.status_code == 200, response.text

    state = response.json()
    revision = state["revision"]

    assert state["ok"] is True
    assert len(revision) == 64
    assert all(
        c in "0123456789abcdef"
        for c in revision
    )

    cost = FULL_COSTS[rank]

    if action == "renew":
        cost //= 4

    return {
        "rank": rank,
        "request_id": key or str(uuid4()),
        "confirmed_revision": revision,
        "confirmed_cost": str(cost),
    }
