"""Guaranteed minimum gift payout tests."""

from datetime import datetime, timezone

import pytest

from backend.app import gift_payout as payout
from backend.app import nobility_policy


@pytest.mark.parametrize(
    "rank,percent",
    [(0,0),(1,0),(2,66),(3,67),(4,70)]
)
@pytest.mark.parametrize(
    "gross",
    [10,11,99,100,1000,10000,100000]
)
def test_minimum(monkeypatch, rank, percent, gross):
    monkeypatch.setattr(
        payout.secrets, "randbelow", lambda n: 0
    )

    result = payout.gift_payout(gross, rank=rank)

    assert result == (gross * percent + 99) // 100
    assert result * 100 >= gross * percent
    assert 0 <= result <= gross


@pytest.mark.parametrize("rank", range(5))
@pytest.mark.parametrize("gross", [10,99,10000])
def test_maximum(monkeypatch, rank, gross):
    monkeypatch.setattr(
        payout.secrets, "randbelow", lambda n: n-1
    )

    assert payout.gift_payout(
        gross, rank=rank
    ) == gross


@pytest.mark.parametrize("rank", range(5))
@pytest.mark.parametrize("gross", range(10))
def test_small_gifts(rank, gross):
    assert payout.gift_payout(
        gross, rank=rank
    ) == 0


@pytest.mark.parametrize(
    "gross", [-1,True,False,1.5,"100",None]
)
def test_invalid_amount(gross):
    with pytest.raises(ValueError):
        payout.gift_payout(gross)


@pytest.mark.parametrize(
    "rank", [-1,5,99,True,False,"4",None,4.0]
)
def test_invalid_rank(rank):
    with pytest.raises(ValueError):
        payout.gift_payout(100,rank=rank)


def test_legacy_minimum(monkeypatch):
    monkeypatch.setattr(
        payout.secrets, "randbelow", lambda n: 0
    )
    assert payout.gift_payout(10000) == 0


def test_legacy_maximum(monkeypatch):
    monkeypatch.setattr(
        payout.secrets, "randbelow", lambda n: n-1
    )
    assert payout.gift_payout(10000) == 10000


def test_recipient_entitlement(monkeypatch):
    calls=[]
    db=object()
    at=datetime.now(timezone.utc)

    def rank(session,uid,when):
        calls.append((session,uid,when))
        return 4

    monkeypatch.setattr(
        nobility_policy,"active_rank",rank
    )
    monkeypatch.setattr(
        payout.secrets,"randbelow",lambda n:0
    )

    assert payout.recipient_gift_payout(
        db,"recipient",10000,at=at
    ) == 7000

    assert calls == [(db,"recipient",at)]


def test_independent_recipients(monkeypatch):
    ranks={"normal":0,"kont":2,"duk":3,"kral":4}

    monkeypatch.setattr(
        nobility_policy,
        "active_rank",
        lambda db,uid,at:ranks[uid]
    )
    monkeypatch.setattr(
        payout.secrets,"randbelow",lambda n:0
    )

    assert {
        uid:payout.recipient_gift_payout(
            object(),uid,10000
        )
        for uid in ranks
    } == {
        "normal":0,
        "kont":6600,
        "duk":6700,
        "kral":7000,
    }


def test_policy_failure_propagates(monkeypatch):
    def fail(*args):
        raise RuntimeError("Database unavailable")

    monkeypatch.setattr(
        nobility_policy,"active_rank",fail
    )

    with pytest.raises(RuntimeError):
        payout.recipient_gift_payout(
            object(),"recipient",10000
        )


def test_naive_time_rejected():
    with pytest.raises(ValueError):
        payout.recipient_gift_payout(
            object(),"recipient",10000,
            at=datetime(2026,11,26)
        )
