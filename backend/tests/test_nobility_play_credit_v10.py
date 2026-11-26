"""Google Play atomic nobility credit tests."""

from hashlib import sha256
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import User
from backend.app.admin_models import AdminRole
from backend.app.system_data import LidyaLedger

from backend.app.play_billing_models import PlayPurchaseRecord
from backend.app.play_refund_models import PlayRefundCase
from backend.app.nobility_models import (
    NobilityMembership,
    NobilityPointLot,
    NobilityPointsLedger,
)
from backend.app import play_fulfillment as fulfillment
from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine
from backend.tests.test_nobility_integrity_v10 import verify_integrity


@pytest.fixture
def play_engine(engine, monkeypatch):
    PlayPurchaseRecord.__table__.create(
        engine, checkfirst=True
    )
    PlayRefundCase.__table__.create(
        engine, checkfirst=True
    )

    monkeypatch.setattr(
        fulfillment.settings,
        "google_play_billing_enabled",
        True,
    )
    monkeypatch.setattr(
        fulfillment.settings,
        "google_play_fulfillment_enabled",
        True,
    )
    monkeypatch.setattr(
        fulfillment.settings,
        "google_play_test_mode",
        False,
    )

    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "true"
    )
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_PAID_POINTS_ENABLED", "true"
    )

    return engine


def prepare(db, token="test-token", test=False):
    user = db.get(User, "u1")
    user.lidya = 0

    row = PlayPurchaseRecord(
        token_sha256=sha256(token.encode()).hexdigest(),
        user_id="u1",
        product_id="lidya_016",
        google_order_id="GPA.TEST." + token,
        purchase_status="verified_no_credit",
        test_purchase=test,
    )

    db.add(row)
    db.commit()

    return row.id


def deliver(db, receipt_id, user="u1", product="lidya_016"):
    return fulfillment.credit_verified_purchase(
        db,
        receipt_id=receipt_id,
        user_id=user,
        product_id=product,
    )


def verify(db, receipt_id, coins, points, status="credited"):
    user = db.get(User, "u1", populate_existing=True)
    member = db.get(
        NobilityMembership,
        "u1",
        populate_existing=True,
    )
    receipt = db.get(
        PlayPurchaseRecord,
        receipt_id,
        populate_existing=True,
    )

    assert int(user.lidya) == coins
    assert (member.points if member else 0) == points
    assert receipt.purchase_status == status

    verify_integrity(db)


def test_real_purchase_bonus_included(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)
        result = deliver(db, rid)

        assert result["credited"]
        assert result["amount"] == 204000
        assert result["nobility_points"] == 204000

        verify(db, rid, 204000, 204000)

        receipt = db.get(PlayPurchaseRecord, rid)

        key = f"nobility:play:{receipt.token_sha256}"

        lot = db.get(NobilityPointLot, key)
        ledger = db.get(NobilityPointsLedger, key)

        assert lot.original_points == 204000
        assert ledger.source == "google_play_purchase"

        entries = db.scalars(
            select(LidyaLedger).where(
                LidyaLedger.user_id == "u1",
                LidyaLedger.operation == "google_play_credit",
                LidyaLedger.reference_id == f"play:{rid}",
            )
        ).all()

        assert len(entries) == 1
        assert entries[0].delta == 204000
        assert entries[0].balance_after == 204000
        assert entries[0].details == "product=lidya_016"



def test_license_purchase_no_points(
    play_engine, monkeypatch
):
    monkeypatch.setattr(
        fulfillment.settings,
        "google_play_test_mode",
        True,
    )

    with Session(play_engine) as db:
        rid = prepare(db, test=True)
        result = deliver(db, rid)

        assert result["nobility_points"] == 0
        verify(db, rid, 204000, 0)


