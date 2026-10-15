"""Independent full-round estimates for the eight remaining games.

Condition only the initial paid trigger choice (or scatter-count family).
Every free spin, wheel, collection, retrigger and shared cap still runs.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
GAMES=['dede','prenses','seker','balikci','dogparty','altin','kure','firavun']


def condition_config(game,mode,config,triggered):
    cfg=copy.deepcopy(config)
    factor=2 if mode=='ante' and game in ['dede','prenses','kure'] else 1
    if game in ['dede','prenses','dogparty','altin','firavun']:
        probability=cfg['bonusTrigger']*factor
        cfg['bonusTrigger']=int(triggered)/factor
    elif game in ['seker','balikci']:
        key='anteScatters' if mode=='ante' else 'scatters'
        threshold=4 if game=='seker' else 3
        weights=cfg[key];probability=sum(weights[threshold:])/sum(weights)
        cfg[key]=[w if (i>=threshold)==triggered else 0 for i,w in enumerate(weights)]
    elif game=='kure':
        weights=cfg['baseScatterCountWeights'];rate=cfg['scatterRate']*factor
        positive=sum(weights);probability=rate*sum(weights[2:])/positive
        if triggered:
            cfg['scatterRate']=1/factor
            cfg['baseScatterCountWeights']=[0,0]+weights[2:]
        else:
            cfg['scatterRate']=(rate*sum(weights[:2])/positive/(1-probability))/factor
            cfg['baseScatterCountWeights']=weights[:2]+[0]*4
    else:raise ValueError('Unsupported game')
    return probability,cfg


def estimate(game,mode,samples,seed):
    path=ROOT/'tests'/('prenses_simulate.py' if game=='dede' else game+'_simulate.py')
    spec=importlib.util.spec_from_file_location('remaining_'+game,path)
    simulator=importlib.util.module_from_spec(spec);spec.loader.exec_module(simulator)
    if game=='dede':
        sp=importlib.util.spec_from_file_location('remaining_dede_engine',ROOT/'backend/app/dede_engine.py')
        simulator.e=importlib.util.module_from_spec(sp);sp.loader.exec_module(simulator.e)
    engine=getattr(simulator,'e',None) or simulator.m
    original=copy.deepcopy(engine.CONFIG);strata=[];p=None
    for condition in [False,True]:
        p,cfg=condition_config(game,mode,original,condition)
        engine.CONFIG.clear();engine.CONFIG.update(cfg)
        try:
            r=simulator.simulate(samples,seed+int(condition)) if game in ['balikci','dogparty'] else simulator.simulate(samples,mode,seed+int(condition))
        finally:
            engine.CONFIG.clear();engine.CONFIG.update(original)
        r.pop('config',None)
        strata.append(dict(condition=condition,weight=p if condition else 1-p,report=r))
    mean=sum(s['weight']*s['report']['rtp'] for s in strata)
    half=math.sqrt(sum((s['weight']*(s['report']['ci95'][1]-s['report']['ci95'][0])/2)**2 for s in strata))
    files=[ROOT/'backend/app'/f'{game}_engine.py',ROOT/'backend/app'/f'{game}-math.json',path,Path(__file__)]
    return dict(game=game,mode=mode,modelVersion=original['version'],method='initial-choice-stratification',
                samples=2*samples,samplesPerStratum=samples,seed=seed,triggerChoiceProbability=p,
                rtp=mean,ci95=[mean-half,mean+half],strata=strata,certified=False,
                note='Conditioned first trigger choice/scatter family, weighted back to live probabilities. Full rounds and cap included; not certified RTP.',
                source_sha256={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in files})


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('game',choices=GAMES)
    parser.add_argument('mode',choices=['normal','ante'])
    parser.add_argument('--samples',type=int,default=100000)
    parser.add_argument('--seed',type=int,default=26101641)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    if args.samples<2:parser.error('At least two samples required')
    if args.mode=='ante' and args.game not in ['dede','prenses','seker','kure']:parser.error('No ante mode for this game')
    result=estimate(args.game,args.mode,args.samples,args.seed)
    args.out.parent.mkdir(exist_ok=True,parents=True)
    args.out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
