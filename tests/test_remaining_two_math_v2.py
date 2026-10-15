"""Frozen pre-change results and preservation of all natural game math."""
import copy
import importlib.util
import json
import random
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[1]
CASES=json.loads((ROOT/'tests/fixtures/remaining-two-v1.json').read_text())

def engine(game):
    spec=importlib.util.spec_from_file_location('remaining_'+game,ROOT/'backend/app'/f'{game}_engine.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

@pytest.mark.parametrize('case',CASES,ids=[f"{c['game']}-{c['kind']}-{c['seed']}-{c.get('purchased','')}" for c in CASES])
def test_old_paid_rounds_match_frozen_v1(case):
    e=engine(case['game']);rng=random.Random(case['seed']).random;version=e.LEGACY_CONFIG['version']
    if case['kind']=='respin':
        state=e.start_bonus(purchased=case['purchased'],model_version=version,rng=rng)
        assert state==case['initial']
        for expected in case['steps']:
            result=e.respin(state,rng=rng);assert result==expected;state=result['bonus']
        assert state['remaining']==0
    else:
        result=e.spin(**case.get('args',{}),model_version=version,rng=rng)
        if case['game']=='seker':result.pop('modelVersion')
        assert result==case['result']

def strip_versions(obj):
    if isinstance(obj,dict):return {k:strip_versions(v) for k,v in obj.items() if k not in ('version','modelVersion')}
    if isinstance(obj,list):return [strip_versions(x) for x in obj]
    return obj

@pytest.mark.parametrize('game',['seker','altin'])
def test_only_purchase_configuration_changes(game):
    e=engine(game);current=copy.deepcopy(e.CONFIG);legacy=copy.deepcopy(e.LEGACY_CONFIG)
    current.pop('version');legacy.pop('version')
    if game=='altin':
        assert current.pop('buyPotValues')!=legacy.pop('buyPotValues')
    else:assert current.pop('buyBombWeights')==[2800]+legacy['bombWeights'][1:]
    assert current==legacy
    for seed in range(60):
        for bonus in ([False,True] if game=='seker' else [False]):
            args={'bonus':bonus} if game=='seker' else {}
            a=e.spin(**args,model_version=e.LEGACY_CONFIG['version'],rng=random.Random(seed).random)
            b=e.spin(**args,rng=random.Random(seed).random)
            assert strip_versions(a)==strip_versions(b)
    if game=='altin':
        a=e.start_bonus(purchased=False,model_version=e.LEGACY_CONFIG['version'],rng=random.Random(7).random)
        b=e.start_bonus(purchased=False,rng=random.Random(7).random)
        while a['remaining']:
            ra=e.respin(a,rng=random.Random(a['remaining']).random);rb=e.respin(b,rng=random.Random(b['remaining']).random)
            assert strip_versions(ra)==strip_versions(rb);a=ra['bonus'];b=rb['bonus']

@pytest.mark.parametrize('game',['seker','altin'])
def test_unknown_models_fail_before_random_draw(game):
    e=engine(game)
    def fail():raise AssertionError('randomness consumed for invalid model')
    with pytest.raises(ValueError):e.spin(model_version='missing',rng=fail)
    if game=='altin':
        with pytest.raises(ValueError):e.start_bonus(model_version='missing',rng=fail)
        with pytest.raises(ValueError):e.respin({'version':'missing'},rng=fail)
