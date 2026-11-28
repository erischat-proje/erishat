import os
from uuid import uuid4
from threading import Barrier
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.app.models import User, UserCosmetic
from backend.app.admin_models import AdminRole
from backend.app.play_billing_models import PlayPurchaseRecord
from backend.app.play_refund_models import PlayRefundCase
from backend.app.welcome_purchase_models import (
    WelcomePurchase, WelcomePlayReceipt,
)
from backend.app.cosmetic_leases import CosmeticLease
from backend.app.system_data import LidyaLedger
from backend.app import system_logs
from backend.app import welcome_fulfillment as service

from backend.tests.test_welcome_fulfillment_v7 import (
    seed, TOKEN, DELIVERED,
)


@pytest.fixture
def pg(monkeypatch, tmp_path):
    raw = os.getenv("SECURITY_TEST_DATABASE_URL", "")
    assert raw, "Missing isolated test database"

    url = make_url(raw)

    assert url.drivername.startswith("postgresql")
    assert url.host in (
        "localhost", "127.0.0.1", "::1"
    )
    assert url.database == "lidyachat_security_test"
    assert os.getenv("WELCOME_PG_CONFIRM") == "YES"

    monkeypatch.setattr(system_logs, "ROOT", tmp_path)
    monkeypatch.setenv(
        "LIDYACHAT_WELCOME_DELIVERY_ENABLED", "true"
    )
    monkeypatch.setattr(
        service, "_checkout_ready", lambda: True
    )
    monkeypatch.setattr(
        service.settings, "google_play_test_mode", False
    )

    schema = "welcome_delivery_" + uuid4().hex[:12]

    root = create_engine(url)
    engine = None
    created = False

    try:
        with root.begin() as conn:
            conn.execute(
                text(f'CREATE SCHEMA "{schema}"')
            )

        created = True

        engine = create_engine(
            url,
            pool_size=8,
            max_overflow=0,
            connect_args={
                "options": (
                    f"-c search_path={schema} "
                    "-c lock_timeout=10000 "
                    "-c statement_timeout=20000"
                )
            },
        )

        for model in (
            User, AdminRole, UserCosmetic,
            WelcomePurchase, PlayPurchaseRecord,
            WelcomePlayReceipt, PlayRefundCase,
            CosmeticLease, LidyaLedger,
        ):
            model.__table__.create(engine)

        yield engine

    finally:
        if engine:
            engine.dispose()

        if created:
            with root.begin() as conn:
                conn.execute(
                    text(f'DROP SCHEMA "{schema}" CASCADE')
                )

        root.dispose()


@pytest.mark.parametrize("gender", ["male", "female"])
def test_concurrent_delivery(pg, monkeypatch, gender):
    with Session(pg, expire_on_commit=False) as db:
        intent, link = seed(
            db, monkeypatch, "gold", gender
        )
        rid = link.receipt_id
        intent_id = intent.id

    barrier = Barrier(6)

    def worker():
        with Session(pg) as db:
            barrier.wait(timeout=15)

            return service.deliver(
                db, rid, "owner", TOKEN, DELIVERED
            )

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [
            pool.submit(worker) for _ in range(6)
        ]

        results = [
            f.result(timeout=45) for f in futures
        ]

    assert sum(
        bool(r["credited"]) for r in results
    ) == 1

    assert sum(
        bool(r["already_credited"]) for r in results
    ) == 5

    with Session(pg) as db:
        user = db.get(User, "owner")

        assert user.lidya == 28100
        assert user.lidya_gem == 50

        items = db.scalars(
            select(CosmeticLease)
        ).all()

        assert len(items) == 5

        assert all(
            item.asset_key.startswith(
                f"welcome_{gender}_gold_"
            )
            for item in items
        )

        ledger = db.scalars(
            select(LidyaLedger).where(
                LidyaLedger.operation == "google_play_credit"
            )
        ).all()

        assert len(ledger) == 1
        assert ledger[0].delta == 28000
        assert ledger[0].balance_after == 28100

        assert db.get(
            WelcomePurchase, intent_id
        ).status == "credited"

        assert db.get(
            PlayPurchaseRecord, rid
        ).purchase_status == "credited"
