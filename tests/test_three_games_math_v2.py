"""Freeze paid v1 bonuses while introducing independently measured v2 profiles."""
import hashlib
import importlib.util
import json
import random
from pathlib import Path

import pytest

ROOT=Path(__file__).resolve().parents[1]
FIXTURE=json.loads((ROOT/'tests/fixtures/three-games-v1-parity.json').read_text())


def engine(game):
    spec=importlib.util.spec_from_file_location('math_v2_'+game,ROOT/'backend/app'/f'{game}_engine.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize('case',FIXTURE['cases'],ids=lambda c:c['game']+'-'+str(c['seed'])+'-'+str(c['kwargs'].get('bonus')))
def test_every_legacy_result_matches_frozen_pre_change_trace(case):
    module=engine(case['game'])
    for purchased in ([False,True] if case['game']!='candy' else [False]):
        kwargs=dict(case['kwargs'])
        if case['game']!='candy':kwargs['purchased']=purchased
        result=module.spin(**kwargs,model_version=case['legacyVersion'],rng=random.Random(case['seed']).random)
        assert {key:result[key] for key in case['expected']}==case['expected']
        assert result['modelVersion']==case['legacyVersion']


@pytest.mark.parametrize('game',['bastet','candy','kovboy'])
def test_legacy_configuration_is_immutable(game):
    path=ROOT/'backend/app'/f'{game}-math.json'
    assert hashlib.sha256(path.read_bytes()).hexdigest()==FIXTURE['legacyConfigSHA256'][game]
    module=engine(game)
    assert module.CONFIG['version']!=module.LEGACY_CONFIG['version']
    with pytest.raises(ValueError):module.spin(model_version='unavailable')


@pytest.mark.parametrize('game',['bastet','candy','kovboy'])
def test_unchanged_parts_of_each_model_keep_exact_outcomes(game):
    module=engine(game)
    # Candy changes bonus distribution; Bastet changes base/purchased wilds;
    # Kovboy changes purchased wilds only. Natural bonus math stays fixed in
    # the two line games, and Candy's initial paid spin stays fixed.
    kwargs=dict(bonus=game!='candy',trace=False)
    for seed in range(20):
        legacy=module.spin(**kwargs,model_version=module.LEGACY_CONFIG['version'],rng=random.Random(seed).random)
        current=module.spin(**kwargs,model_version=module.CONFIG['version'],rng=random.Random(seed).random)
        legacy.pop('modelVersion');current.pop('modelVersion')
        assert current==legacy


@pytest.mark.parametrize('game',['bastet','candy','kovboy'])
def test_animation_trace_cannot_change_payout_or_progress(game):
    module=engine(game)
    # Trace consumes additional animation-only RNG after the result in the
    # line games. Compare the current spin result, rather than future draws.
    kwargs=dict(bonus=True,remaining_cap=157)
    for trace in [False,True]:
        result=module.spin(**kwargs,rng=random.Random(621).random,trace=trace)
        assert 0<=result['payoutHundredths']<=157
        if not trace:reference=result
        else:
            for key in ['payoutHundredths','board','extraSpins']:
                assert result[key]==reference[key]


def test_candy_ante_only_changes_trigger_probability_and_price():
    module=engine('candy')
    for trigger in [0,1]:
        config={**module.CONFIG,'bonusTrigger':trigger,'anteBonusTrigger':trigger}
        for seed in range(20):
            normal=module.spin(config=config,rng=random.Random(seed).random,trace=False)
            ante=module.spin(config=config,ante=True,rng=random.Random(seed).random,trace=False)
            assert ante==normal
