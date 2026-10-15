"""Real routes: large funded stakes, exact retries, and insufficient-wallet rejection."""
import importlib
from uuid import uuid4
import pytest
from test_dede import fixture as dede_fixture
from test_seker import fixture as seker_fixture
from test_balikci import fixture as balikci_fixture
from test_prenses import fixture as prenses_fixture
from test_dogparty import fixture as dogparty_fixture
from test_candy import fixture as candy_fixture
from test_kovboy import fixture as kovboy_fixture
from test_bastet import fixture as bastet_fixture
from test_altin import fixture as altin_fixture
from test_kure import fixture as kure_fixture
from test_firavun import fixture as firavun_fixture
from test_aztek_ares_routes import fixture as aztek_ares_fixture
GAMES=['dede','seker','balikci','prenses','dogparty','candy','kovboy','bastet','altin','kure','firavun','aztek','ares']

def game_fixture(request,game):
    return request.getfixturevalue(('aztek_ares' if game in ['aztek','ares'] else game)+'_fixture')

@pytest.mark.parametrize('game',GAMES)
@pytest.mark.parametrize('action',['spin','buy'])
def test_large_stake_is_funded_once_and_replay_never_recredits(request,game,action):
    c,s,r,*_=game_fixture(request,game)
    initial=1000000000000;stake=2000000001
    with s() as db:
        db.get(r.User,'a').lidya=initial;db.commit()
    payload={'request_id':str(uuid4()),'stake':stake,'action':action}
    first=c.post('/v1/games/'+game+'/spin',json=payload)
    assert first.status_code==200,first.text
    out=first.json();assert out['charge']==stake*(100 if action=='buy' else 1)
    with s() as db:after=db.get(r.User,'a').lidya
    assert abs(out['balance']-(initial-out['charge']+out['payout']))<.02
    again=c.post('/v1/games/'+game+'/spin',json=payload)
    assert again.status_code==200 and again.json()['replayed']
    assert again.json()['balance']==out['balance']
    with s() as db:assert db.get(r.User,'a').lidya==after

@pytest.mark.parametrize('game',GAMES)
def test_large_stake_without_balance_cannot_debit(request,game):
    c,s,r,*_=game_fixture(request,game)
    with s() as db:before=db.get(r.User,'a').lidya
    response=c.post('/v1/games/'+game+'/spin',json={'request_id':str(uuid4()),'stake':2000000001})
    assert response.status_code==400,response.text
    with s() as db:assert db.get(r.User,'a').lidya==before

@pytest.mark.parametrize('game',['blackjack','cups','horse','vault'])
def test_classic_policy_has_no_fixed_maximum(game):
    # Reuse the isolated package containing the real models and policy modules.
    import test_blackjack_final
    policy=importlib.import_module('_bj_test_app.'+game+'_final')
    for value in [10,50,500,858993460,2000000000,1000000000000]:assert policy.validate_stake(value)==value
    from fastapi import HTTPException
    for value in [0,-10,11,True,10.0,'10']:
        with pytest.raises(HTTPException):policy.validate_stake(value)
