"""LidyaChat V2: BT/LB transfer history and receipt security."""
import pytest
from uuid import uuid4
from sqlalchemy import select

from backend.app.models import User
from backend.app import dealer_routes as dealers
from backend.app.dealer_referrals import LBReferral
from backend.tests.test_dealer_security_v6 import DealerSecurityTests


@pytest.fixture
def env():
    DealerSecurityTests.setUpClass()
    case = DealerSecurityTests(
        methodName="test_01_zero_stock_cannot_send"
    )
    case.setUp()
    try:
        yield case
    finally:
        case.tearDown()


def linked_bt(case):
    link = case.db.get(LBReferral, case.dealer.id)
    assert link is not None, "BT/LB test bağlantısı yok"
    bt = case.db.get(User, link.bt_user_id)
    assert bt is not None
    return bt


def make_transfer(case):
    tx = dealers.DealerTransfer(
        id=str(uuid4()),
        dealer_id=case.dealer.id,
        recipient_id=case.recipient.id,
        amount=1000,
        request_key=str(uuid4())
    )
    case.db.add(tx)
    case.db.commit()
    case.db.refresh(tx)
    return tx


def test_linked_bt_can_view_history(env):
    bt = linked_bt(env)
    make_transfer(env)
    result = env.routes[
        "/v1/dealers/representatives/team-history"
    ](
        public_id=env.dealer.public_id,
        page=1,
        db=env.db,
        user=bt
    )
    assert result["total"] == 1
    assert result["items"][0]["amount"] == 1000


def test_stranger_cannot_view_team_history(env):
    make_transfer(env)
    with pytest.raises(Exception):
        env.routes[
            "/v1/dealers/representatives/team-history"
        ](
            public_id=env.dealer.public_id,
            page=1,
            db=env.db,
            user=env.stranger
        )


def test_linked_bt_can_view_receipt(env):
    bt = linked_bt(env)
    tx = make_transfer(env)
    result = env.routes[
        "/v1/dealers/transfers/{transfer_id}/receipt"
    ](
        transfer_id=tx.id,
        db=env.db,
        user=bt
    )
    assert result["receipt"]["amount"] == 1000


def test_stranger_cannot_view_receipt(env):
    tx = make_transfer(env)
    with pytest.raises(Exception):
        env.routes[
            "/v1/dealers/transfers/{transfer_id}/receipt"
        ](
            transfer_id=tx.id,
            db=env.db,
            user=env.stranger
        )


def test_da_can_view_receipt(env):
    tx = make_transfer(env)
    result = env.routes[
        "/v1/dealers/transfers/{transfer_id}/receipt"
    ](
        transfer_id=tx.id,
        db=env.db,
        user=env.da
    )
    assert result["receipt"]["transaction_id"] == tx.id


def test_receipt_excludes_private_fields(env):
    tx = make_transfer(env)
    result = env.routes[
        "/v1/dealers/transfers/{transfer_id}/receipt"
    ](
        transfer_id=tx.id,
        db=env.db,
        user=env.da
    )
    receipt = result["receipt"]
    forbidden = {
        "email", "phone", "password",
        "iban", "real_name", "balance"
    }
    assert forbidden.isdisjoint(receipt.keys())


def test_unrelated_bt_cannot_access_transactions(env):
    from fastapi import HTTPException

    tx = make_transfer(env)

    other_bt = env.user("other_bt_v2", "999999777")
    env.db.add_all([
        dealers.DealerInventory(
            user_id=other_bt.id,
            stock=0,
            active=True
        ),
        dealers.DealerDesignation(
            user_id=other_bt.id,
            kind="support"
        )
    ])
    env.db.commit()

    history = env.routes[
        "/v1/dealers/representatives/team-history"
    ]
    receipt = env.routes[
        "/v1/dealers/transfers/{transfer_id}/receipt"
    ]

    with pytest.raises(HTTPException) as h:
        history(
            public_id=env.dealer.public_id,
            page=1,
            db=env.db,
            user=other_bt
        )
    assert h.value.status_code == 404

    with pytest.raises(HTTPException) as r:
        receipt(
            transfer_id=tx.id,
            db=env.db,
            user=other_bt
        )
    assert r.value.status_code in (403, 404)


def test_da_can_view_representative_link(env):
    result = env.routes[
        "/v1/dealers/admin/representative-link"
    ](
        public_id=env.dealer.public_id,
        db=env.db,
        user=env.da
    )
    assert len(result["items"]) == 1
    assert result["items"][0]["public_id"] == linked_bt(env).public_id


def test_non_da_cannot_view_representative_link(env):
    from fastapi import HTTPException

    endpoint = env.routes[
        "/v1/dealers/admin/representative-link"
    ]

    for person in (env.dealer, linked_bt(env), env.stranger):
        with pytest.raises(HTTPException) as exc:
            endpoint(
                public_id=env.dealer.public_id,
                db=env.db,
                user=person
            )
        assert exc.value.status_code == 403


def test_admin_link_excludes_private_information(env):
    result = env.routes[
        "/v1/dealers/admin/representative-link"
    ](
        public_id=env.dealer.public_id,
        db=env.db,
        user=env.da
    )

    forbidden = {
        "email", "phone", "password",
        "iban", "balance", "stock"
    }

    assert forbidden.isdisjoint(result["items"][0].keys())


def test_v4_transfer_requires_evidence(env):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        dealers.TransferBody(
            recipient_public_id=env.recipient.public_id,
            amount=1000,
            request_key=str(uuid4())
        )


def make_v4_evidence(env, tx):
    from backend.app.dealer_evidence_v3 import validate_evidence
    from backend.tests.test_dealer_security_v6 import TEST_EVIDENCE

    data = validate_evidence(TEST_EVIDENCE)

    env.db.add(dealers.DealerTransferEvidence(
        transfer_id=tx.id,
        uploaded_by=env.dealer.id,
        mime_type=data["mime_type"],
        filename="test-dekont.png",
        sha256=data["sha256"],
        content=data["content"]
    ))
    env.db.commit()
    return data["content"]


def test_v4_unrelated_user_cannot_download_evidence(env):
    from fastapi import HTTPException

    tx = make_transfer(env)
    make_v4_evidence(env, tx)

    endpoint = env.routes[
        "/v1/dealers/transfers/{transfer_id}/evidence"
    ]

    with pytest.raises(HTTPException) as exc:
        endpoint(
            transfer_id=tx.id,
            db=env.db,
            user=env.stranger
        )

    assert exc.value.status_code == 403


def test_v4_linked_bt_can_download_evidence(env):
    bt = linked_bt(env)
    tx = make_transfer(env)
    original = make_v4_evidence(env, tx)

    response = env.routes[
        "/v1/dealers/transfers/{transfer_id}/evidence"
    ](
        transfer_id=tx.id,
        db=env.db,
        user=bt
    )

    assert response.status_code == 200
    assert response.body == original
    assert response.media_type == "image/png"
    assert response.headers["cache-control"] == "private, no-store"
