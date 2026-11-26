"""Google Play nobility refund integration tests."""

import pytest

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app import play_billing as billing
from backend.app.models import User
from backend.app.play_billing_models import PlayPurchaseRecord
from backend.app.play_refund_models import PlayRefundCase
from backend.app.nobility_models import (
    NobilityPointLot,
    NobilityPointsLedger,
    NobilityRefundEvent,
)

from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine
from backend.tests.test_nobility_play_credit_v10 import (
    play_engine,
    prepare,
    deliver,
    verify,
)


def matched_rows(db, rid, token="test-token", **extra):
    receipt = db.get(PlayPurchaseRecord, rid)

    item = {
        "purchaseToken": token,
        "orderId": receipt.google_order_id,
        "voidedReason": 1,
        "voidedSource": 0,
        "voidedTimeMillis": "1790000000000",
    }

    item.update(extra)

    return billing._voided_audit_rows(
        [item],
        {receipt.token_sha256: receipt},
    )


def synchronize(db, rid):
    rows = matched_rows(db, rid)
    assert len(rows) == 1
    return billing._refund_cases_sync(db, rows)


def source_key(db, rid):
    receipt = db.get(PlayPurchaseRecord, rid)
    return f"nobility:play:{receipt.token_sha256}"


def test_full_refund(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

        result = synchronize(db, rid)

        assert result == {
            "created": 1,
            "nobility_refunded": 1,
        }

        verify(db, rid, 204000, 0)

        lot = db.get(
            NobilityPointLot, source_key(db, rid)
        )

        assert lot.refunded is True
        assert lot.refunded_points == 204000
        assert lot.remaining_points == 0


def test_duplicate_refund(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

        synchronize(db, rid)
        result = synchronize(db, rid)

        assert result == {
            "created": 0,
            "nobility_refunded": 0,
        }

        events = db.scalars(
            select(NobilityRefundEvent)
        ).all()

        assert len(events) == 1
        verify(db, rid, 204000, 0)


@pytest.mark.parametrize("flag", [
    "LIDYACHAT_NOBILITY_ENABLED",
    "LIDYACHAT_NOBILITY_PAID_POINTS_ENABLED",
])
def test_refund_when_disabled(
    play_engine, monkeypatch, flag
):
    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

        monkeypatch.setenv(flag, "false")

        result = synchronize(db, rid)

        assert result["nobility_refunded"] == 1
        verify(db, rid, 204000, 0)


def test_historical_purchase(
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

        result = synchronize(db, rid)

        assert result["created"] == 1
        assert result["nobility_refunded"] == 0
        verify(db, rid, 204000, 0)


def test_license_purchase(
    play_engine, monkeypatch
):
    from backend.app import play_fulfillment

    monkeypatch.setattr(
        play_fulfillment.settings,
        "google_play_test_mode",
        True,
    )

    with Session(play_engine) as db:
        rid = prepare(db, test=True)
        deliver(db, rid)

        result = synchronize(db, rid)

        assert result["created"] == 1
        assert result["nobility_refunded"] == 0
        verify(db, rid, 204000, 0)


def test_refund_before_delivery(play_engine):
    from fastapi import HTTPException

    with Session(play_engine) as db:
        rid = prepare(db)

        result = synchronize(db, rid)

        assert result["created"] == 1
        assert result["nobility_refunded"] == 0

        with pytest.raises(HTTPException) as exc:
            deliver(db, rid)

        assert exc.value.status_code == 409

        verify(
            db, rid, 0, 0,
            status="verified_no_credit",
        )


@pytest.mark.parametrize("field,value", [
    ("orderId", None),
    ("orderId", ""),
    ("orderId", "GPA.WRONG"),
    ("voidedQuantity", 0),
    ("voidedQuantity", 2),
    ("voidedQuantity", True),
])
def test_invalid_google_identity(
    play_engine, field, value
):
    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

        rows = matched_rows(
            db, rid, **{field: value}
        )

        assert rows == []
        verify(db, rid, 204000, 204000)


def test_wrong_account_rejected(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

        rows = matched_rows(db, rid)
        rows[0]["user_id"] = "u2"

        with pytest.raises(
            RuntimeError,
            match="Refund receipt mismatch",
        ):
            billing._refund_cases_sync(db, rows)

        verify(db, rid, 204000, 204000)

        assert db.scalars(
            select(PlayRefundCase)
        ).all() == []


def test_existing_review_preserved(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

        case = PlayRefundCase(
            receipt_id=rid,
            user_id="u1",
            product_id="lidya_016",
            voided_at_ms="1790000000000",
            voided_reason="1",
            voided_source="0",
            status="reviewed",
            review_note="Existing DA decision",
        )

        db.add(case)
        db.commit()

        cid = case.id
        result = synchronize(db, rid)

        assert result["created"] == 0
        assert result["nobility_refunded"] == 1

        case = db.get(
            PlayRefundCase,
            cid,
            populate_existing=True,
        )

        assert case.status == "reviewed"
        assert case.review_note == "Existing DA decision"

        verify(db, rid, 204000, 0)


# V10.8.1.4.2 - Rank and renewal integration.

from datetime import timedelta

from backend.app.nobility_models import (
    NobilityMembership,
    NobilityRenewalFunding,
)
from backend.app.nobility_engine import (
    activate_rank,
    renew_rank,
)
from backend.app.nobility_policy import effective_rank
from backend.tests.test_nobility_integrity_v10 import (
    verify_integrity,
)


def buy_packages(db, count, prefix):
    purchases = []

    for index in range(count):
        token = f"{prefix}-{index}"

        receipt = PlayPurchaseRecord(
            token_sha256=__import__(
                "hashlib"
            ).sha256(token.encode()).hexdigest(),
            user_id="u1",
            product_id="lidya_016",
            google_order_id="GPA.TEST." + token,
            purchase_status="verified_no_credit",
            test_purchase=False,
        )

        db.add(receipt)
        db.commit()

        rid = receipt.id
        result = deliver(db, rid)

        assert result["credited"] is True
        assert result["nobility_points"] == 204000

        purchases.append((rid, token))

    return purchases


def refund_packages(db, purchases):
    rows = []

    for rid, token in purchases:
        matched = matched_rows(db, rid, token)
        assert len(matched) == 1
        rows.extend(matched)

    return billing._refund_cases_sync(db, rows)


def activate_king(db):
    user = db.get(User, "u1")
    user.lidya = 0
    db.commit()

    purchases = buy_packages(db, 16, "king")

    result = activate_rank(
        db, "u1", 4, "king-activation"
    )
    db.commit()

    assert result["applied"] is True

    member = db.get(
        NobilityMembership, "u1",
        populate_existing=True,
    )

    assert effective_rank(member) == 4
    assert member.points == 64000

    return purchases, member.expires_at


@pytest.mark.parametrize("count,expected_rank", [
    (4, 3),
    (9, 2),
    (12, 1),
    (14, 0),
])
def test_play_refund_rank_downgrade(
    play_engine, count, expected_rank
):
    with Session(play_engine) as db:
        purchases, expiry = activate_king(db)

        result = refund_packages(
            db, purchases[:count]
        )

        assert result["created"] == count
        assert result["nobility_refunded"] == count

        member = db.get(
            NobilityMembership, "u1",
            populate_existing=True,
        )

        assert member.rank == expected_rank
        assert effective_rank(member) == expected_rank
        assert member.points == 64000

        if expected_rank:
            assert member.expires_at == expiry
        else:
            assert member.started_at is None
            assert member.expires_at is None

        user = db.get(
            User, "u1", populate_existing=True
        )

        assert int(user.lidya) == 3264000

        verify_integrity(db)


def test_play_refund_unused_points_only(play_engine):
    with Session(play_engine) as db:
        purchases, expiry = activate_king(db)

        extra = buy_packages(db, 1, "unused")

        result = refund_packages(db, extra)

        assert result["nobility_refunded"] == 1

        member = db.get(
            NobilityMembership, "u1",
            populate_existing=True,
        )

        assert effective_rank(member) == 4
        assert member.expires_at == expiry
        assert member.points == 64000

        verify_integrity(db)


def test_play_refund_renewal_duration(play_engine):
    with Session(play_engine) as db:
        purchases, expiry = activate_king(db)

        renewal = buy_packages(db, 4, "renewal")

        result = renew_rank(
            db, "u1", 4, "king-renewal"
        )
        db.commit()

        assert result["applied"] is True

        member = db.get(
            NobilityMembership, "u1",
            populate_existing=True,
        )

        assert member.expires_at == (
            expiry + timedelta(days=30)
        )

        result = refund_packages(db, renewal[:1])

        assert result["nobility_refunded"] == 1

        member = db.get(
            NobilityMembership, "u1",
            populate_existing=True,
        )

        assert member.rank == 4
        assert member.expires_at == expiry

        funding = db.scalars(
            select(NobilityRenewalFunding)
        ).all()

        assert len(funding) == 1
        assert funding[0].revoked is True

        verify_integrity(db)

        # Same receipt cannot remove another 30 days.
        duplicate = refund_packages(db, renewal[:1])

        assert duplicate["nobility_refunded"] == 0

        # Another source of the same renewal must not
        # remove the renewal period a second time.
        second = refund_packages(db, renewal[1:2])

        assert second["nobility_refunded"] == 1

        member = db.get(
            NobilityMembership, "u1",
            populate_existing=True,
        )

        assert effective_rank(member) == 4
        assert member.expires_at == expiry

        user = db.get(
            User, "u1", populate_existing=True
        )

        assert int(user.lidya) == 4080000

        verify_integrity(db)


# V10.8.1.4.3 - Concurrency and atomic rollback.

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from fastapi import HTTPException

from backend.app import nobility_play_refunds


def test_concurrent_duplicate_refund(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

    barrier = Barrier(2, timeout=15)

    def worker():
        with Session(play_engine) as db:
            rows = matched_rows(db, rid)
            barrier.wait()
            return billing._refund_cases_sync(
                db, rows
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(worker)
            for _ in range(2)
        ]
        results = [
            future.result(timeout=30)
            for future in futures
        ]

    assert sum(
        r["created"] for r in results
    ) == 1

    assert sum(
        r["nobility_refunded"] for r in results
    ) == 1

    with Session(play_engine) as db:
        verify(db, rid, 204000, 0)

        assert len(db.scalars(
            select(PlayRefundCase)
        ).all()) == 1

        assert len(db.scalars(
            select(NobilityRefundEvent)
        ).all()) == 1


def test_concurrent_delivery_and_refund(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)

    barrier = Barrier(2, timeout=15)

    def delivery_worker():
        with Session(play_engine) as db:
            barrier.wait()

            try:
                result = deliver(db, rid)
                assert result["credited"] is True
                return True
            except HTTPException as exc:
                assert exc.status_code == 409
                return False

    def refund_worker():
        with Session(play_engine) as db:
            rows = matched_rows(db, rid)
            barrier.wait()

            return billing._refund_cases_sync(
                db, rows
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        delivery = pool.submit(delivery_worker)
        refund = pool.submit(refund_worker)

        delivered = delivery.result(timeout=30)
        result = refund.result(timeout=30)

    assert result["created"] == 1
    assert result["nobility_refunded"] == int(
        delivered
    )

    with Session(play_engine) as db:
        verify(
            db, rid,
            204000 if delivered else 0,
            0,
            status=(
                "credited" if delivered
                else "verified_no_credit"
            ),
        )

        with pytest.raises(HTTPException) as exc:
            deliver(db, rid)

        assert exc.value.status_code == 409


def test_refund_failure_rollback(
    play_engine, monkeypatch
):
    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

        original = nobility_play_refunds.refund_points

        def fail_after_refund(*args, **kwargs):
            original(*args, **kwargs)
            raise RuntimeError("Injected refund failure")

        monkeypatch.setattr(
            nobility_play_refunds,
            "refund_points",
            fail_after_refund,
        )

        with pytest.raises(
            RuntimeError,
            match="Injected refund failure",
        ):
            synchronize(db, rid)

        verify(db, rid, 204000, 204000)

        assert db.scalars(
            select(PlayRefundCase)
        ).all() == []

        assert db.scalars(
            select(NobilityRefundEvent)
        ).all() == []

        lot = db.get(
            NobilityPointLot, source_key(db, rid)
        )

        assert lot.refunded is False
        assert lot.refunded_points == 0

        monkeypatch.setattr(
            nobility_play_refunds,
            "refund_points",
            original,
        )

        result = synchronize(db, rid)
        assert result["nobility_refunded"] == 1

        verify(db, rid, 204000, 0)


def test_refund_commit_failure(
    play_engine, monkeypatch
):
    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

        original = db.commit

        def fail_commit():
            db.flush()
            raise RuntimeError("Injected commit failure")

        monkeypatch.setattr(
            db, "commit", fail_commit
        )

        with pytest.raises(
            RuntimeError,
            match="Injected commit failure",
        ):
            synchronize(db, rid)

        monkeypatch.setattr(
            db, "commit", original
        )

        verify(db, rid, 204000, 204000)

        assert db.scalars(
            select(PlayRefundCase)
        ).all() == []

        assert db.scalars(
            select(NobilityRefundEvent)
        ).all() == []

        assert synchronize(
            db, rid
        )["nobility_refunded"] == 1

        verify(db, rid, 204000, 0)


def test_batch_refund_atomicity(
    play_engine, monkeypatch
):
    with Session(play_engine) as db:
        user = db.get(User, "u1")
        user.lidya = 0
        db.commit()

        purchases = buy_packages(
            db, 2, "atomic"
        )

        original = (
            nobility_play_refunds.refund_play_nobility
        )

        calls = []

        def fail_second(db, receipt):
            result = original(db, receipt)
            calls.append(receipt.id)

            if len(calls) == 2:
                raise RuntimeError(
                    "Injected batch failure"
                )

            return result

        monkeypatch.setattr(
            nobility_play_refunds,
            "refund_play_nobility",
            fail_second,
        )

        with pytest.raises(
            RuntimeError,
            match="Injected batch failure",
        ):
            refund_packages(db, purchases)

        assert len(calls) == 2

        for rid, token in purchases:
            verify(db, rid, 408000, 408000)

        assert db.scalars(
            select(PlayRefundCase)
        ).all() == []

        assert db.scalars(
            select(NobilityRefundEvent)
        ).all() == []

        monkeypatch.setattr(
            nobility_play_refunds,
            "refund_play_nobility",
            original,
        )

        result = refund_packages(db, purchases)

        assert result["created"] == 2
        assert result["nobility_refunded"] == 2

        for rid, token in purchases:
            verify(db, rid, 408000, 0)


def test_wrong_product_rejected(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

        rows = matched_rows(db, rid)
        rows[0]["product_id"] = "lidya_001"

        with pytest.raises(
            RuntimeError,
            match="Refund receipt mismatch",
        ):
            billing._refund_cases_sync(db, rows)

        verify(db, rid, 204000, 204000)

        assert db.scalars(
            select(PlayRefundCase)
        ).all() == []


def test_wrong_point_source_rejected(play_engine):
    with Session(play_engine) as db:
        rid = prepare(db)
        deliver(db, rid)

        ledger = db.get(
            NobilityPointsLedger,
            source_key(db, rid),
        )

        ledger.source = "admin_grant"
        db.commit()

        with pytest.raises(
            RuntimeError,
            match="Nobility funding mismatch",
        ):
            synchronize(db, rid)

        member = db.get(
            NobilityMembership, "u1",
            populate_existing=True,
        )

        assert member.points == 204000

        assert db.scalars(
            select(PlayRefundCase)
        ).all() == []

        assert db.scalars(
            select(NobilityRefundEvent)
        ).all() == []

        ledger.source = "google_play_purchase"
        db.commit()

        verify(db, rid, 204000, 204000)

        assert synchronize(
            db, rid
        )["nobility_refunded"] == 1

        verify(db, rid, 204000, 0)
