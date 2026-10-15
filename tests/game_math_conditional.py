"""Stratified full-round estimate across known natural bonus-trigger outcomes.

E[R] = (1-p) E[R|no trigger] + p E[R|trigger]. Independent strata remove
rare-trigger sampling noise, without changing live code or any user outcome.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def estimate(game, mode, samples, seed):
    path = ROOT/'tests'/f'{game}_simulate.py'
    spec = importlib.util.spec_from_file_location('conditioned_'+game, path)
    simulator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(simulator)
    engine = simulator.m
    key = 'anteBonusTrigger' if mode == 'ante' else 'bonusTrigger'
    probability = engine.CONFIG[key]
    strata = []
    for condition, stratum_seed in [(0, seed), (1, seed+1)]:
        engine.CONFIG[key] = condition
        try:
            result = simulator.run(mode,samples,stratum_seed) if game=='candy' else simulator.simulate(samples,mode,stratum_seed)
        finally:
            engine.CONFIG[key] = probability
        strata.append(dict(trigger=bool(condition), probability=probability if condition else 1-probability, report=result))
    mean = sum(s['probability']*s['report']['rtp'] for s in strata)
    variance = sum(s['probability']**2*((s['report']['ci95'][1]-s['report']['ci95'][0])/3.92)**2 for s in strata)
    half = 1.96*math.sqrt(variance)
    sources = [ROOT/'backend/app'/f'{game}_engine.py', ROOT/'backend/app'/f'{game}-math.json', path, Path(__file__)]
    current_config=ROOT/'backend/app'/f'{game}-math-v2.json'
    if current_config.exists():sources.append(current_config)
    report=dict(game=game, mode=mode, method='independent-trigger-strata', samplesPerStratum=samples,
                samples=2*samples, seed=seed, bonusTriggerProbability=probability,
                rtp=mean,ci95=[mean-half,mean+half],strata=strata,certified=False,
                source_sha256={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources})
    if game=='candy' and mode=='normal':
        ante_p=engine.CONFIG['anteBonusTrigger']
        ante_mean=((1-ante_p)*strata[0]['report']['rtp']+ante_p*strata[1]['report']['rtp'])/1.25
        ante_half=1.96*math.sqrt(sum(w*w*((s['report']['ci95'][1]-s['report']['ci95'][0])/3.92)**2 for w,s in zip([1-ante_p,ante_p],strata)))/1.25
        report['anteEstimate']=dict(rtp=ante_mean,ci95=[ante_mean-ante_half,ante_mean+ante_half],costUnits=1.25,bonusTriggerProbability=ante_p,note='Same conditional outcome distributions; ante only changes trigger probability and 1.25x cost.')
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('game',choices=['bastet','kovboy','candy'])
    parser.add_argument('mode',choices=['normal','ante'])
    parser.add_argument('--samples',type=int,default=200000)
    parser.add_argument('--seed',type=int,default=26101551)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    if args.mode=='ante' and args.game!='candy':parser.error('Only Candy has ante mode')
    if args.samples<2:parser.error('At least 2 samples required')
    report=estimate(args.game,args.mode,args.samples,args.seed)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report),flush=True)
