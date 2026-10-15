"""Run existing full-round reference simulators with source hashes attached."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAMES = ['seker','balikci','prenses','dogparty','altin','kure','candy','bastet','firavun','kovboy']


def audit(game, mode, samples, seed):
    buy_profile = mode == 'buy' and game in ('balikci','dogparty')
    path = ROOT/'tests'/('bonus_buy_simulate.py' if buy_profile else game+'_simulate.py')
    spec = importlib.util.spec_from_file_location('audit_'+game, path)
    simulator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(simulator)
    if buy_profile:
        result = simulator.run(game,samples,seed)
    elif game == 'candy':
        result = simulator.run(mode,samples,seed)
    elif game in ('balikci','dogparty'):
        if mode != 'normal':raise ValueError('Game has no ante mode')
        result = simulator.simulate(samples,seed)
    else:
        if mode == 'ante' and game not in ('seker','prenses','kure'):
            raise ValueError('Game has no ante mode')
        result = simulator.simulate(samples,mode,seed)
    result.pop('config',None)
    sources = [ROOT/'backend/app'/f'{game}_engine.py', ROOT/'backend/app'/f'{game}-math.json', path]
    current_config = ROOT/'backend/app'/f'{game}-math-v2.json'
    if current_config.exists():
        sources.append(current_config)
    if buy_profile:
        sources.append(ROOT/'backend/app/slot-bonus-buy.json')
    result.update(game=game,mode=mode,certified=False,
                  modelVersion=json.loads((current_config if current_config.exists() else ROOT/'backend/app'/f'{game}-math.json').read_text())['version'],
                  source_sha256={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources})
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('game',choices=GAMES)
    parser.add_argument('mode',choices=['normal','ante','buy'])
    parser.add_argument('--samples',type=int,default=500000)
    parser.add_argument('--seed',type=int,default=151026)
    parser.add_argument('--out',type=Path,required=True)
    args = parser.parse_args()
    if args.samples < 2:parser.error('--samples must be at least 2')
    report = audit(args.game,args.mode,args.samples,args.seed)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report),flush=True)
