from datetime import datetime, timezone

import pytest

from backend.app import gift_payout as payout
from backend.app import nobility_policy as policy


@pytest.mark.parametrize("gross", [
    10, 11, 15, 99, 100, 101,
    1000, 10000, 100000
])
def test_count_minimum(monkeypatch, gross):
    monkeypatch.setattr(
        payout.secrets, "randbelow", lambda n: 0
    )

    result = payout.gift_payout(gross, rank=2)

    assert result == (gross * 66 + 99) // 100
    assert result <= gross


@pytest.mark.parametrize("gross", [
    10, 100, 1000, 100000
])
def test_count_maximum(monkeypatch, gross):
    monkeypatch.setattr(
        payout.secrets, "randbelow", lambda n: n-1
    )

    assert payout.gift_payout(
        gross, rank=2
    ) == gross


@pytest.mark.parametrize("gross", range(10))
def test_small_gifts_no_payout(gross):
    assert payout.gift_payout(
        gross, rank=2
    ) == 0


@pytest.mark.parametrize("rank,minimum", [
    (0, 0),
    (1, 0),
    (2, 66),
    (3, 67),
    (4, 70)
])
def test_rank_minimum(monkeypatch, rank, minimum):
    monkeypatch.setattr(
        payout.secrets, "randbelow", lambda n: 0
    )

    assert payout.gift_payout(
        100, rank=rank
    ) == minimum


@pytest.mark.parametrize(
    "gross", [-1, -100, 1.5, "100", True, None]
)
def test_invalid_gross(gross):
    with pytest.raises(ValueError):
        payout.gift_payout(gross, rank=2)


@pytest.mark.parametrize(
    "rank", [-1, 5, 999, "2", True, None]
)
def test_invalid_rank(rank):
    with pytest.raises(ValueError):
        payout.gift_payout(100, rank=rank)


def test_recipient_authorization(monkeypatch):
    now = datetime.now(timezone.utc)
    calls = []

    def active_rank(db, uid, at):
        calls.append((uid, at))
        return 2

    monkeypatch.setattr(
        policy, "active_rank", active_rank
    )

    monkeypatch.setattr(
        payout.secrets, "randbelow", lambda n: 0
    )

    assert payout.recipient_gift_payout(
        None, "count-recipient", 1000, at=now
    ) == 660

    assert calls == [("count-recipient", now)]


def test_expired_recipient_no_bonus(monkeypatch):
    monkeypatch.setattr(
        policy, "active_rank", lambda *args: 0
    )

    monkeypatch.setattr(
        payout.secrets, "randbelow", lambda n: 0
    )

    assert payout.recipient_gift_payout(
        None, "expired-count", 1000
    ) == 0


def test_multiple_recipients_no_excess(monkeypatch):
    monkeypatch.setattr(
        payout.secrets, "randbelow", lambda n: n-1
    )

    gross = 1000
    ranks = [0, 1, 2, 3, 4]

    total = sum(
        payout.gift_payout(gross, rank=rank)
        for rank in ranks
    )

    assert total <= gross * len(ranks)
