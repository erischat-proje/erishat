"""Server-owned natural-entry profiles. Old rounds and bonus purchases stay immutable.

A profile identifier is persisted when a new paid round starts. Never infer it from
client input or add it to an already-open round. Keep old profile definitions when
introducing a successor, just like persisted engine model versions.
"""
import copy
import json
import math
from functools import lru_cache
from pathlib import Path

PROFILE='natural-balanced-20261015-v1'
PROFILES=json.loads(Path(__file__).with_name('natural-bonus-v1.json').read_text())

@lru_cache(maxsize=None)
def _engine(game):
    from importlib import import_module
    return import_module('.aztek_ares_v2' if game in ('aztek','ares') else '.'+game+'_engine',__package__)


def start(state,game,action):
    if action=='spin' and game in PROFILES:
        state['natural_profile']=PROFILE


def _row(game,state=None):
    if state is not None and state.get('natural_profile')!=PROFILE:return None
    row=PROFILES.get(game)
    if row is None:return None
    return row


def _table(table,factor):
    return [[round(value*factor) for value in row] for row in table]


@lru_cache(maxsize=None)
def entry_config(game):
    engine=_engine(game);cfg=copy.deepcopy(engine.CONFIG);row=PROFILES[game]
    p=row['probability']
    if game in ('dede','prenses','dogparty','kovboy','bastet','firavun'):
        cfg['bonusTrigger']=p
    elif game=='candy':
        ratio=cfg['anteBonusTrigger']/cfg['bonusTrigger']
        cfg['bonusTrigger']=p;cfg['anteBonusTrigger']=p*ratio
    elif game in ('seker','balikci'):
        threshold=4 if game=='seker' else 3
        for key in ('scatters','anteScatters') if game=='seker' else ('scatters',):
            weights=cfg[key];q=p*(2 if key=='anteScatters' else 1)
            low=sum(weights[:threshold]);high=sum(weights[threshold:])
            cfg[key]=[w*((q/high) if i>=threshold else ((1-q)/low)) for i,w in enumerate(weights)]
    elif game=='kure':
        # Preserve scatter appearance and the conditional 3..6 scatter awards.
        weights=cfg['baseScatterCountWeights'];q=p/cfg['scatterRate']
        low=sum(weights[:2]);high=sum(weights[2:])
        cfg['baseScatterCountWeights']=[w*((q/high) if i>=2 else ((1-q)/low)) for i,w in enumerate(weights)]
    elif game=='aztek':
        cfg['goldEntryCount']=row['entry_count']
        cfg['aztekPaytable']=_table(cfg['aztekPaytable'],row.get('base_factor',1))
        cfg['goldPaytable']=_table(engine.CONFIG['aztekPaytable'],row['reward_factor'])
    elif game=='ares':
        cfg['aresScatterThreshold']=row['scatter_threshold']
        cfg['naturalBaseFactor']=row.get('base_factor',1)
        cfg['aresPaytable']=_table(cfg['aresPaytable'],row.get('base_factor',1))
    return cfg


@lru_cache(maxsize=None)
def _bonus_config(game,ante):
    engine=_engine(game);cfg=copy.deepcopy(engine.CONFIG);row=PROFILES[game]
    factor=row.get('ante_reward_factor',row['reward_factor']) if ante else row['reward_factor']
    cfg['naturalRewardFactor']=factor
    if game in ('dede','prenses','seker','candy'):cfg['paytable']=_table(engine.PAY,factor)
    elif game=='aztek':return entry_config(game)
    elif game=='ares':cfg['aresBonusPaytable']=_table(cfg['aresBonusPaytable'],factor)
    else:cfg['paytable']=_table(cfg['paytable'],factor)
    return cfg


def bonus_config(game,state):
    if _row(game,state) is None:return _engine(game).CONFIG
    return _bonus_config(game,bool(state.get('ante')))


def bonus_floor(game,state,default):
    row=_row(game,state)
    return round(default*row['reward_factor']) if row else default


def public(state):
    return {'natural_profile':state.get('natural_profile')}


def rules(game):
    row=PROFILES[game]
    return {'profile':PROFILE,'probability':row['probability'],
            'ante_probability':row.get('ante_probability'),
            'reward_factor':row['reward_factor'],
            'ante_reward_factor':row.get('ante_reward_factor',row['reward_factor']),
            'ante_bonus_paytable':_bonus_config(game,True).get('paytable') if row.get('ante_probability') else None,
            **({'floor':bonus_floor(game,{'natural_profile':PROFILE},1000)/100} if game=='kovboy' else {}),
            'bonus_paytable':_bonus_config(game,False).get('paytable') if game not in ('aztek','ares') else entry_config(game).get('goldPaytable') if game=='aztek' else _bonus_config(game,False)['aresBonusPaytable'],
            'note':'Yeni doğal bonusun ayrı ödeme profili vardır. Satın alınan ve önceden başlamış bonuslar kendi tablolarını korur. Ortalama sıklık garanti değildir.',
            'rtp_status':'Monte Carlo tahmini; sertifikalı RTP değildir.'}
