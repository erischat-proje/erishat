"""LidyaChat - DA kayıtlı BT listesi güvenlik testleri."""
from datetime import datetime, timezone, timedelta

import pytest
from fastapi import HTTPException

from backend.app import dealer_routes as dealers
from backend.tests.test_dealer_representatives_v2 import (
    env, linked_bt
)


PATH = "/v1/dealers/admin/registered-representatives"


def test_da_lists_only_registered_bt(env):
    result = env.routes[PATH](db=env.db, user=env.da)
    ids = {item["public_id"] for item in result["items"]}

    assert linked_bt(env).public_id in ids
    assert env.dealer.public_id not in ids
    assert env.stranger.public_id not in ids
    assert result["total"] == len(result["items"])


def test_non_da_cannot_list_bt(env):
    for person in (env.dealer, linked_bt(env), env.stranger):
        with pytest.raises(HTTPException) as exc:
            env.routes[PATH](db=env.db, user=person)
        assert exc.value.status_code == 403


def test_bt_online_status_and_privacy(env):
    bt = linked_bt(env)

    presence = env.db.get(
        dealers.DealerRepresentativePresence, bt.id
    )

    if presence is None:
        presence = dealers.DealerRepresentativePresence(
            user_id=bt.id,
            last_seen_at=datetime.now(timezone.utc)
        )
        env.db.add(presence)
    else:
        presence.last_seen_at = datetime.now(timezone.utc)

    env.db.flush()

    result = env.routes[PATH](db=env.db, user=env.da)
    item = next(
        x for x in result["items"]
        if x["public_id"] == bt.public_id
    )

    assert item["online"] is True
    assert result["online_count"] >= 1

    forbidden = {
        "email", "phone", "password",
        "iban", "balance", "stock"
    }
    assert forbidden.isdisjoint(item.keys())

    presence.last_seen_at = (
        datetime.now(timezone.utc) - timedelta(minutes=5)
    )
    env.db.flush()

    result = env.routes[PATH](db=env.db, user=env.da)
    item = next(
        x for x in result["items"]
        if x["public_id"] == bt.public_id
    )

    assert item["online"] is False
