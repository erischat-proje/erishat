import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest

from sqlalchemy import BigInteger, create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from app.db import Base
from app.models import User
from app.admin_models import AdminRole
from app.platform_models import VipStatus, Notification

from app.purchase_models import LidyaOrder, LidyaOperation
from app.payment_assistance_models import PaymentRequest
from app.play_billing_models import PlayPurchaseRecord
from app.play_refund_models import PlayRefundCase

from app.vip_membership_models import (
    VipMembership,
    VipPurchaseReceipt,
    VipCycleAudit,
)

from app.system_data import LidyaLedger
from app import play_fulfillment as fulfillment


@compiles(BigInteger, "sqlite")
def sqlite_bigint(type_, compiler, **kw):
    return "INTEGER"


TOKEN = "a" * 64


@pytest.fixture(params=["sqlite", "postgres"])
def isolated(request, tmp_path, monkeypatch):
    monkeypatch.setenv(
        "LIDYACHAT_VIP_PLAY_POINTS_ENABLED", "true"
    )
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_ENABLED", "false"
    )
    monkeypatch.setenv(
        "LIDYACHAT_NOBILITY_PAID_POINTS_ENABLED", "false"
    )

    monkeypatch.setattr(
        fulfillment.settings,
        "google_play_billing_enabled", True,
    )
    monkeypatch.setattr(
        fulfillment.settings,
        "google_play_fulfillment_enabled", True,
    )
    monkeypatch.setattr(
        fulfillment.settings,
        "google_play_test_mode", False,
    )

    schema = None

    if request.param == "postgres":
        raw = os.environ.get("SECURITY_TEST_DATABASE_URL", "")
        assert raw

        url = make_url(raw)
        assert url.drivername.startswith("postgresql")
        assert url.host in ("127.0.0.1", "localhost", "::1")
        assert url.database == "lidyachat_security_test"
        assert os.environ.get("VIP_PLAY_AUDIT_CONFIRM") == "YES"

        engine = create_engine(raw, pool_size=8)
        schema = "vipplay_" + uuid.uuid4().hex[:12]

    else:
        engine = create_engine(
            "sqlite+pysqlite:///" + str(tmp_path / "vipplay.db")
        )

    scoped = engine

    try:
        if schema:
            with engine.begin() as conn:
                conn.execute(text(f'CREATE SCHEMA "{schema}"'))

            scoped = engine.execution_options(
                schema_translate_map={None: schema}
            )

        Base.metadata.create_all(
            scoped,
            tables=[
                User.__table__,
                AdminRole.__table__,
                VipStatus.__table__,
                Notification.__table__,
                VipMembership.__table__,
                VipPurchaseReceipt.__table__,
                VipCycleAudit.__table__,
                LidyaOrder.__table__,
                LidyaOperation.__table__,
                PaymentRequest.__table__,
                PlayPurchaseRecord.__table__,
                PlayRefundCase.__table__,
                LidyaLedger.__table__,
            ],
        )

        with Session(scoped) as db:
            db.add(User(
                id="u1",
                public_id="99000001",
                nickname="Audit VIP",
                lidya=100,
                is_active=True,
            ))
            db.flush()

            db.add(PlayPurchaseRecord(
                id=1,
                token_sha256=TOKEN,
                user_id="u1",
                product_id="lidya_001",
                google_order_id="GPA.ISOLATED-TEST",
                test_purchase=False,
                purchase_status="verified_no_credit",
            ))
            db.commit()

        yield scoped

    finally:
        try:
            if schema:
                with engine.begin() as conn:
                    conn.execute(text(
                        f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'
                    ))
        finally:
            engine.dispose()


def credit(db):
    return fulfillment.credit_verified_purchase(
        db,
        receipt_id=1,
        user_id="u1",
        product_id="lidya_001",
    )


def verify(db, wallet, points):
    assert db.get(User, "u1").lidya == wallet

    rows = db.scalars(
        select(VipPurchaseReceipt)
    ).all()

    assert len(rows) == (1 if points else 0)

    if points:
        assert rows[0].key == "play:" + TOKEN
        assert rows[0].amount == points

        member = db.get(VipMembership, "u1")
        assert member.total_purchased == points


def test_real_purchase_once(isolated):
    with Session(isolated) as db:
        result = credit(db)

        assert result["credited"]
        assert result["vip_points"] == 95

        duplicate = credit(db)
        assert duplicate["already_credited"]

        verify(db, 195, 95)


def test_license_purchase_excluded(isolated):
    with Session(isolated) as db:
        db.get(PlayPurchaseRecord, 1).test_purchase = True
        db.commit()

        assert credit(db)["vip_points"] == 0
        verify(db, 195, 0)


def test_test_mode_excluded(isolated, monkeypatch):
    monkeypatch.setattr(
        fulfillment.settings,
        "google_play_test_mode", True,
    )

    with Session(isolated) as db:
        assert credit(db)["vip_points"] == 0
        verify(db, 195, 0)


def test_disabled_switch(isolated, monkeypatch):
    monkeypatch.delenv(
        "LIDYACHAT_VIP_PLAY_POINTS_ENABLED",
        raising=False,
    )

    with Session(isolated) as db:
        assert credit(db)["vip_points"] == 0
        verify(db, 195, 0)


def test_atomic_rollback(isolated, monkeypatch):
    original = fulfillment.record_purchase

    def failing(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError("Isolated rollback test")

    monkeypatch.setattr(
        fulfillment, "record_purchase", failing
    )

    with Session(isolated) as db:
        with pytest.raises(RuntimeError):
            credit(db)

        verify(db, 100, 0)

        assert db.get(VipMembership, "u1") is None

        assert db.get(
            PlayPurchaseRecord, 1
        ).purchase_status == "verified_no_credit"


def test_concurrent_purchase(isolated):
    if isolated.dialect.name != "postgresql":
        pytest.skip("PostgreSQL concurrency case")

    barrier = Barrier(6)

    def worker():
        with Session(isolated) as db:
            barrier.wait(timeout=15)
            return credit(db)

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [
            pool.submit(worker)
            for _ in range(6)
        ]
        results = [f.result(timeout=30) for f in futures]

    assert sum(
        bool(r["credited"]) for r in results
    ) == 1

    with Session(isolated) as db:
        verify(db, 195, 95)
