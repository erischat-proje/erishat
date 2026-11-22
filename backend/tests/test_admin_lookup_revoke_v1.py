"""DA bayi sorgulama ekranı yetki kaldırma güvenlik testleri."""
import pytest
from fastapi import HTTPException

from backend.app import dealer_routes as dealers
from backend.tests.test_dealer_representatives_v2 import env, linked_bt

PATH = "/v1/dealers/admin/revoke"

def revoke(case, target, actor):
    return case.routes[PATH](
        body=dealers.RevokeBody(
            public_id=target.public_id,
            confirm_public_id=target.public_id
        ),
        db=case.db,
        user=actor
    )

def test_da_revokes_bt_and_preserves_stock(env):
    bt = linked_bt(env)
    inventory = env.db.get(dealers.DealerInventory, bt.id)
    inventory.stock = 250
    env.db.commit()

    result = revoke(env, bt, env.da)
    env.db.expire_all()

    assert result["active"] is False
    assert result["preserved_stock"] == 250
    assert env.db.get(dealers.DealerInventory, bt.id).active is False
    assert env.db.get(dealers.DealerDesignation, bt.id) is None

    with pytest.raises(HTTPException) as exc:
        env.routes["/v1/dealers/me"](db=env.db, user=bt)
    assert exc.value.status_code == 403

def test_da_revokes_lb(env):
    result = revoke(env, env.dealer, env.da)
    assert result["active"] is False
    assert env.db.get(dealers.DealerInventory, env.dealer.id).active is False

def test_non_da_cannot_revoke(env):
    bt = linked_bt(env)
    for actor in (env.dealer, bt, env.stranger):
        with pytest.raises(HTTPException) as exc:
            revoke(env, bt, actor)
        assert exc.value.status_code == 403
