"""Version dispatcher: new rounds use v2; paid v1 bonuses keep their rules."""
from . import aztek_ares_v1 as legacy
from . import aztek_ares_v2 as current

VERSION = current.VERSION
CAP = current.CAP
SUPPORTED_VERSIONS = frozenset((legacy.VERSION, current.VERSION))


def model(version):
    if version == current.VERSION:
        return current
    if version == legacy.VERSION:
        return legacy
    raise ValueError('Unsupported persisted game model')


def spin(kind, bonus=False, purchase=False, remaining_cap=CAP, version=VERSION,config=None):
    if kind not in ('aztek', 'ares'):
        raise ValueError('Unknown game')
    return model(version).spin(kind, bonus=bonus, purchase=purchase,
                               remaining_cap=remaining_cap, version=version,**({'config':config} if config is not None else {}))


def rules(kind, version=VERSION):
    if kind not in ('aztek', 'ares'):
        raise ValueError('Unknown game')
    return model(version).rules(kind)
