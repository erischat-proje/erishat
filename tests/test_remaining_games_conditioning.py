"""Check exact probability reconstruction, without random test assertions."""
import copy
import importlib.util
from pathlib import Path

import pytest

SPEC=importlib.util.spec_from_file_location('conditioned',Path(__file__).with_name('remaining_games_conditional.py'))
MODULE=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(MODULE)


def count_distribution(config,ante):
    rate=config['scatterRate']*(2 if ante else 1);weights=config['baseScatterCountWeights']
    return [1-rate]+[rate*w/sum(weights) for w in weights]


@pytest.mark.parametrize('ante',[False,True])
def test_kure_zero_scatter_mass_is_preserved(ante):
    original={'scatterRate':.4,'baseScatterCountWeights':[8,3,2,1,1,1]}
    before=copy.deepcopy(original);target=count_distribution(original,ante)
    probability,no=MODULE.condition_config('kure','ante' if ante else 'normal',original,False)
    p,yes=MODULE.condition_config('kure','ante' if ante else 'normal',original,True)
    assert p==probability and original==before
    reconstructed=[(1-p)*a+p*b for a,b in zip(count_distribution(no,ante),count_distribution(yes,ante))]
    assert reconstructed==pytest.approx(target)
    assert sum(count_distribution(yes,ante)[:3])==0
    assert sum(count_distribution(no,ante)[3:])==0


@pytest.mark.parametrize('game,key,threshold', [('seker','scatters',4),('seker','anteScatters',4),('balikci','scatters',3)])
def test_weighted_scatter_families_reconstruct_exactly(game,key,threshold):
    weights=[17,13,11,7,3,1,1] if game=='seker' else [17,13,11,7,3,1]
    original={key:weights};mode='ante' if key=='anteScatters' else 'normal'
    p,no=MODULE.condition_config(game,mode,original,False);_,yes=MODULE.condition_config(game,mode,original,True)
    reconstructed=[(1-p)*a/sum(no[key])+p*b/sum(yes[key]) for a,b in zip(no[key],yes[key])]
    assert reconstructed==pytest.approx([w/sum(weights) for w in weights])


@pytest.mark.parametrize('game',['dede','prenses','dogparty','altin','firavun'])
def test_initial_trigger_coin_is_the_only_overridden_field(game):
    original={'bonusTrigger':.01,'retrigger':.02,'unrelated':[1,2]}
    p,no=MODULE.condition_config(game,'normal',original,False);_,yes=MODULE.condition_config(game,'normal',original,True)
    assert p==.01 and no['bonusTrigger']==0 and yes['bonusTrigger']==1
    assert no['retrigger']==yes['retrigger']==.02 and original['bonusTrigger']==.01
