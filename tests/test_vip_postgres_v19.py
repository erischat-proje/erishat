"""VIP concurrency tests against an isolated PostgreSQL service."""

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from test_vip_privileges import v
from app import cosmetic_routes as c
from app import system_logs
from app.system_data import LidyaLedger
from app.vip_spending import VipSpendReceipt
from app.platform_models import VipRewardClaim

TEST_URL = (
    "postgresql+psycopg://vip_test:isolated_test_only"
    "@127.0.0.1:5432/lidyachat_vip_test"
)


@pytest.fixture
def database(tmp_path, monkeypatch):
    assert os.environ.get("VIP_PG_ISOLATED_CONFIRM") == "YES"
    assert os.environ.get("VIP_PG_TEST_DATABASE_URL") == TEST_URL

    monkeypatch.setattr(system_logs, "ROOT", tmp_path)

    engine = create_engine(
        TEST_URL,
        pool_size=6,
        connect_args={
            "connect_timeout": 5,
            "options": "-c lock_timeout=10000 -c statement_timeout=20000",
        },
    )
    v.Base.metadata.create_all(engine)

    factory = sessionmaker(
        bind=engine,
        expire_on_commit=False,
    )

    try:
        yield factory
    finally:
        engine.dispose()


def seed(factory, balance):
    uid = uuid4().hex
    with factory() as db:
        user = v.User(
            id=uid,
            public_id=str(int(uid[:12], 16) % 9000000000 + 1000000000),
            nickname="VIP PostgreSQL",
            gender="male",
            lidya=balance,
        )
        db.add(user)
        db.flush()
        db.add(v.VipStatus(
            user_id=uid,
            level=12,
            total_spent=0,
        ))
        row = v.locked(db, user)
        v.save(row, {"coupon": "enabled"})
        db.commit()
    return uid


def parallel(factory, uid, operation, count):
    barrier = Barrier(count)

    def worker():
        with factory() as db:
            user = db.get(v.User, uid)
            barrier.wait(timeout=15)
            try:
                return operation(db, user)
            except HTTPException as exc:
                db.rollback()
                return exc.status_code

    with ThreadPoolExecutor(max_workers=count) as executor:
        futures = [executor.submit(worker) for _ in range(count)]
        return [f.result(timeout=45) for f in futures]


def rent(db, user):
    payload = c.CosmeticRent(
        cosmetic_type="avatar",
        asset_key="shop-expansion/avatar-male-01.png",
        months=1,
    )
    return c.rent_cosmetic(payload, user, db)["spent"]


def verify_balance(factory, uid, expected, charges):
    with factory() as db:
        assert db.get(v.User, uid).lidya == expected

        receipts = list(db.scalars(
            select(VipSpendReceipt).where(
                VipSpendReceipt.user_id == uid
            )
        ))
        assert sorted(r.amount for r in receipts) == sorted(charges)

        ledger = list(db.scalars(
            select(LidyaLedger).where(
                LidyaLedger.user_id == uid,
                LidyaLedger.delta < 0,
            )
        ))
        assert sorted(-r.delta for r in ledger) == sorted(charges)

        coupons = list(db.scalars(
            select(v.VipBenefitReceipt).where(
                v.VipBenefitReceipt.user_id == uid,
                v.VipBenefitReceipt.key == v.receipt_key("coupon"),
            )
        ))
        assert len(coupons) == 1
        assert coupons[0].amount == 405


def test_concurrent_coupon_is_used_once(database):
    uid = seed(database, 12345)

    results = parallel(database, uid, rent, 2)

    assert sorted(results) == [2295, 2700]
    verify_balance(database, uid, 7350, [2295, 2700])


def test_concurrent_rental_cannot_overdraw(database):
    uid = seed(database, 2500)

    results = parallel(database, uid, rent, 2)

    assert sorted(results) == [400, 2295]
    verify_balance(database, uid, 205, [2295])


def test_concurrent_inventory_no_duplicate_rewards(database):
    uid = seed(database, 12345)

    def inventory(db, user):
        return c.appearance_inventory(user, db)

    results = parallel(database, uid, inventory, 4)

    assert all(isinstance(r, dict) for r in results)

    with database() as db:
        user = db.get(v.User, uid)

        claims = list(db.scalars(
            select(VipRewardClaim).where(
                VipRewardClaim.user_id == uid
            )
        ))

        assert len(claims) == 12
        assert {r.level for r in claims} == set(range(1, 13))

        owned = [
            (r.cosmetic_type, r.asset_key)
            for r in db.scalars(
                select(v.UserCosmetic).where(
                    v.UserCosmetic.user_id == uid
                )
            )
        ]

        expected = {
            (r["cosmetic_type"], r["asset_key"])
            for tier in c.vip_level_rewards(user)
            for r in tier["rewards"]
        }

        assert expected.issubset(set(owned))
        assert len(owned) == len(set(owned))
        assert user.lidya == 12345
