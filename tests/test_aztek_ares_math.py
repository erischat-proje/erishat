"""Math and migration regressions; no production wallet or random sampling gates."""
import importlib.util
import random
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def engine():
    package = types.ModuleType('aztek_math_test')
    package.__path__ = [str(ROOT / 'backend/app')]
    sys.modules[package.__name__] = package
    return load('aztek_math_test.aztek_ares_engine', ROOT / 'backend/app/aztek_ares_engine.py')


def test_nuclear_refresh_does_not_advance_aztek_progress(engine):
    turn = engine.current.Turn('aztek', rng=random.Random(5).random)
    turn.stage = 0
    turn.clear(range(64), 'nuclear')
    assert (turn.count, turn.stage_count) == (0, 0)
    turn.clear(range(5), 'win')
    assert (turn.count, turn.stage_count) == (5, 5)


def test_ares_bombs_still_unlock_the_published_counters(engine):
    turn = engine.current.Turn('ares', rng=random.Random(5).random)
    turn.clear(range(20), 'bomb')
    assert turn.count == 20
    assert turn.locks[0] in [2, 3, 4]


def test_aztek_wild_is_never_paid_twice(engine):
    board = [(i + i // 8) % 7 for i in range(64)]
    board[:9] = [0, 0, 0, 0, 7, 1, 1, 1, 1]
    groups = engine.current.groups(board, True)
    cells = [i for _, cluster in groups for i in cluster]
    assert len(cells) == len(set(cells))


def test_fast_cluster_path_preserves_legacy_clusters(engine):
    rng = random.Random(52917)
    for _ in range(200):
        board = [rng.randrange(7) for _ in range(64)]
        normalized = lambda groups: sorted((t, tuple(sorted(cells))) for t, cells in groups)
        assert normalized(engine.current.groups(board, True)) == normalized(engine.legacy.groups(board, True))


@pytest.mark.parametrize('kind', ['aztek', 'ares'])
@pytest.mark.parametrize('buy', [False, True])
def test_trace_is_observational_and_cap_is_exact(engine, kind, buy):
    a = engine.current.spin(kind, purchase=buy, rng=random.Random(82391).random, remaining_cap=157)
    b = engine.current.spin(kind, purchase=buy, rng=random.Random(82391).random, remaining_cap=157, trace=False)
    assert a['payoutHundredths'] == b['payoutHundredths']
    assert a['board'] == b['board']
    assert a['awarded'] == b['awarded']
    assert 0 <= a['payoutHundredths'] <= 157
    assert a['events'][-1]['win'] == a['payoutHundredths']
    assert not b['events']


def test_distinct_ares_tables_are_public(engine):
    rules = engine.rules('ares')
    assert rules['version'] == engine.VERSION
    assert rules['paytable'] != rules['bonus_paytable']
    for key in ('aresPaytable', 'aresBonusPaytable', 'aztekPaytable'):
        for row in engine.current.CONFIG[key]:
            assert all(type(v) is int and v > 0 for v in row)
            assert row == sorted(row)


def test_dispatch_preserves_v1_results(engine, monkeypatch):
    rng = random.Random(9941)
    monkeypatch.setattr(engine.legacy, 'pick', rng.randrange)
    expected = engine.legacy.spin('ares', bonus=True)
    rng.seed(9941)
    actual = engine.spin('ares', bonus=True, version=engine.legacy.VERSION)
    assert actual == expected
    assert engine.rules('ares', version=engine.legacy.VERSION)['version'] == engine.legacy.VERSION
    with pytest.raises(ValueError):
        engine.spin('ares', version='missing-model')
    with pytest.raises(ValueError):
        engine.spin('unknown')