@pytest.mark.parametrize("flag", [
    "LIDYACHAT_NOBILITY_ENABLED",
    "LIDYACHAT_NOBILITY_PAID_POINTS_ENABLED",
])
def test_disabled_switch(
    play_engine, monkeypatch, flag
):
    monkeypatch.setenv(flag, "false")

    with Session(play_engine) as db:
        rid = prepare(db)
        result = deliver(db, rid)

        assert result["nobility_points"] == 0
        verify(db, rid, 204000, 0)


def test_default_paid_switch_off(
    play_engine, monkeypatch
):
    monkeypatch.delenv(
        "LIDYACHAT_NOBILITY_PAID_POINTS_ENABLED",
        raising=False,
    )

    with Session(play_engine) as db:
        rid = prepare(db)
        result = deliver(db, rid)

        assert result["nobility_points"] == 0
        verify(db, rid, 204000, 0)


def test_duplicate_receipt(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)

        deliver(db, rid)
        second = deliver(db, rid)

        assert second["already_credited"]

        verify(db, rid, 204000, 204000)


def test_no_retroactive_credit(
    play_engine, monkeypatch
):
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_PAID_POINTS_ENABLED",
        "false",
    )

    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

        monkeypatch.setenv(
            "LIDYACHAT_NOBILITY_PAID_POINTS_ENABLED",
            "true",
        )

        result = deliver(db, rid)

        assert result["already_credited"]
        verify(db, rid, 204000, 0)


def test_refunded_receipt_blocked(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)

        db.add(PlayRefundCase(
            receipt_id=rid,
            user_id="u1",
            product_id="lidya_016",
            status="pending",
        ))
        db.commit()

        with pytest.raises(HTTPException) as exc:
            deliver(db, rid)

        assert exc.value.status_code == 409

        verify(
            db, rid, 0, 0,
            "verified_no_credit",
        )


@pytest.mark.parametrize("user,product", [
    ("u2", "lidya_016"),
    ("u1", "lidya_015"),
])
def test_identity_mismatch(
    play_engine, user, product
):
    with Session(play_engine) as db:
        rid = prepare(db)

        with pytest.raises(HTTPException) as exc:
            deliver(db, rid, user, product)

        assert exc.value.status_code == 409

        verify(
            db, rid, 0, 0,
            "verified_no_credit",
        )


def test_wallet_limit(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)

        user = db.get(User, "u1")
        user.lidya = fulfillment.LIMIT
        db.commit()

        with pytest.raises(HTTPException) as exc:
            deliver(db, rid)

        assert exc.value.status_code == 409

        verify(
            db, rid, fulfillment.LIMIT, 0,
            "verified_no_credit",
        )


def test_nobility_failure_rolls_back(
    play_engine, monkeypatch
):
    original = fulfillment.apply_points

    def fail_after_credit(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError("Injected nobility failure")

    monkeypatch.setattr(
        fulfillment,
        "apply_points",
        fail_after_credit,
    )

    with Session(play_engine) as db:
        rid = prepare(db)

        with pytest.raises(RuntimeError):
            deliver(db, rid)

        verify(
            db, rid, 0, 0,
            "verified_no_credit",
        )


def test_commit_failure_rolls_back(
    play_engine, monkeypatch
):
    with Session(play_engine) as db:
        rid = prepare(db)

        def fail_commit():
            db.flush()
            raise RuntimeError("Injected commit failure")

        with monkeypatch.context() as patch:
            patch.setattr(db, "commit", fail_commit)

            with pytest.raises(RuntimeError):
                deliver(db, rid)

        verify(
            db, rid, 0, 0,
            "verified_no_credit",
        )


def test_concurrent_duplicate_purchase(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)

    barrier = Barrier(2)

    def worker():
        with Session(play_engine) as db:
            barrier.wait(timeout=15)
            return deliver(db, rid)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(worker)
        second = pool.submit(worker)

        results = [
            first.result(timeout=30),
            second.result(timeout=30),
        ]

    assert sum(
        bool(r["credited"]) for r in results
    ) == 1

    assert sum(
        bool(r["already_credited"]) for r in results
    ) == 1

    with Session(play_engine) as db:
        verify(db, rid, 204000, 204000)
