"""Real membership gift payout integration."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from backend.app import gift_payout as payout
from backend.app import nobility_policy
from backend.app.nobility_models import NobilityMembership

from backend.tests.test_nobility_postgres_v1 import scoped_db
from backend.tests.test_nobility_activation_v10 import engine
from backend.tests.test_nobility_super_kick_entitlement_v11 import activate


@pytest.fixture(autouse=True)
def minimum_random(monkeypatch):
    monkeypatch.setattr(
        payout.secrets, "randbelow", lambda n: 0
    )


@pytest.mark.parametrize(
    "rank,expected",
    [(1,0),(2,6600),(3,6700),(4,7000)]
)
def test_real_membership(engine,rank,expected):
    activate(engine,rank)

    with Session(engine) as db:
        assert payout.recipient_gift_payout(
            db,"u1",10000
        ) == expected


def test_no_membership(engine):
    with Session(engine) as db:
        assert payout.recipient_gift_payout(
            db,"u1",10000
        ) == 0


def test_sender_rank_not_used(engine):
    activate(engine,4)

    with Session(engine) as db:
        assert payout.recipient_gift_payout(
            db,"u2",10000
        ) == 0


def test_expired_membership(engine):
    activate(engine,4)

    with Session(engine) as db:
        member=db.get(NobilityMembership,"u1")
        now=datetime.now(timezone.utc)
        member.started_at=now-timedelta(days=31)
        member.expires_at=now-timedelta(days=1)
        db.commit()

        assert payout.recipient_gift_payout(
            db,"u1",10000
        ) == 0


def test_disabled_system(engine,monkeypatch):
    activate(engine,4)

    monkeypatch.setattr(
        nobility_policy,"enabled",lambda:False
    )

    with Session(engine) as db:
        assert payout.recipient_gift_payout(
            db,"u1",10000
        ) == 0


def test_small_gift_king(engine):
    activate(engine,4)

    with Session(engine) as db:
        assert payout.recipient_gift_payout(
            db,"u1",9
        ) == 0


def test_multiple_recipients(engine):
    activate(engine,4)

    with Session(engine) as db:
        at=datetime.now(timezone.utc)

        results={
            uid:payout.recipient_gift_payout(
                db,uid,10000,at=at
            )
            for uid in ("u1","u2")
        }

        assert results=={"u1":7000,"u2":0}
